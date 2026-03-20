import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingGenerator } from "../memory.ts";
import { decodeEmbedding } from "./embedding-codec.ts";
import { initializeMemoryDatabase, runSqliteMigrations, type SqliteMigration } from "./index.ts";
import { createMemorySchemaMigration } from "./migrations/001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./migrations/002-add-memory-embedding.ts";
import { createMemoryMigrations } from "./migrations/index.ts";

describe("sqlite-db", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-bun-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("bootstraps the memory schema", async () => {
    const databasePath = join(directory, "memory.db");
    const database = new Database(databasePath);

    await initializeMemoryDatabase(database);

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memories', 'memories_fts') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    database.close();

    expect(tables).toEqual([{ name: "memories" }, { name: "memories_fts" }]);
  });

  it("stores the required embedding column after initialization", async () => {
    const databasePath = join(directory, "memory.db");
    const database = new Database(databasePath);

    await initializeMemoryDatabase(database);

    const columns = database.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string; notnull: number }>;
    const versions = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;

    database.close();

    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "content",
      "workspace",
      "embedding",
      "created_at",
      "updated_at",
    ]);
    expect(columns.find((column) => column.name === "embedding")?.notnull).toBe(1);
    expect(versions[0]?.user_version).toBe(2);
  });

  it("backfills embeddings before making the column required", async () => {
    const databasePath = join(directory, "migration-backfill.db");
    const database = new Database(databasePath);
    const embeddingService: EmbeddingGenerator = {
      async createVector(text: string) {
        return [text.length, 0.5, 0.25];
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration]);
    database
      .prepare("INSERT INTO memories (id, content, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("memory-1", "Backfill me.", "/repo", 1, 1);

    await runSqliteMigrations(database, [
      createMemorySchemaMigration,
      createAddMemoryEmbeddingMigration(embeddingService),
    ]);

    const columns = database.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string; notnull: number }>;
    const storedRows = database.prepare("SELECT embedding FROM memories WHERE id = ?").all("memory-1") as Array<{
      embedding: Uint8Array;
    }>;
    const ftsRows = database
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?")
      .all("Backfill") as Array<{ rowid: number }>;

    database.close();

    expect(columns.find((column) => column.name === "embedding")?.notnull).toBe(1);
    expect(decodeEmbedding(storedRows[0]?.embedding)).toEqual([12, 0.5, 0.25]);
    expect(ftsRows).toHaveLength(1);
  });

  it("uses the provided embedding service for migration backfills in the default migration set", async () => {
    const databasePath = join(directory, "migration-open.db");
    const database = new Database(databasePath);
    const embeddingService: EmbeddingGenerator & { calls: string[] } = {
      calls: [],
      async createVector(text: string) {
        this.calls.push(text);
        return [text.length, 0.5, 0.25];
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration]);
    database
      .prepare("INSERT INTO memories (id, content, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("memory-1", "Backfill me.", "/repo", 1, 1);
    await initializeMemoryDatabase(database, createMemoryMigrations(embeddingService));

    const storedRows = database.prepare("SELECT embedding FROM memories WHERE id = ?").all("memory-1") as Array<{
      embedding: Uint8Array;
    }>;

    database.close();

    expect(embeddingService.calls).toEqual(["Backfill me."]);
    expect(decodeEmbedding(storedRows[0]?.embedding)).toEqual([12, 0.5, 0.25]);
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

    await expect(initializeMemoryDatabase(database)).rejects.toMatchObject({
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

    await expect(runSqliteMigrations(database, migrations)).rejects.toThrow(
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

    await expect(
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
