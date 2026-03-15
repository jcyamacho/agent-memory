import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toNormalizedScore } from "./memory.ts";
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
      workspace: "/repo-a",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["SQLite", "WAL", "file"],
      limit: 5,
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
    expect(results[0]?.score).toBe(toNormalizedScore(1));
    expect(results[0]?.createdAt).toBeInstanceOf(Date);
    expect(results[0]?.updatedAt).toBeInstanceOf(Date);
    expect(results[0]?.updatedAt.getTime()).toBe(createdAt.getTime());
    expect(storedRows).toEqual([{ created_at_type: "integer", created_at: createdAt.getTime() }]);
  });

  it("supports hyphenated search queries", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "memory-2",
      content: "verification-memory-entry-2026-03-08",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["verification-memory-entry-2026-03-08"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-2");
  });

  it("supports phrase terms without splitting them internally", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "memory-3",
      content: "Prefer shared sqlite decisions for cross-client coordination.",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["shared sqlite", "decisions"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-3");
  });

  it("returns partial matches with OR semantics", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "memory-4",
      content: "Always use WAL mode for concurrent reads in SQLite.",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["WAL", "nonexistent"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-4");
  });

  it("matches prefix for single-word terms", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "memory-5",
      content: "Use configuration files for environment-specific settings.",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["config"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-5");
  });

  it("matches stemmed word forms via porter tokenizer", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "memory-6",
      content: "Running database migrations requires careful planning.",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["run", "migration"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-6");
  });

  it("filters results by createdAfter", async () => {
    const old = new Date("2026-03-01T00:00:00.000Z");
    const recent = new Date("2026-03-10T00:00:00.000Z");

    await repository.save({ id: "old", content: "SQLite WAL mode.", createdAt: old, updatedAt: old });
    await repository.save({ id: "recent", content: "SQLite WAL mode.", createdAt: recent, updatedAt: recent });

    const results = await repository.search({
      terms: ["SQLite"],
      limit: 10,
      createdAfter: new Date("2026-03-05T00:00:00.000Z"),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("recent");
  });

  it("filters results by createdBefore", async () => {
    const old = new Date("2026-03-01T00:00:00.000Z");
    const recent = new Date("2026-03-10T00:00:00.000Z");

    await repository.save({ id: "old", content: "SQLite WAL mode.", createdAt: old, updatedAt: old });
    await repository.save({ id: "recent", content: "SQLite WAL mode.", createdAt: recent, updatedAt: recent });

    const results = await repository.search({
      terms: ["SQLite"],
      limit: 10,
      createdBefore: new Date("2026-03-05T00:00:00.000Z"),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("old");
  });

  it("returns an empty array when no documents match", async () => {
    const results = await repository.search({
      terms: ["nonexistent"],
      limit: 5,
    });

    expect(results).toEqual([]);
  });

  it("preserves raw FTS score ordering without service-level workspace reranking", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await repository.save({
      id: "higher-score",
      content: "SQLite database engine database database database.",
      workspace: "/repo-other",
      createdAt,
      updatedAt: createdAt,
    });

    await repository.save({
      id: "preferred-workspace",
      content: "SQLite is a great embedded database engine.",
      workspace: "/repo-preferred",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["SQLite", "database"],
      limit: 5,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]?.id).toBe("higher-score");
    expect(results[0]?.score).toBe(toNormalizedScore(1));
    expect(results[1]?.score).toBeGreaterThan(0);
    expect(results[1]?.score).toBeLessThan(1);
  });

  it("findById returns a memory by id", async () => {
    const createdAt = new Date("2026-03-07T00:00:00.000Z");

    await repository.save({
      id: "find-me",
      content: "Findable memory.",
      workspace: "/repo-a",
      createdAt,
      updatedAt: createdAt,
    });

    const result = await repository.findById("find-me");

    expect(result).toBeDefined();
    expect(result?.id).toBe("find-me");
    expect(result?.content).toBe("Findable memory.");
    expect(result?.workspace).toBe("/repo-a");
    expect(result?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("findById returns undefined for nonexistent id", async () => {
    const result = await repository.findById("nonexistent");

    expect(result).toBeUndefined();
  });

  it("findAll returns memories newest-first with limit", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await repository.save({ id: "m1", content: "First.", createdAt: t1, updatedAt: t1 });
    await repository.save({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t2 });
    await repository.save({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t3 });

    const page = await repository.findAll({ offset: 0, limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe("m3");
    expect(page.items[1]?.id).toBe("m2");
    expect(page.hasMore).toBe(true);
  });

  it("findAll supports offset-based pagination", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await repository.save({ id: "m1", content: "First.", createdAt: t1, updatedAt: t1 });
    await repository.save({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t2 });
    await repository.save({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t3 });

    const page1 = await repository.findAll({ offset: 0, limit: 2 });
    const page2 = await repository.findAll({ offset: 2, limit: 2 });

    expect(page1.items.map((m) => m.id)).toEqual(["m3", "m2"]);
    expect(page1.hasMore).toBe(true);
    expect(page2.items.map((m) => m.id)).toEqual(["m1"]);
    expect(page2.hasMore).toBe(false);
  });

  it("findAll filters by workspace", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "a1", content: "In A.", workspace: "/a", createdAt: t, updatedAt: t });
    await repository.save({ id: "b1", content: "In B.", workspace: "/b", createdAt: t, updatedAt: t });

    const page = await repository.findAll({ offset: 0, limit: 10, workspace: "/a" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("a1");
  });

  it("findAll filters by workspaceIsNull", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "ws1", content: "Has workspace.", workspace: "/a", createdAt: t, updatedAt: t });
    await repository.save({ id: "no-ws", content: "No workspace.", createdAt: t, updatedAt: t });

    const page = await repository.findAll({ offset: 0, limit: 10, workspaceIsNull: true });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("no-ws");
  });

  it("update changes content and bumps updated_at", async () => {
    const createdAt = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({
      id: "to-update",
      content: "Original content.",
      workspace: "/repo",
      createdAt,
      updatedAt: createdAt,
    });

    const updated = await repository.update("to-update", "New content.");

    expect(updated.content).toBe("New content.");
    expect(updated.workspace).toBe("/repo");
    expect(updated.createdAt.getTime()).toBe(createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("update syncs FTS index", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "fts-update", content: "alpha bravo.", createdAt: t, updatedAt: t });
    await repository.update("fts-update", "charlie delta.");

    const oldSearch = await repository.search({ terms: ["alpha"], limit: 5 });
    const newSearch = await repository.search({ terms: ["charlie"], limit: 5 });

    expect(oldSearch).toHaveLength(0);
    expect(newSearch).toHaveLength(1);
    expect(newSearch[0]?.id).toBe("fts-update");
  });

  it("update throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("./errors.ts");

    expect(repository.update("nonexistent", "content")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete removes a memory", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "to-delete", content: "Delete me.", createdAt: t, updatedAt: t });
    await repository.delete("to-delete");

    const result = await repository.findById("to-delete");
    expect(result).toBeUndefined();
  });

  it("delete syncs FTS index", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "fts-delete", content: "searchable unique term.", createdAt: t, updatedAt: t });
    await repository.delete("fts-delete");

    const results = await repository.search({ terms: ["searchable"], limit: 5 });
    expect(results).toHaveLength(0);
  });

  it("listWorkspaces returns distinct non-null workspaces sorted", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await repository.save({ id: "a1", content: "A.", workspace: "/z-repo", createdAt: t, updatedAt: t });
    await repository.save({ id: "a2", content: "A2.", workspace: "/z-repo", createdAt: t, updatedAt: t });
    await repository.save({ id: "b1", content: "B.", workspace: "/a-repo", createdAt: t, updatedAt: t });
    await repository.save({ id: "g1", content: "Global.", createdAt: t, updatedAt: t });

    const workspaces = await repository.listWorkspaces();

    expect(workspaces).toEqual(["/a-repo", "/z-repo"]);
  });

  it("delete throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("./errors.ts");

    expect(repository.delete("nonexistent")).rejects.toBeInstanceOf(NotFoundError);
  });
});
