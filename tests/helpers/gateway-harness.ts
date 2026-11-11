import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { CATALOG } from "@catalog/models";
import { UPSTREAMS } from "@catalog/upstreams";

import { grantCredits, usdToMicroUsdExact } from "@/lib/billing/ledger";
import { createApiKey, ensureDevWorkspace } from "@/lib/billing/workspaces";
import { syncCatalog } from "@/lib/catalog/sync";
import type { CatalogEntry, UpstreamDefinition } from "@/lib/catalog/types";
import { uuidv7 } from "@/lib/db/uuid";
import { readServerEnv, type EnvSource } from "@/lib/env";
import { createCatalogSource, loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { handleChatCompletion } from "@/lib/gateway/handler";
import { createJsonLogger } from "@/lib/gateway/logger";
import type { GatewayDeps } from "@/lib/gateway/types";
import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";

import { createTestDb } from "./db";
import { startMockUpstream } from "./mock-upstream";

export interface GatewayHarnessOptions {
  upstreams?: UpstreamDefinition[];
  models?: CatalogEntry[];
  balanceUsd?: string | number;
  env?: EnvSource;
}

async function serve(request: IncomingMessage, response: ServerResponse, deps: GatewayDeps): Promise<void> {
  const abort = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const disconnect = () => {
    if (response.writableFinished) return;
    abort.abort();
    void reader?.cancel().catch(() => {});
  };
  response.once("close", disconnect);
  request.once("aborted", disconnect);
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    const init: RequestInit & { duplex: "half" } = {
      method: request.method, headers, signal: abort.signal, duplex: "half",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    }
    const result = await handleChatCompletion(new Request(`http://${headers.get("host")}${request.url}`, init), deps);
    if (response.destroyed) {
      await result.body?.cancel();
      return;
    }
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.flushHeaders();
    if (result.body) {
      reader = result.body.getReader();
      while (!response.destroyed) {
        const { done, value } = await reader.read();
        if (done || response.destroyed) break;
        if (!response.write(value)) {
          // Un cierre también libera la espera de backpressure.
          await new Promise<void>((resolve) => {
            const finish = () => {
              response.off("drain", finish);
              response.off("close", finish);
              resolve();
            };
            response.once("drain", finish);
            response.once("close", finish);
          });
        }
      }
    }
    if (!response.destroyed) response.end();
  } catch {
    if (!response.destroyed) {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    }
  } finally {
    reader?.releaseLock();
    request.off("aborted", disconnect);
    response.off("close", disconnect);
  }
}

export async function startGatewayHarness(options: GatewayHarnessOptions = {}) {
  const mock = await startMockUpstream();
  const database = await createTestDb();
  const { db } = database;
  const logs: string[] = [];
  const tasks: Promise<void>[] = [];
  const flushAfter = async () => {
    while (tasks.length > 0) await Promise.all(tasks.splice(0));
  };
  try {
    await syncCatalog(db, { models: options.models ?? CATALOG, upstreams: options.upstreams ?? UPSTREAMS, environment: "development" });
    // No heredamos process.env: una key local jamás activa la red en pruebas.
    const env: EnvSource = { UPSTREAM_MOCK_BASE_URL: mock.baseUrl, ...options.env };
    const catalog = createCatalogSource(() => loadCatalogSnapshot(db, { env, environment: "development", now: Date.now }));
    const workspace = await ensureDevWorkspace(db, "gateway-harness");
    const balance = usdToMicroUsdExact(String(options.balanceUsd ?? 5));
    if (balance !== BigInt(0)) await grantCredits(db, { workspaceId: workspace.id, amountMicroUsd: balance, note: "Gateway harness" });
    const key = await createApiKey(db, { workspaceId: workspace.id, name: "Gateway harness", spendLimitMicroUsd: null });
    const deps: GatewayDeps = {
      db, catalog, rateLimiter: createMemoryRateLimiter(), fetch, now: Date.now, newId: uuidv7,
      log: createJsonLogger((line) => logs.push(line)), env: readServerEnv(env),
      after(task) { tasks.push(Promise.resolve().then(task)); },
    };
    const server = createServer((request, response) => { void serve(request, response, deps); });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Gateway did not bind a TCP port");
    let closing: Promise<void> | undefined;
    return {
      baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: key.key,
      workspaceId: workspace.id, apiKeyId: key.id, db, mock, logs, flushAfter,
      close(): Promise<void> {
        closing ??= (async () => {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
          });
          try { await flushAfter(); } finally {
            await mock.close();
            await database.close();
          }
        })();
        return closing;
      },
    };
  } catch (error) {
    await mock.close();
    await database.close();
    throw error;
  }
}
