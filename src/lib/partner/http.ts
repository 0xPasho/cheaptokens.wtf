/**
 * La puerta de socios por HTTP (docs/17): `/partner/v1/*`, de servidor a servidor. Bearer con el secreto del
 * socio, JSON en los dos sentidos, `Idempotency-Key` en cada escritura y el dinero en µUSD enteros.
 *
 * Los route handlers de `src/app/partner/v1/` solo llaman a estas funciones con sus dependencias, como el
 * gateway (ADR-0033): así las pruebas usan PGlite sin levantar Next.
 */
import { z } from "zod";

import type { Db } from "@/lib/db/types";
import { type EnvSource, readServerEnv } from "@/lib/env";
import { createJsonLogger } from "@/lib/gateway/logger";
import type { Logger } from "@/lib/gateway/types";

import { authenticatePartner, idempotencySealKey, type PartnerId } from "./auth";
import { PartnerDoorError, partnerErrorResponse } from "./errors";
import { fingerprint, MAX_IDEMPOTENCY_KEY_LENGTH, type StoredAnswer, withIdempotency } from "./idempotency";
import { fromPublicId, type PublicIdPrefix } from "./ids";
import { USAGE_MONTH } from "./months";
import { changePlan, closePlan, issueKey, MAX_EXTRA_CAP_MICRO_USD, openPlan, planUsage, revokeKey, setExtraCap } from "./service";
import { PARTNER_TIERS } from "./tiers";

export interface PartnerDeps {
  db: Db;
  /** Milisegundos Unix. */
  now: () => number;
  env: EnvSource;
  log?: Logger;
}

const MAX_BODY_BYTES = 16_384;
const defaultLog = createJsonLogger();

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const tier = z.enum(PARTNER_TIERS);
const empty = z.object({}).loose();

const bodies = {
  openPlan: z.object({
    externalRef: z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/),
    tier,
    paidThrough: isoDate,
  }),
  changePlan: z.object({ tier: tier.optional(), paidThrough: isoDate.optional() }),
  issueKey: z.object({ expiresAt: isoDate }),
  extraCap: z.object({ capMicroUsd: z.number().int().min(0).max(Number(MAX_EXTRA_CAP_MICRO_USD)).nullable() }),
};

function json(status: number, body: unknown): StoredAnswer {
  return { status, body: JSON.stringify(body) };
}

const NO_CONTENT: StoredAnswer = { status: 204, body: null };

function toResponse(answer: StoredAnswer): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (answer.body !== null) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(answer.body, { status: answer.status, headers });
}

async function readBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) throw new PartnerDoorError("request_too_large");
  const text = await request.text().catch(() => {
    throw new PartnerDoorError("invalid_request");
  });
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new PartnerDoorError("request_too_large");
  return text;
}

function parse<T extends z.ZodType>(schema: T, raw: string): z.infer<T> {
  let value: unknown;
  try {
    value = raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    throw new PartnerDoorError("invalid_request");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PartnerDoorError("invalid_request");
  return parsed.data;
}

function internalId(prefix: PublicIdPrefix, publicId: string): string {
  const id = fromPublicId(prefix, publicId);
  if (!id) throw new PartnerDoorError("not_found");
  return id;
}

/** La base que llaman las keys: `https://<API_HOST>/v1`, o el origen de este request sin `API_HOST` (local). */
function inferenceBaseUrl(request: Request, env: EnvSource): string {
  const apiHost = readServerEnv(env).apiHost;
  return apiHost ? `https://${apiHost}/v1` : `${new URL(request.url).origin}/v1`;
}

interface Call {
  partnerId: PartnerId;
  raw: string;
  /** La base o, en una escritura idempotente, la transacción de su `Idempotency-Key`. */
  db: Db;
}

/**
 * Auth, body, `Idempotency-Key` y errores, iguales en todas las rutas. `idempotent: "store"` guarda la
 * respuesta por key; `"domain"` (abrir un plan) la resuelve el propio dominio (docs/17 › Idempotencia).
 */
async function serve(
  request: Request,
  deps: PartnerDeps,
  route: string,
  mode: "read" | "store" | "domain",
  run: (call: Call) => Promise<StoredAnswer>,
): Promise<Response> {
  try {
    const partnerId = authenticatePartner(request.headers.get("authorization"), deps.env);
    if (!partnerId) return partnerErrorResponse("unauthorized");
    if (mode === "read") return toResponse(await run({ partnerId, raw: "", db: deps.db }));

    const key = request.headers.get("idempotency-key");
    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(key)) throw new PartnerDoorError("invalid_request");
    const raw = await readBody(request);
    if (mode === "domain") return toResponse(await run({ partnerId, raw, db: deps.db }));

    const answer = await withIdempotency(deps.db, {
      partnerId,
      key,
      fingerprint: fingerprint(request.method, new URL(request.url).pathname, raw),
      sealKey: idempotencySealKey(partnerId, deps.env),
      now: deps.now(),
    }, (tx) => run({ partnerId, raw, db: tx }));
    return toResponse(answer);
  } catch (error) {
    if (error instanceof PartnerDoorError) return partnerErrorResponse(error.code);
    // Sin el mensaje: un error de la base puede traer datos del request.
    (deps.log ?? defaultLog).error("partner_door_failed", { route });
    return partnerErrorResponse("internal_error");
  }
}

