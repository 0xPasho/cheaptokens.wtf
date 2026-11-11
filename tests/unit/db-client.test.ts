// @vitest-environment node
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, getDb } from "@/lib/db/client";

vi.mock("pg", async (importOriginal) => {
  const pg = await importOriginal<typeof import("pg")>();
  return { ...pg, Pool: vi.fn(class extends pg.Pool {}) };
});

describe("database connection pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("DATABASE_POOL_MAX", undefined);
  });

  afterEach(async () => {
    await closeDb();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["postgres://postgres:postgres@127.0.0.1:5433/postgres", 1],
    ["postgresql://postgres:postgres@localhost:5433/postgres", 1],
    ["postgres://postgres:postgres@LOCALHOST/postgres", 1],
    ["postgres://user:password@ep-example.neon.tech/database?sslmode=require", 10],
    ["postgres://user:localhost@db.example.com/127.0.0.1", 10],
    ["postgres://user:password@localhost.example.com/database", 10],
  ])("uses the default pool size for %s", (databaseUrl, max) => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    const db = getDb();
    expect(Pool).toHaveBeenCalledExactlyOnceWith({ connectionString: databaseUrl, max });
    expect(getDb()).toBe(db);
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it.each([
    "postgres://postgres:postgres@127.0.0.1:5433/postgres",
    "postgres://user:password@ep-example.neon.tech/database",
  ])("uses DATABASE_POOL_MAX for %s", (databaseUrl) => {
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_POOL_MAX", "4");
    getDb();
    expect(Pool).toHaveBeenCalledExactlyOnceWith({ connectionString: databaseUrl, max: 4 });
  });

  it("logs an idle connection error without throwing or logging connection details", () => {
    vi.stubEnv("DATABASE_URL", "postgres://private-user:private-password@db.example.com/database");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getDb();
    const pool = vi.mocked(Pool).mock.instances[0];
    const error = Object.assign(new Error("Connection terminated unexpectedly"), {
      connectionString: process.env.DATABASE_URL,
      parameters: ["private-query-parameter"],
    });

    expect(() => pool.emit("error", error)).not.toThrow();
    expect(log).toHaveBeenCalledExactlyOnceWith("Unexpected error on idle database connection", error.message);
  });
});
