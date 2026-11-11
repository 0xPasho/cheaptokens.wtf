import "./_env";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

async function main(): Promise<void> {
  const db = await PGlite.create(resolve(".pglite"));
  // Varias conexiones para que los scripts (reconcile, keys:create…) corran mientras `next dev` está arriba.
  // Lo que evita los errores del multiplexor es que cada proceso use un pool de una conexión (src/lib/db/client.ts).
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 5433, maxConnections: 8 });
  let closing: Promise<void> | undefined;

  function close(): Promise<void> {
    closing ??= (async () => {
      await server.stop();
      await db.close();
    })();
    return closing;
  }

  function onSignal(): void {
    void close().then(() => {
      console.log("Database stopped.");
    }).catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  }

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    await migrate(drizzle(db), {
      migrationsFolder: fileURLToPath(new URL("../drizzle/", import.meta.url)),
    });
    if (closing) return;
    await server.start();
    console.log("DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres");
    console.log("PGlite is ready. Press Ctrl+C to stop.");
  } catch (error) {
    await close();
    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