/** `POST /partner/v1/plans`: idempotente por `externalRef` (un plan abierto con esa referencia se contesta otra vez). */
export function openPlanRoute(request: Request, deps: PartnerDeps): Promise<Response> {
  return serve(request, deps, "open_plan", "domain", async ({ partnerId, raw, db }) => {
    const body = parse(bodies.openPlan, raw);
    return json(200, await openPlan(db, {
      partnerId, externalRef: body.externalRef, tier: body.tier, paidThrough: body.paidThrough,
      now: deps.now(), inferenceBaseUrl: inferenceBaseUrl(request, deps.env),
    }));
  });
}

/** `PATCH /partner/v1/plans/{planId}` */
export function changePlanRoute(request: Request, deps: PartnerDeps, planId: string): Promise<Response> {
  return serve(request, deps, "change_plan", "store", async ({ partnerId, raw, db }) => {
    const body = parse(bodies.changePlan, raw);
    return json(200, await changePlan(db, {
      partnerId, planId: internalId("plan", planId), tier: body.tier, paidThrough: body.paidThrough,
      inferenceBaseUrl: inferenceBaseUrl(request, deps.env),
    }));
  });
}

/** `POST /partner/v1/plans/{planId}/close` */
export function closePlanRoute(request: Request, deps: PartnerDeps, planId: string): Promise<Response> {
  return serve(request, deps, "close_plan", "store", async ({ partnerId, raw, db }) => {
    parse(empty, raw);
    await closePlan(db, { partnerId, planId: internalId("plan", planId), now: deps.now() });
    return NO_CONTENT;
  });
}

/** `POST /partner/v1/plans/{planId}/keys`: la única respuesta con una key en claro. */
export function issueKeyRoute(request: Request, deps: PartnerDeps, planId: string): Promise<Response> {
  return serve(request, deps, "issue_key", "store", async ({ partnerId, raw, db }) => {
    const body = parse(bodies.issueKey, raw);
    return json(200, await issueKey(db, { partnerId, planId: internalId("plan", planId), expiresAt: body.expiresAt, now: deps.now() }));
  });
}

/** `POST /partner/v1/keys/{keyId}/revoke` */
export function revokeKeyRoute(request: Request, deps: PartnerDeps, keyId: string): Promise<Response> {
  return serve(request, deps, "revoke_key", "store", async ({ partnerId, raw, db }) => {
    parse(empty, raw);
    await revokeKey(db, { partnerId, keyId: internalId("key", keyId), now: deps.now() });
    return NO_CONTENT;
  });
}

/** `GET /partner/v1/plans/{planId}/usage?month=YYYY-MM`: sin `month`, el mes UTC actual; mal formado, 400. */
export function usageRoute(request: Request, deps: PartnerDeps, planId: string): Promise<Response> {
  return serve(request, deps, "usage", "read", async ({ partnerId, db }) => {
    const month = new URL(request.url).searchParams.get("month");
    if (month !== null && !USAGE_MONTH.test(month)) throw new PartnerDoorError("invalid_request");
    return json(200, await planUsage(db, { partnerId, planId: internalId("plan", planId), now: deps.now(), month: month ?? undefined }));
  });
}

/** `PUT /partner/v1/plans/{planId}/extra-cap` */
export function extraCapRoute(request: Request, deps: PartnerDeps, planId: string): Promise<Response> {
  return serve(request, deps, "extra_cap", "store", async ({ partnerId, raw, db }) => {
    const body = parse(bodies.extraCap, raw);
    await setExtraCap(db, {
      partnerId, planId: internalId("plan", planId), capMicroUsd: body.capMicroUsd === null ? null : BigInt(body.capMicroUsd), now: deps.now(),
    });
    return NO_CONTENT;
  });
}
