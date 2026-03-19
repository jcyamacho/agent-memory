import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError } from "../errors.ts";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "../memory.ts";
import { MemoryService } from "../memory-service.ts";
import { registerReviseTool } from "./revise.ts";

class ReviseOnlyRepository implements MemoryRepository {
  public updatedId: string | undefined;
  public updatedContent: string | undefined;

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    return memory;
  }

  async search(_query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    return [];
  }

  async update(id: string, content: string): Promise<MemoryRecord> {
    this.updatedId = id;
    this.updatedContent = content;
    const now = new Date("2026-03-19T12:00:00.000Z");
    return { id, content, createdAt: now, updatedAt: now };
  }

  async delete(_id: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

describe("registerReviseTool", () => {
  let repository: ReviseOnlyRepository;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    repository = new ReviseOnlyRepository();
    const memoryService = new MemoryService(repository);
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerReviseTool(server, memoryService);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "revise-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("updates memory and returns XML with server-generated values", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
        content: "  Updated fact.  ",
      },
    });

    expect(repository.updatedId).toBe("memory-1");
    expect(repository.updatedContent).toBe("Updated fact.");
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toMatch(/^<memory id="memory-1" updated_at="[^"]+" \/>$/);
  });

  it("returns an MCP error for empty content", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
        content: "   ",
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: Memory content is required.",
      },
    ]);
  });

  it("returns an MCP error when memory is not found", async () => {
    repository.update = async () => {
      throw new NotFoundError("Memory not found.");
    };

    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "missing",
        content: "Updated.",
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: Memory not found.",
      },
    ]);
  });
});
