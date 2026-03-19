import { describe, expect, it } from "bun:test";
import { NotFoundError, ValidationError } from "./errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryApi,
  MemoryPage,
  MemoryRecord,
  MemorySearchResult,
  SearchMemoryInput,
  UpdateMemoryInput,
} from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import { MemoryService, RECALL_CANDIDATE_LIMIT_MULTIPLIER } from "./memory-service.ts";

const DEFAULT_WORKSPACE = "/tmp/project";
const DEFAULT_TIMESTAMP = new Date("2026-03-01T00:00:00.000Z");
const DEFAULT_CONTENT = "Use shared sqlite decisions to coordinate agents.";
const DEFAULT_SHARED_SQLITE_TERMS = ["shared sqlite", "decisions"];

function createSearchResult(id: string, overrides: Partial<MemorySearchResult> = {}): MemorySearchResult {
  return {
    id,
    content: DEFAULT_CONTENT,
    score: toNormalizedScore(0.8),
    workspace: DEFAULT_WORKSPACE,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

class FakeMemoryRepository implements MemoryApi {
  public created: MemoryRecord[] = [];
  public lastSearchQuery: SearchMemoryInput | null = null;
  public lastListInput: ListMemoriesInput | null = null;
  public searchResults: MemorySearchResult[] = [
    createSearchResult("memory-1", {
      content: "Decisions should favor WAL mode for shared access.",
      score: toNormalizedScore(0.91),
      createdAt: new Date("2026-03-07T10:00:00.000Z"),
      updatedAt: new Date("2026-03-07T10:00:00.000Z"),
    }),
  ];
  public updatedRecord: MemoryRecord | undefined;
  public deletedId: string | undefined;
  public updateError: Error | undefined;
  public deleteError: Error | undefined;
  public memory: MemoryRecord | undefined = {
    id: "memory-1",
    content: "Shared read policy belongs in the application layer.",
    workspace: "/repo",
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  };

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const now = new Date();
    const memory: MemoryRecord = {
      id: "memory-saved",
      content: input.content,
      workspace: input.workspace,
      createdAt: now,
      updatedAt: now,
    };
    this.created.push(memory);
    return memory;
  }

  async search(query: SearchMemoryInput): Promise<MemorySearchResult[]> {
    this.lastSearchQuery = query;
    return this.searchResults;
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return id === this.memory?.id ? this.memory : undefined;
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    this.lastListInput = input;
    return {
      items: this.memory ? [this.memory] : [],
      hasMore: false,
    };
  }

  async listWorkspaces(): Promise<string[]> {
    return this.memory?.workspace ? [this.memory.workspace] : [];
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    if (this.updateError) throw this.updateError;
    const now = new Date();
    const record: MemoryRecord = {
      id: input.id,
      content: input.content,
      createdAt: DEFAULT_TIMESTAMP,
      updatedAt: now,
    };
    this.updatedRecord = record;
    return record;
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deletedId = input.id;
  }
}

describe("MemoryService", () => {
  it("creates append-only memory with optional metadata", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.create({
      content: "Use a global SQLite database shared across tools.",
      workspace: DEFAULT_WORKSPACE,
    });

    expect(repository.created).toHaveLength(1);
    expect(result.content).toBe("Use a global SQLite database shared across tools.");
    expect(result.workspace).toBe(DEFAULT_WORKSPACE);
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(result.updatedAt.getTime());
  });

  it("passes workspace and date filters to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: [" shared ", "sqlite", "decisions"],
      limit: 3,
      workspace: DEFAULT_WORKSPACE,
      updatedAfter: new Date("2026-03-01T00:00:00.000Z"),
      updatedBefore: new Date("2026-03-31T23:59:59.999Z"),
    });

    expect(repository.lastSearchQuery).toEqual({
      terms: ["shared", "sqlite", "decisions"],
      limit: 3 * RECALL_CANDIDATE_LIMIT_MULTIPLIER,
      updatedAfter: new Date("2026-03-01T00:00:00.000Z"),
      updatedBefore: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("preserves retrieval score ordering as the dominant ranking signal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("best-match", { score: toNormalizedScore(1) }),
      createSearchResult("weaker-match", {
        content: "SQLite can be useful in many systems.",
        score: toNormalizedScore(0.3),
      }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("best-match");
  });

  it("ranks matching workspace above non-matching when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("other-workspace", { workspace: "/other" }),
      createSearchResult("preferred-workspace"),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("preferred-workspace");
  });

  it("ranks exact, global, sibling, and unrelated workspaces in that order when retrieval is tied", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("unrelated", { workspace: "/x/y/z" }),
      createSearchResult("global", { workspace: undefined }),
      createSearchResult("sibling", { workspace: "/a/b/d" }),
      createSearchResult("child", { workspace: "/a/b/c/d" }),
      createSearchResult("exact", { workspace: "/a/b/c" }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 5,
      workspace: "/a/b/c",
    });

    expect(results.map((result) => result.id)).toEqual(["exact", "global", "sibling", "unrelated", "child"]);
  });

  it("returns a single result unchanged", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["WAL"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBe(repository.searchResults[0]?.score);
  });

  it("searches without workspace", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["WAL"],
      limit: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("does not apply workspace bias when query workspace is omitted", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("scoped-memory"),
      createSearchResult("global-memory", { workspace: undefined }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
    });

    expect(results.map((result) => result.id)).toEqual(["scoped-memory", "global-memory"]);
  });

  it("slices results to the requested limit after reranking", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("a", { content: "first", score: toNormalizedScore(1) }),
      createSearchResult("b", { content: "second" }),
      createSearchResult("c", { content: "third", score: toNormalizedScore(0.5) }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["test"],
      limit: 2,
    });

    expect(results).toHaveLength(2);
  });

  it("returns scores in the 0 to 1 range", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("a", { content: "first", score: toNormalizedScore(1) }),
      createSearchResult("b", { content: "second", score: toNormalizedScore(0), workspace: "/other" }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["test"],
      limit: 10,
      workspace: DEFAULT_WORKSPACE,
    });

    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });

  it("deduplicates search terms", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await service.search({
      terms: ["sqlite", "sqlite", "WAL"],
      limit: 5,
    });

    expect(repository.lastSearchQuery?.terms).toEqual(["sqlite", "WAL"]);
  });

  it("ranks global memories (no workspace) above non-matching workspace when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("wrong-workspace", { workspace: "/other" }),
      createSearchResult("global-memory", { workspace: undefined }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("global-memory");
  });

  it("ranks sibling repos above unrelated repos when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("unrelated", { workspace: "/x/y/z" }),
      createSearchResult("sibling", { workspace: "/tmp/other-project" }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("sibling");
  });

  it("does not give parent-child paths a workspace bonus", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("child", { workspace: "/tmp/project/nested" }),
      createSearchResult("unrelated", { workspace: "/x/y/z" }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results.map((result) => result.id)).toEqual(["child", "unrelated"]);
  });

  it("ranks matching workspace above global memories when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("global-memory", { workspace: undefined }),
      createSearchResult("matching-workspace"),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("matching-workspace");
  });

  it("ranks recently updated memories above older ones when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    repository.searchResults = [
      createSearchResult("older"),
      createSearchResult("newer", { updatedAt: new Date("2026-03-08T00:00:00.000Z") }),
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: DEFAULT_SHARED_SQLITE_TERMS,
      limit: 2,
      workspace: DEFAULT_WORKSPACE,
    });

    expect(results[0]?.id).toBe("newer");
  });

  it("updates memory content and returns the updated record", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.update({ id: "memory-1", content: "Updated content." });

    expect(repository.updatedRecord).toBeDefined();
    expect(result.id).toBe("memory-1");
    expect(result.content).toBe("Updated content.");
  });

  it("trims content before delegating update to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.update({ id: "memory-1", content: "  trimmed  " });

    expect(result.content).toBe("trimmed");
  });

  it("throws ValidationError when update content is empty", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await expect(service.update({ id: "memory-1", content: "   " })).rejects.toThrow(ValidationError);
  });

  it("propagates NotFoundError from repository on update", async () => {
    const repository = new FakeMemoryRepository();
    repository.updateError = new NotFoundError("Memory not found.");
    const service = new MemoryService(repository);

    await expect(service.update({ id: "missing", content: "x" })).rejects.toThrow(NotFoundError);
  });

  it("deletes a memory successfully", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await service.delete({ id: "memory-1" });

    expect(repository.deletedId).toBe("memory-1");
  });

  it("throws ValidationError when delete id is empty", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await expect(service.delete({ id: "   " })).rejects.toThrow(ValidationError);
  });

  it("propagates NotFoundError from repository on delete", async () => {
    const repository = new FakeMemoryRepository();
    repository.deleteError = new NotFoundError("Memory not found.");
    const service = new MemoryService(repository);

    await expect(service.delete({ id: "memory-1" })).rejects.toThrow(NotFoundError);
  });

  it("gets a memory by id", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.get("memory-1");

    expect(result).toEqual(repository.memory);
  });

  it("normalizes list input before delegating to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await service.list({
      workspace: "  /repo  ",
      workspaceIsNull: true,
      offset: -10,
      limit: 999,
    });

    expect(repository.lastListInput).toEqual({
      workspace: "/repo",
      workspaceIsNull: false,
      offset: 0,
      limit: 100,
    });
  });

  it("defaults list input when values are omitted", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    await service.list({});

    expect(repository.lastListInput).toEqual({
      workspace: undefined,
      workspaceIsNull: false,
      offset: 0,
      limit: 15,
    });
  });

  it("lists workspaces", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const workspaces = await service.listWorkspaces();

    expect(workspaces).toEqual(["/repo"]);
  });
});
