import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError } from "../errors.ts";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "../memory.ts";
import { MemoryService } from "../memory-service.ts";
import { registerForgetTool } from "./forget.ts";

class ForgetOnlyRepository implements MemoryRepository {
  public deletedId: string | undefined;

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    return memory;
  }

  async search(_query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    return [];
  }

  async update(_id: string, _content: string): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async delete(id: string): Promise<void> {
    this.deletedId = id;
  }
}

describe("registerForgetTool", () => {
  let repository: ForgetOnlyRepository;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    repository = new ForgetOnlyRepository();
    const memoryService = new MemoryService(repository);
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerForgetTool(server, memoryService);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "forget-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("deletes memory and returns confirmation XML", async () => {
    const response = await client.callTool({
      name: "forget",
      arguments: { id: "memory-1" },
    });

    expect(repository.deletedId).toBe("memory-1");
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe('<memory id="memory-1" deleted="true" />');
  });

  it("returns an MCP error for empty id", async () => {
    const response = await client.callTool({
      name: "forget",
      arguments: { id: "   " },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: Memory id is required.",
      },
    ]);
  });

  it("returns an MCP error when memory is not found", async () => {
    repository.delete = async () => {
      throw new NotFoundError("Memory not found.");
    };

    const response = await client.callTool({
      name: "forget",
      arguments: { id: "missing" },
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
