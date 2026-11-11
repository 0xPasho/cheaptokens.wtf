import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

let template: Promise<PGlite> | undefined;

async function createTemplate(): Promise<PGlite> {
  const client = await PGlite.create();
  try {
    await migrate(drizzle(client, { schema }), { migrationsFolder: resolve("drizzle") });
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function createTestDb(): Promise<{ db: Db; close(): Promise<void> }> {
  // La plantilla nunca recibe escrituras de las pruebas: cada llamada tiene su propio clon.
  template ??= createTemplate();
  const client = await (await template).clone();
  if (!(client instanceof PGlite)) {
    await client.close();
    throw new Error("PGlite.clone() must return a PGlite instance");
  }
  return { db: drizzle(client, { schema }), close: () => client.close() };
}
