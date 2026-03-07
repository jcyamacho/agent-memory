import { describe, expect, it } from "bun:test";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
import { MemoryService } from "./memory-service.ts";

class FakeMemoryRepository implements MemoryRepository {
  public saved: MemoryRecord[] = [];
  public lastSearchQuery: MemorySearchQuery | null = null;

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    this.saved.push(memory);
    return memory;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    this.lastSearchQuery = query;
    return [
      {
        id: "memory-1",
        content: "Decisions should favor WAL mode for shared access.",
        score: 0.91,
        source: "codex",
        workspace: "/tmp/project",
        session: "session-1",
        createdAt: new Date("2026-03-07T10:00:00.000Z"),
      },
    ];
  }
}

describe("MemoryService", () => {
  it("saves append-only memory with optional metadata", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const result = await service.save({
      content: "Use a global SQLite database shared across tools.",
      source: "codex",
      workspace: "/tmp/project",
      session: "session-1",
    });

    expect(repository.saved).toHaveLength(1);
    expect(result.content).toBe("Use a global SQLite database shared across tools.");
    expect(result.source).toBe("codex");
    expect(result.workspace).toBe("/tmp/project");
    expect(result.session).toBe("session-1");
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBe(result.updatedAt.getTime());
  });

  it("passes strict filters and preference hints to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const service = new MemoryService(repository);

    const results = await service.search({
      query: "shared sqlite decisions",
      limit: 3,
      preferredSource: "codex",
      preferredWorkspace: "/tmp/project",
      filterSource: "claude",
      filterWorkspace: "/tmp/project",
      createdAfter: new Date("2026-03-01T00:00:00.000Z"),
      createdBefore: new Date("2026-03-31T23:59:59.999Z"),
    });

    expect(repository.lastSearchQuery).toEqual({
      query: "shared sqlite decisions",
      limit: 3,
      preferredSource: "codex",
      preferredWorkspace: "/tmp/project",
      filterSource: "claude",
      filterWorkspace: "/tmp/project",
      createdAfter: new Date("2026-03-01T00:00:00.000Z"),
      createdBefore: new Date("2026-03-31T23:59:59.999Z"),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBeGreaterThan(0);
  });
});
