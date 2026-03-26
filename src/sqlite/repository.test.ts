import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateMemoryEntityInput, MemoryEntity } from "../memory.ts";
import { toNormalizedScore } from "../memory.ts";
import { createPassthroughWorkspaceResolver } from "../workspace-resolver.ts";
import { initializeMemoryDatabase, type SqliteDatabaseLike, SqliteMemoryRepository } from "./index.ts";
import { createMemoryMigrations } from "./migrations/index.ts";

const DEFAULT_EMBEDDING = [0.25, 0.5, 0.75];
const UPDATED_EMBEDDING = [0.5, 0.25, 0.125];

function createTestMigrations() {
  return createMemoryMigrations({
    embeddingService: {
      async createVector(text: string) {
        return [text.length, 0.5, 0.25];
      },
    },
    workspaceResolver: createPassthroughWorkspaceResolver(),
  });
}

describe("SqliteMemoryRepository", () => {
  let directory: string;
  let database: SqliteDatabaseLike;
  let repository: SqliteMemoryRepository;

  async function createMemory(input: CreateMemoryEntityInput | MemoryEntity): Promise<MemoryEntity> {
    if ("id" in input) {
      database
        .prepare(
          "INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          input.id,
          input.content,
          input.workspace ?? null,
          new Uint8Array(new Float32Array(input.embedding).buffer.slice(0)),
          input.createdAt.getTime(),
          input.updatedAt.getTime(),
        );

      return input;
    }

    return repository.create(input);
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-bun-test-"));
    const databasePath = join(directory, "memory.db");

    database = new Database(databasePath);
    await initializeMemoryDatabase(database, createTestMigrations());
    repository = new SqliteMemoryRepository(database);
  });

  afterEach(async () => {
    database.close();
    await rm(directory, { force: true, recursive: true });
  });

  it("creates using the repository input and returns the stored embedding", async () => {
    const result = await repository.create({
      content: "Use SQLite WAL mode when multiple MCP clients share the same file.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/repo-a",
    });

    const storedRows = database
      .prepare(
        "SELECT typeof(embedding) AS embedding_type, length(embedding) AS embedding_length FROM memories WHERE id = ?",
      )
      .all(result.id) as Array<{
      embedding_type: string;
      embedding_length: number;
    }>;

    expect(result.id.length).toBeGreaterThan(0);
    expect(result.embedding).toEqual(DEFAULT_EMBEDDING);
    expect(result.workspace).toBe("/repo-a");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(result.updatedAt.getTime());
    expect(storedRows).toEqual([{ embedding_type: "blob", embedding_length: 12 }]);
  });

  it("bootstraps schema and can create and search indexed memories", async () => {
    const createdAt = new Date("2026-03-07T10:00:00.000Z");

    await createMemory({
      id: "memory-1",
      content: "Use SQLite WAL mode when multiple MCP clients share the same file.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/repo-a",
      createdAt,
      updatedAt: createdAt,
    });

    const results = await repository.search({
      terms: ["SQLite", "WAL", "file"],
      limit: 5,
    });

    const storedRows = database
      .prepare(
        "SELECT typeof(created_at) AS created_at_type, created_at, typeof(embedding) AS embedding_type FROM memories WHERE id = ?",
      )
      .all("memory-1") as Array<{
      created_at_type: string;
      created_at: number;
      embedding_type: string;
    }>;

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("memory-1");
    expect(results[0]?.workspace).toBe("/repo-a");
    expect(results[0]?.embedding).toEqual(DEFAULT_EMBEDDING);
    expect(results[0]?.score).toBe(toNormalizedScore(1));
    expect(results[0]?.createdAt).toBeInstanceOf(Date);
    expect(results[0]?.updatedAt).toBeInstanceOf(Date);
    expect(results[0]?.updatedAt.getTime()).toBe(createdAt.getTime());
    expect(storedRows).toEqual([
      { created_at_type: "integer", created_at: createdAt.getTime(), embedding_type: "blob" },
    ]);
  });

  it("supports hyphenated search queries", async () => {
    const createdAt = new Date("2026-03-08T00:00:00.000Z");

    await createMemory({
      id: "memory-2",
      content: "verification-memory-entry-2026-03-08",
      embedding: DEFAULT_EMBEDDING,
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

    await createMemory({
      id: "memory-3",
      content: "Prefer shared sqlite decisions for cross-client coordination.",
      embedding: DEFAULT_EMBEDDING,
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

    await createMemory({
      id: "memory-4",
      content: "Always use WAL mode for concurrent reads in SQLite.",
      embedding: DEFAULT_EMBEDDING,
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

    await createMemory({
      id: "memory-5",
      content: "Use configuration files for environment-specific settings.",
      embedding: DEFAULT_EMBEDDING,
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

    await createMemory({
      id: "memory-6",
      content: "Running database migrations requires careful planning.",
      embedding: DEFAULT_EMBEDDING,
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

  it("filters results by updatedAfter", async () => {
    const old = new Date("2026-03-01T00:00:00.000Z");
    const recent = new Date("2026-03-10T00:00:00.000Z");

    await createMemory({
      id: "old",
      content: "SQLite WAL mode.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: old,
      updatedAt: old,
    });
    await createMemory({
      id: "recent",
      content: "SQLite WAL mode.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: recent,
      updatedAt: recent,
    });

    const results = await repository.search({
      terms: ["SQLite"],
      limit: 10,
      updatedAfter: new Date("2026-03-05T00:00:00.000Z"),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("recent");
  });

  it("filters results by updatedBefore", async () => {
    const old = new Date("2026-03-01T00:00:00.000Z");
    const recent = new Date("2026-03-10T00:00:00.000Z");

    await createMemory({
      id: "old",
      content: "SQLite WAL mode.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: old,
      updatedAt: old,
    });
    await createMemory({
      id: "recent",
      content: "SQLite WAL mode.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: recent,
      updatedAt: recent,
    });

    const results = await repository.search({
      terms: ["SQLite"],
      limit: 10,
      updatedBefore: new Date("2026-03-05T00:00:00.000Z"),
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

    await createMemory({
      id: "higher-score",
      content: "SQLite database engine database database database.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/repo-other",
      createdAt,
      updatedAt: createdAt,
    });

    await createMemory({
      id: "preferred-workspace",
      content: "SQLite is a great embedded database engine.",
      embedding: DEFAULT_EMBEDDING,
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

  it("get returns a memory by id with its embedding", async () => {
    const createdAt = new Date("2026-03-07T00:00:00.000Z");

    await createMemory({
      id: "find-me",
      content: "Findable memory.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/repo-a",
      createdAt,
      updatedAt: createdAt,
    });

    const result = await repository.get("find-me");

    expect(result).toBeDefined();
    expect(result?.id).toBe("find-me");
    expect(result?.content).toBe("Findable memory.");
    expect(result?.embedding).toEqual(DEFAULT_EMBEDDING);
    expect(result?.workspace).toBe("/repo-a");
    expect(result?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("get returns undefined for nonexistent id", async () => {
    const result = await repository.get("nonexistent");

    expect(result).toBeUndefined();
  });

  it("list returns memories newest-first with limit", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await createMemory({ id: "m1", content: "First.", embedding: DEFAULT_EMBEDDING, createdAt: t1, updatedAt: t1 });
    await createMemory({ id: "m2", content: "Second.", embedding: DEFAULT_EMBEDDING, createdAt: t2, updatedAt: t2 });
    await createMemory({ id: "m3", content: "Third.", embedding: DEFAULT_EMBEDDING, createdAt: t3, updatedAt: t3 });

    const page = await repository.list({ offset: 0, limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe("m3");
    expect(page.items[0]?.embedding).toEqual(DEFAULT_EMBEDDING);
    expect(page.items[1]?.id).toBe("m2");
    expect(page.hasMore).toBe(true);
  });

  it("list supports offset-based pagination", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await createMemory({ id: "m1", content: "First.", embedding: DEFAULT_EMBEDDING, createdAt: t1, updatedAt: t1 });
    await createMemory({ id: "m2", content: "Second.", embedding: DEFAULT_EMBEDDING, createdAt: t2, updatedAt: t2 });
    await createMemory({ id: "m3", content: "Third.", embedding: DEFAULT_EMBEDDING, createdAt: t3, updatedAt: t3 });

    const page1 = await repository.list({ offset: 0, limit: 2 });
    const page2 = await repository.list({ offset: 2, limit: 2 });

    expect(page1.items.map((memory) => memory.id)).toEqual(["m3", "m2"]);
    expect(page1.hasMore).toBe(true);
    expect(page2.items.map((memory) => memory.id)).toEqual(["m1"]);
    expect(page2.hasMore).toBe(false);
  });

  it("list filters by workspace", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "a1",
      content: "In A.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "b1",
      content: "In B.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/b",
      createdAt: t,
      updatedAt: t,
    });

    const page = await repository.list({ offset: 0, limit: 10, workspace: "/a" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("a1");
  });

  it("list filters by global", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "ws1",
      content: "Has workspace.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "no-ws",
      content: "No workspace.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: t,
      updatedAt: t,
    });

    const page = await repository.list({ offset: 0, limit: 10, global: true });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("no-ws");
  });

  it("list filters by workspace and global together", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "ws-a",
      content: "In A.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "ws-b",
      content: "In B.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/b",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "global",
      content: "Global.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: t,
      updatedAt: t,
    });

    const page = await repository.list({ offset: 0, limit: 10, workspace: "/a", global: true });

    expect(page.items).toHaveLength(2);
    const ids = page.items.map((m) => m.id).sort();
    expect(ids).toEqual(["global", "ws-a"]);
  });

  it("update changes content, replaces embedding, and bumps updated_at", async () => {
    const createdAt = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "to-update",
      content: "Original content.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/repo",
      createdAt,
      updatedAt: createdAt,
    });

    const updated = await repository.update({
      id: "to-update",
      content: "New content.",
      embedding: UPDATED_EMBEDDING,
    });

    expect(updated.content).toBe("New content.");
    expect(updated.embedding).toEqual(UPDATED_EMBEDDING);
    expect(updated.workspace).toBe("/repo");
    expect(updated.createdAt.getTime()).toBe(createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("update syncs FTS index", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "fts-update",
      content: "alpha bravo.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: t,
      updatedAt: t,
    });
    await repository.update({ id: "fts-update", content: "charlie delta.", embedding: UPDATED_EMBEDDING });

    const oldSearch = await repository.search({ terms: ["alpha"], limit: 5 });
    const newSearch = await repository.search({ terms: ["charlie"], limit: 5 });

    expect(oldSearch).toHaveLength(0);
    expect(newSearch).toHaveLength(1);
    expect(newSearch[0]?.id).toBe("fts-update");
    expect(newSearch[0]?.embedding).toEqual(UPDATED_EMBEDDING);
  });

  it("update throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("../errors.ts");

    expect(
      repository.update({ id: "nonexistent", content: "content", embedding: UPDATED_EMBEDDING }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete removes a memory", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "to-delete",
      content: "Delete me.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: t,
      updatedAt: t,
    });
    await repository.delete({ id: "to-delete" });

    const result = await repository.get("to-delete");
    expect(result).toBeUndefined();
  });

  it("delete syncs FTS index", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "fts-delete",
      content: "searchable unique term.",
      embedding: DEFAULT_EMBEDDING,
      createdAt: t,
      updatedAt: t,
    });
    await repository.delete({ id: "fts-delete" });

    const results = await repository.search({ terms: ["searchable"], limit: 5 });
    expect(results).toHaveLength(0);
  });

  it("listWorkspaces returns distinct non-null workspaces sorted", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "a1",
      content: "A.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/z-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "a2",
      content: "A2.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/z-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "b1",
      content: "B.",
      embedding: DEFAULT_EMBEDDING,
      workspace: "/a-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({ id: "g1", content: "Global.", embedding: DEFAULT_EMBEDDING, createdAt: t, updatedAt: t });

    const workspaces = await repository.listWorkspaces();

    expect(workspaces).toEqual(["/a-repo", "/z-repo"]);
  });

  it("delete throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("../errors.ts");

    expect(repository.delete({ id: "nonexistent" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
