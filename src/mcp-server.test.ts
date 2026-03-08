import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcp-server.ts";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
import { MemoryService } from "./memory-service.ts";

class FakeMemoryRepository implements MemoryRepository {
  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    return memory;
  }

  async search(_query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    return [];
  }
}

describe("createMcpServer", () => {
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;

  beforeEach(async () => {
    server = createMcpServer(new MemoryService(new FakeMemoryRepository()), "1.0.0");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({
      name: "mcp-server-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers the memory tools", async () => {
    const response = await client.listTools();

    expect(response.tools.map((tool) => tool.name).sort()).toEqual(["recall", "remember"]);
  });
});
