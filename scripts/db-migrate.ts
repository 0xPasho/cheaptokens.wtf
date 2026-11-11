import "./_env";

import { closeDb, getDb } from "../src/lib/db/client";
import { migrateNodePostgres } from "../src/lib/db/migrate";

async function main(): Promise<void> {
  try {
    await migrateNodePostgres(getDb());
    console.log("Database migrations applied.");
  } finally {
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
