import { describe, expect, it } from "bun:test";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
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

class FakeMemoryRepository implements MemoryRepository {
  public saved: MemoryRecord[] = [];
  public lastSearchQuery: MemorySearchQuery | null = null;
  public searchResults: MemorySearchResult[] = [
    createSearchResult("memory-1", {
      content: "Decisions should favor WAL mode for shared access.",
      score: toNormalizedScore(0.91),
      createdAt: new Date("2026-03-07T10:00:00.000Z"),
      updatedAt: new Date("2026-03-07T10:00:00.000Z"),
    }),
  ];

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    this.saved.push(memory);
    return memory;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    this.lastSearchQuery = query;
    return this.searchResults;
  }
}

describe("MemoryService", () => {
  it("saves append-only memory with optional metadata", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.save({
      content: "Use a global SQLite database shared across tools.",
      workspace: DEFAULT_WORKSPACE,
    });

    expect(repository.saved).toHaveLength(1);
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
});
