import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeMemoryDatabase, runSqliteMigrations, type SqliteMigration } from "./index.ts";

describe("sqlite-db", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-bun-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("initializes pragma settings when pragma is available", async () => {
    const pragmaCalls: string[] = [];
    const executedSql: string[] = [];
    const database = {
      pragma(query: string) {
        pragmaCalls.push(query);
      },
      exec(sql: string) {
        executedSql.push(sql);
      },
      prepare() {
        return {
          all() {
            return [{ user_version: 0 }];
          },
          run() {
            throw new Error("run should not be called");
          },
        };
      },
      close() {},
    };

    await initializeMemoryDatabase(database, [
      {
        version: 1,
        async up(db) {
          db.exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY)");
        },
      },
    ]);

    expect(pragmaCalls).toEqual([
      "journal_mode = WAL",
      "synchronous = NORMAL",
      "foreign_keys = ON",
      "busy_timeout = 5000",
    ]);
    expect(executedSql).toEqual([
      "BEGIN",
      "CREATE TABLE test_table (id INTEGER PRIMARY KEY)",
      "PRAGMA user_version = 1",
      "COMMIT",
    ]);
  });

  it("wraps initialization failures in PersistenceError", async () => {
    const cause = new Error("pragma failed");
    const database = {
      pragma() {
        throw cause;
      },
      exec() {},
      prepare() {
        return {
          all() {
            return [];
          },
          run() {
            throw new Error("run should not be called");
          },
        };
      },
      close() {},
    };

    expect(initializeMemoryDatabase(database, [])).rejects.toMatchObject({
      name: "PersistenceError",
      cause,
      message: "Failed to initialize the SQLite database.",
    });
  });

  it("applies pending migrations in version order and awaits each step", async () => {
    const databasePath = join(directory, "migration-order.db");
    const database = new Database(databasePath);
    const calls: string[] = [];
    const migrations: SqliteMigration[] = [
      {
        version: 1,
        async up(db) {
          calls.push("1:start");
          await Promise.resolve();
          db.exec("CREATE TABLE first_table (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
          calls.push("1:end");
        },
      },
      {
        version: 2,
        async up(db) {
          calls.push("2:start");
          const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'first_table'")
            .all() as Array<{
            name: string;
          }>;
          expect(tables).toEqual([{ name: "first_table" }]);
          db.exec("CREATE TABLE second_table (id INTEGER PRIMARY KEY)");
          calls.push("2:end");
        },
      },
    ];

    await runSqliteMigrations(database, migrations);

    const versions = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;

    database.close();

    expect(calls).toEqual(["1:start", "1:end", "2:start", "2:end"]);
    expect(versions[0]?.user_version).toBe(2);
  });

  it("skips migrations that are already reflected in user_version", async () => {
    const databasePath = join(directory, "migration-skip.db");
    const database = new Database(databasePath);
    const calls: number[] = [];
    const migrations: SqliteMigration[] = [
      {
        version: 1,
        async up() {
          calls.push(1);
        },
      },
      {
        version: 2,
        async up() {
          calls.push(2);
        },
      },
    ];

    database.exec("PRAGMA user_version = 1");

    await runSqliteMigrations(database, migrations);

    const versions = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;

    database.close();

    expect(calls).toEqual([2]);
    expect(versions[0]?.user_version).toBe(2);
  });

  it("rejects migrations that are not in strictly increasing version order", async () => {
    const databasePath = join(directory, "migration-invalid.db");
    const database = new Database(databasePath);
    const migrations: SqliteMigration[] = [
      {
        version: 2,
        async up() {},
      },
      {
        version: 2,
        async up() {},
      },
    ];

    expect(runSqliteMigrations(database, migrations)).rejects.toThrow(
      "SQLite migrations must use strictly increasing versions.",
    );

    database.close();
  });

  it("preserves the original migration error when rollback also fails", async () => {
    const migrationError = new Error("migration failed");
    const database = {
      exec(sql: string) {
        if (sql === "ROLLBACK") {
          throw new Error("rollback failed");
        }
      },
      prepare() {
        return {
          all() {
            return [{ user_version: 0 }];
          },
          run() {
            throw new Error("run should not be called");
          },
        };
      },
      close() {},
    };

    expect(
      runSqliteMigrations(database, [
        {
          version: 1,
          async up() {
            throw migrationError;
          },
        },
      ]),
    ).rejects.toBe(migrationError);
  });
});
