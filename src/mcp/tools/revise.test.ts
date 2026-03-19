import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError, ValidationError } from "../../errors.ts";
import type { MemoryRecord } from "../../memory.ts";
import { registerReviseTool } from "./revise.ts";

describe("registerReviseTool", () => {
  let updatedId: string | undefined;
  let updatedContent: string | undefined;
  let reviseImpl: (id: string, content: string) => Promise<MemoryRecord>;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    updatedId = undefined;
    updatedContent = undefined;
    reviseImpl = async (id, content) => {
      updatedId = id;
      updatedContent = content;
      const now = new Date("2026-03-19T12:00:00.000Z");
      return { id, content, createdAt: now, updatedAt: now };
    };
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerReviseTool(server, {
      update: async ({ id, content }) => reviseImpl(id, content),
    });

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

    expect(updatedId).toBe("memory-1");
    expect(updatedContent).toBe("  Updated fact.  ");
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toMatch(/^<memory id="memory-1" updated_at="[^"]+" \/>$/);
  });

  it("returns an MCP error for empty content", async () => {
    reviseImpl = async () => {
      throw new ValidationError("Memory content is required.");
    };

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
    reviseImpl = async () => {
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
