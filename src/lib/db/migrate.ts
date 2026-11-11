import { fileURLToPath } from "node:url";

import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Db } from "./types";

export async function migrateNodePostgres(db: Db): Promise<void> {
  if (!(db instanceof NodePgDatabase)) throw new TypeError("Migrations require a node-postgres database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../drizzle/", import.meta.url)) });
}
