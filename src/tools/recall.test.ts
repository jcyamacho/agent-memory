import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "../memory.ts";
import { toNormalizedScore } from "../memory.ts";
import { MemoryService, RECALL_CANDIDATE_LIMIT_MULTIPLIER } from "../memory-service.ts";
import { registerRecallTool } from "./recall.ts";

class RecallOnlyRepository implements MemoryRepository {
  public searchQuery: MemorySearchQuery | undefined;

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    return memory;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    this.searchQuery = query;

    return [
      {
        id: "memory-1",
        content: "Use FTS5 for recall and ranking.",
        score: toNormalizedScore(0.9),
        workspace: "/repo-a",
        createdAt: new Date("2026-03-07T10:00:00.000Z"),
        updatedAt: new Date("2026-03-07T10:00:00.000Z"),
      },
    ];
  }

  async update(_id: string, _content: string): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async delete(_id: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

describe("registerRecallTool", () => {
  let repository: RecallOnlyRepository;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    repository = new RecallOnlyRepository();
    const memoryService = new MemoryService(repository);
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerRecallTool(server, memoryService);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "recall-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("maps search input to the service and returns structured results", async () => {
    const response = await client.callTool({
      name: "recall",
      arguments: {
        terms: ["  FTS5  ", "ranking"],
        limit: 3,
        workspace: "  /repo-a  ",
        updated_after: "2026-03-01T00:00:00.000Z",
        updated_before: "2026-03-31T23:59:59.000Z",
      },
    });

    expect(repository.searchQuery).toMatchObject({
      terms: ["FTS5", "ranking"],
      limit: 3 * RECALL_CANDIDATE_LIMIT_MULTIPLIER,
    });
    expect(repository.searchQuery?.updatedAfter).toBeInstanceOf(Date);
    expect(repository.searchQuery?.updatedBefore).toBeInstanceOf(Date);
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("<memories>");
    expect(text).toContain('id="memory-1"');
    expect(text).toContain('score="0.9"');
    expect(text).toContain('workspace="/repo-a"');
    expect(text).toContain('updated_at="2026-03-07T10:00:00.000Z"');
    expect(text).toContain("Use FTS5 for recall and ranking.");
    expect(text).toContain("</memories>");
  });

  it("returns an MCP validation error for an invalid date", async () => {
    const response = await client.callTool({
      name: "recall",
      arguments: {
        terms: ["fts5"],
        updated_after: "not-a-date",
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: updated_after must be a valid ISO 8601 datetime.",
      },
    ]);
  });

  it("returns an MCP validation error when all terms are blank", async () => {
    const response = await client.callTool({
      name: "recall",
      arguments: {
        terms: ["   ", ""],
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: At least one search term is required.",
      },
    ]);
  });

  it("ignores legacy source and workspace controls", async () => {
    await client.callTool({
      name: "recall",
      arguments: {
        terms: ["fts5"],
        preferred_source: "codex",
        filter_source: "codex",
        preferred_workspace: "/repo-a",
        filter_workspace: "/repo-a",
      },
    });

    expect(repository.searchQuery).toMatchObject({
      terms: ["fts5"],
    });
    expect(repository.searchQuery).not.toHaveProperty("preferredSource");
    expect(repository.searchQuery).not.toHaveProperty("filterSource");
    expect(repository.searchQuery).not.toHaveProperty("preferredWorkspace");
    expect(repository.searchQuery).not.toHaveProperty("filterWorkspace");
  });
});
