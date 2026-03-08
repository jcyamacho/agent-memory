import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery } from "../memory.ts";
import { MemoryService } from "../memory-service.ts";
import { registerRememberTool } from "./remember.ts";

class RememberOnlyRepository implements MemoryRepository {
  public savedMemory: MemoryRecord | undefined;

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    this.savedMemory = memory;
    return memory;
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}

describe("registerRememberTool", () => {
  let repository: RememberOnlyRepository;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    repository = new RememberOnlyRepository();
    const memoryService = new MemoryService(repository);
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerRememberTool(server, memoryService);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "remember-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("saves memory and returns the structured MCP response", async () => {
    const response = await client.callTool({
      name: "remember",
      arguments: {
        content: "  Keep migrations isolated from repository logic.  ",
        source: "  codex  ",
        workspace: "  /repo-a  ",
        session: "  session-a  ",
      },
    });

    expect(repository.savedMemory).toBeDefined();
    expect(repository.savedMemory).toMatchObject({
      content: "Keep migrations isolated from repository logic.",
      source: "codex",
      workspace: "/repo-a",
      session: "session-a",
    });
    expect(response.structuredContent).toMatchObject({
      id: expect.any(String),
      source: "codex",
      workspace: "/repo-a",
      session: "session-a",
      created_at: expect.any(String),
    });
    expect(response.structuredContent).not.toHaveProperty("content");
  });
});
