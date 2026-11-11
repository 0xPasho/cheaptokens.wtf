import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readServerEnv } from "@/lib/env";

import * as schema from "./schema";
import type { Db } from "./types";

let connection: { pool: Pool; db: Db } | undefined;

export function getDb(): Db {
  if (connection) return connection.db;
  const { databaseUrl } = readServerEnv();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to connect to the database");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  connection = { pool, db };
  return db;
}

export async function closeDb(): Promise<void> {
  const current = connection;
  connection = undefined;
  await current?.pool.end();
}
