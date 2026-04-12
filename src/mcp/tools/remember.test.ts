import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryRecord } from "../../memory.ts";
import { registerRememberTool } from "./remember.ts";

describe("registerRememberTool", () => {
  let savedMemory: MemoryRecord | undefined;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    savedMemory = undefined;
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerRememberTool(server, {
      create: async (memory) => {
        savedMemory = {
          id: "memory-1",
          createdAt: new Date("2026-03-19T12:00:00.000Z"),
          updatedAt: new Date("2026-03-19T12:00:00.000Z"),
          ...memory,
        };
        return savedMemory;
      },
    });

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

  it("creates memory and returns the structured MCP response", async () => {
    const response = await client.callTool({
      name: "remember",
      arguments: {
        content: "Keep migrations isolated from repository logic.",
        workspace: "/repo-a",
      },
    });

    expect(savedMemory).toBeDefined();
    expect(savedMemory).toMatchObject({
      content: "Keep migrations isolated from repository logic.",
      workspace: "/repo-a",
    });
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" workspace="/repo-a">\nKeep migrations isolated from repository logic.\n</memory>',
    );
  });
});
