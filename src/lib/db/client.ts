import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readServerEnv } from "@/lib/env";

import * as schema from "./schema";
import type { Db } from "./types";

let connection: { pool: Pool; db: Db } | undefined;

export function getDb(): Db {
  if (connection) return connection.db;
  const { databaseUrl, databasePoolMax } = readServerEnv();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to connect to the database");

  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  // PGlite por socket no aísla bien varias conexiones; el pool serializa las operaciones locales.
  const max = databasePoolMax ?? (hostname === "127.0.0.1" || hostname === "localhost" ? 1 : 10);
  const pool = new Pool({ connectionString: databaseUrl, max });
  pool.on("error", (error: Error) => {
    console.error("Unexpected error on idle database connection", error.message);
  });
  const db = drizzle(pool, { schema });
  connection = { pool, db };
  return db;
}

export async function closeDb(): Promise<void> {
  const current = connection;
  connection = undefined;
  await current?.pool.end();
}
