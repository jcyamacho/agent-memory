import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeMemoryDatabase } from "./sqlite-db.ts";

describe("sqlite-db", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-bun-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("bootstraps the memory schema", () => {
    const databasePath = join(directory, "memory.db");
    const database = new Database(databasePath);

    initializeMemoryDatabase(database);

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memories', 'memories_fts') ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    database.close();

    expect(tables).toEqual([{ name: "memories" }, { name: "memories_fts" }]);
  });

  it("initializes pragma settings when pragma is available", () => {
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
        throw new Error("prepare should not be called");
      },
      close() {},
    };

    initializeMemoryDatabase(database);

    expect(pragmaCalls).toEqual([
      "journal_mode = WAL",
      "synchronous = NORMAL",
      "foreign_keys = ON",
      "busy_timeout = 5000",
    ]);
    expect(executedSql).toHaveLength(1);
    expect(executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS memories");
  });
});
