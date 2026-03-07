import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeMemoryDatabase, type SqliteDatabaseLike } from "./sqlite-db.ts";
import { SqliteMemoryRepository } from "./sqlite-repository.ts";

describe("SqliteMemoryRepository", () => {
  let directory: string;
  let database: SqliteDatabaseLike;
  let repository: SqliteMemoryRepository;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-bun-test-"));
    const databasePath = join(directory, "memory.db");

    database = new Database(databasePath);
    initializeMemoryDatabase(database);
    repository = new SqliteMemoryRepository(database);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { force: true, recursive: true });
  });

  it("bootstraps schema and can save and search indexed memories", async () => {
    const createdAt = new Date("2026-03-07T10:00:00.000Z");

    await repository.save({
      id: "memory-1",
      content: "Use SQLite WAL mode when multiple MCP clients share the same file.",
      source: "codex",
      workspace: "/repo-a",
      session: "session-a",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      query: "SQLite WAL file",
      limit: 5,
      preferredSource: "codex",
      preferredWorkspace: "/repo-a",
    });

    const storedRows = database
      .prepare("SELECT typeof(created_at) AS created_at_type, created_at FROM memories WHERE id = ?")
      .all("memory-1") as Array<{
      created_at_type: string;
      created_at: number;
    }>;

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-1");
    expect(results[0]?.workspace).toBe("/repo-a");
    expect(results[0]?.score).toBeGreaterThan(0);
    expect(results[0]?.createdAt).toBeInstanceOf(Date);
    expect(storedRows).toEqual([{ created_at_type: "integer", created_at: createdAt.getTime() }]);
  });
});
