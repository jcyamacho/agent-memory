import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError } from "../../errors.ts";
import type { MemoryRecord } from "../../memory.ts";
import { registerForgetTool } from "./forget.ts";

describe("registerForgetTool", () => {
  let deletedId: string | undefined;
  let forgetImpl: (id: string) => Promise<MemoryRecord>;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    deletedId = undefined;
    forgetImpl = async (id) => {
      deletedId = id;
      const now = new Date("2026-03-19T12:00:00.000Z");
      return {
        id,
        content: "Deleted fact.",
        workspace: undefined,
        updatedAt: now,
      };
    };
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerForgetTool(server, {
      delete: async ({ id }) => forgetImpl(id),
    });

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

    expect(deletedId).toBe("memory-1");
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" global="true" deleted="true">\nDeleted fact.\n</memory>',
    );
  });

  it("returns an MCP error when memory is not found", async () => {
    forgetImpl = async () => {
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
