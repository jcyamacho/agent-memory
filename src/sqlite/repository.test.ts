import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateMemoryInput, MemoryRecord } from "../memory.ts";
import { createPassthroughWorkspaceResolver } from "../workspace-resolver.ts";
import { initializeMemoryDatabase, type SqliteDatabaseLike, SqliteMemoryRepository } from "./index.ts";
import { createMemoryMigrations } from "./migrations/index.ts";

function createTestMigrations() {
  return createMemoryMigrations({
    workspaceResolver: createPassthroughWorkspaceResolver(),
  });
}

interface CreateMemoryHelperInput {
  id: string;
  content: string;
  workspace?: string;
  createdAt: Date;
  updatedAt: Date;
}

describe("SqliteMemoryRepository", () => {
  let directory: string;
  let database: SqliteDatabaseLike;
  let repository: SqliteMemoryRepository;

  async function createMemory(input: CreateMemoryInput | CreateMemoryHelperInput): Promise<MemoryRecord> {
    if ("id" in input) {
      database
        .prepare("INSERT INTO memories (id, content, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(input.id, input.content, input.workspace ?? null, input.createdAt.getTime(), input.updatedAt.getTime());

      return {
        id: input.id,
        content: input.content,
        workspace: input.workspace,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
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

  it("creates a memory and returns the stored record", async () => {
    const result = await repository.create({
      content: "Use SQLite WAL mode when multiple MCP clients share the same file.",
      workspace: "/repo-a",
    });

    expect(result.id.length).toBeGreaterThan(0);
    expect(result.content).toBe("Use SQLite WAL mode when multiple MCP clients share the same file.");
    expect(result.workspace).toBe("/repo-a");
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(result.updatedAt.getTime());
  });

  it("creates a global memory when workspace is omitted", async () => {
    const result = await repository.create({
      content: "Global preference.",
    });

    expect(result.id.length).toBeGreaterThan(0);
    expect(result.workspace).toBeUndefined();
  });

  it("get returns a memory by id", async () => {
    const createdAt = new Date("2026-03-07T00:00:00.000Z");

    await createMemory({
      id: "find-me",
      content: "Findable memory.",
      workspace: "/repo-a",
      createdAt,
      updatedAt: createdAt,
    });

    const result = await repository.get("find-me");

    expect(result).toBeDefined();
    expect(result?.id).toBe("find-me");
    expect(result?.content).toBe("Findable memory.");
    expect(result?.workspace).toBe("/repo-a");
    expect(result?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("get returns undefined for nonexistent id", async () => {
    const result = await repository.get("nonexistent");

    expect(result).toBeUndefined();
  });

  it("list returns memories newest-first by updated_at with limit", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await createMemory({ id: "m1", content: "First.", createdAt: t1, updatedAt: t1 });
    await createMemory({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t2 });
    await createMemory({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t3 });

    const page = await repository.list({ offset: 0, limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.id).toBe("m3");
    expect(page.items[1]?.id).toBe("m2");
    expect(page.hasMore).toBe(true);
  });

  it("list sorts by updated_at not created_at", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    // m1 created first but updated last
    await createMemory({ id: "m1", content: "First.", createdAt: t1, updatedAt: t3 });
    // m2 created second but updated earliest
    await createMemory({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t1 });
    // m3 created last but updated in the middle
    await createMemory({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t2 });

    const page = await repository.list({ offset: 0, limit: 10 });

    expect(page.items.map((m) => m.id)).toEqual(["m1", "m3", "m2"]);
  });

  it("list supports offset-based pagination", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await createMemory({ id: "m1", content: "First.", createdAt: t1, updatedAt: t1 });
    await createMemory({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t2 });
    await createMemory({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t3 });

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
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "b1",
      content: "In B.",
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
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "no-ws",
      content: "No workspace.",
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
      workspace: "/a",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "ws-b",
      content: "In B.",
      workspace: "/b",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "global",
      content: "Global.",
      createdAt: t,
      updatedAt: t,
    });

    const page = await repository.list({ offset: 0, limit: 10, workspace: "/a", global: true });

    expect(page.items).toHaveLength(2);
    const ids = page.items.map((m) => m.id).sort();
    expect(ids).toEqual(["global", "ws-a"]);
  });

  it("update changes content and bumps updated_at", async () => {
    const createdAt = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "to-update",
      content: "Original content.",
      workspace: "/repo",
      createdAt,
      updatedAt: createdAt,
    });

    const updated = await repository.update({
      id: "to-update",
      content: "New content.",
    });

    expect(updated.content).toBe("New content.");
    expect(updated.workspace).toBe("/repo");
    expect(updated.createdAt.getTime()).toBe(createdAt.getTime());
    expect(updated.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  it("update syncs FTS index", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "fts-update",
      content: "alpha bravo.",
      createdAt: t,
      updatedAt: t,
    });
    await repository.update({ id: "fts-update", content: "charlie delta." });

    const oldFts = database
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?")
      .all("alpha") as unknown[];
    const newFts = database
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?")
      .all("charlie") as unknown[];

    expect(oldFts).toHaveLength(0);
    expect(newFts).toHaveLength(1);
  });

  it("update throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("../errors.ts");

    expect(repository.update({ id: "nonexistent", content: "content" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete removes a memory", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "to-delete",
      content: "Delete me.",
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
      createdAt: t,
      updatedAt: t,
    });
    await repository.delete({ id: "fts-delete" });

    const results = database
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?")
      .all("searchable") as unknown[];
    expect(results).toHaveLength(0);
  });

  it("listWorkspaces returns distinct non-null workspaces sorted", async () => {
    const t = new Date("2026-03-01T00:00:00.000Z");

    await createMemory({
      id: "a1",
      content: "A.",
      workspace: "/z-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "a2",
      content: "A2.",
      workspace: "/z-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({
      id: "b1",
      content: "B.",
      workspace: "/a-repo",
      createdAt: t,
      updatedAt: t,
    });
    await createMemory({ id: "g1", content: "Global.", createdAt: t, updatedAt: t });

    const workspaces = await repository.listWorkspaces();

    expect(workspaces).toEqual(["/a-repo", "/z-repo"]);
  });

  it("delete throws NotFoundError for nonexistent id", async () => {
    const { NotFoundError } = await import("../errors.ts");

    expect(repository.delete({ id: "nonexistent" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
