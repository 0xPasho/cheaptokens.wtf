import "./_env";

import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

async function main(): Promise<void> {
  const db = await PGlite.create(resolve(".pglite"));
  const server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 5433, maxConnections: 10 });
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
    await migrate(drizzle(db), { migrationsFolder: resolve("drizzle") });
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
