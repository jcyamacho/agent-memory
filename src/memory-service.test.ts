import { describe, expect, it } from "bun:test";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import { MemoryService, RECALL_CANDIDATE_LIMIT_MULTIPLIER } from "./memory-service.ts";

class FakeMemoryRepository implements MemoryRepository {
  public saved: MemoryRecord[] = [];
  public lastSearchQuery: MemorySearchQuery | null = null;
  public searchResults: MemorySearchResult[] = [
    {
      id: "memory-1",
      content: "Decisions should favor WAL mode for shared access.",
      score: toNormalizedScore(0.91),
      workspace: "/tmp/project",
      createdAt: new Date("2026-03-07T10:00:00.000Z"),
      updatedAt: new Date("2026-03-07T10:00:00.000Z"),
    },
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
      workspace: "/tmp/project",
    });

    expect(repository.saved).toHaveLength(1);
    expect(result.content).toBe("Use a global SQLite database shared across tools.");
    expect(result.workspace).toBe("/tmp/project");
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
      workspace: "/tmp/project",
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
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "best-match",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(1),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "weaker-match",
        content: "SQLite can be useful in many systems.",
        score: toNormalizedScore(0.3),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["shared sqlite", "decisions"],
      limit: 2,
      workspace: "/tmp/project",
    });

    expect(results[0]?.id).toBe("best-match");
  });

  it("ranks matching workspace above non-matching when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "other-workspace",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/other",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "preferred-workspace",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["shared sqlite", "decisions"],
      limit: 2,
      workspace: "/tmp/project",
    });

    expect(results[0]?.id).toBe("preferred-workspace");
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

  it("slices results to the requested limit after reranking", async () => {
    const repository = new FakeMemoryRepository();
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "a",
        content: "first",
        score: toNormalizedScore(1),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "b",
        content: "second",
        score: toNormalizedScore(0.8),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "c",
        content: "third",
        score: toNormalizedScore(0.5),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
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
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "a",
        content: "first",
        score: toNormalizedScore(1),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "b",
        content: "second",
        score: toNormalizedScore(0),
        workspace: "/other",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["test"],
      limit: 10,
      workspace: "/tmp/project",
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
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "wrong-workspace",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/other",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "global-memory",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["shared sqlite", "decisions"],
      limit: 2,
      workspace: "/tmp/project",
    });

    expect(results[0]?.id).toBe("global-memory");
  });

  it("ranks matching workspace above global memories when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    const timestamp = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "global-memory",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: "matching-workspace",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/tmp/project",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["shared sqlite", "decisions"],
      limit: 2,
      workspace: "/tmp/project",
    });

    expect(results[0]?.id).toBe("matching-workspace");
  });

  it("ranks recently updated memories above older ones when other signals are equal", async () => {
    const repository = new FakeMemoryRepository();
    const createdAt = new Date("2026-03-01T00:00:00.000Z");
    repository.searchResults = [
      {
        id: "older",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/tmp/project",
        createdAt,
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "newer",
        content: "Use shared sqlite decisions to coordinate agents.",
        score: toNormalizedScore(0.8),
        workspace: "/tmp/project",
        createdAt,
        updatedAt: new Date("2026-03-08T00:00:00.000Z"),
      },
    ];
    const service = new MemoryService(repository);

    const results = await service.search({
      terms: ["shared sqlite", "decisions"],
      limit: 2,
      workspace: "/tmp/project",
    });

    expect(results[0]?.id).toBe("newer");
  });
});
