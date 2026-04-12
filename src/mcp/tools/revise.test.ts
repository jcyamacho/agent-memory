import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { NotFoundError, ValidationError } from "../../errors.ts";
import type { MemoryRecord, UpdateMemoryInput } from "../../memory.ts";
import { registerReviseTool } from "./revise.ts";

describe("registerReviseTool", () => {
  let lastUpdateInput: UpdateMemoryInput | undefined;
  let reviseImpl: (input: UpdateMemoryInput) => Promise<MemoryRecord>;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    lastUpdateInput = undefined;
    reviseImpl = async (input) => {
      lastUpdateInput = input;
      return {
        id: input.id,
        content: input.content ?? "Existing fact.",
        workspace: input.workspace === null ? undefined : (input.workspace ?? undefined),
        createdAt: new Date("2026-03-19T11:00:00.000Z"),
        updatedAt: new Date("2026-03-19T12:00:00.000Z"),
      };
    };
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerReviseTool(server, {
      update: async (input) => reviseImpl(input),
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

  it("updates memory content and returns XML with server-generated values", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
        content: "  Updated fact.  ",
      },
    });

    expect(lastUpdateInput).toEqual({
      id: "memory-1",
      content: "  Updated fact.  ",
      workspace: undefined,
    });
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" global="true">\n  Updated fact.  \n</memory>',
    );
  });

  it("updates memory scope to global", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
        global: true,
      },
    });

    expect(lastUpdateInput).toEqual({
      id: "memory-1",
      content: undefined,
      workspace: null,
    });
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" global="true">\nExisting fact.\n</memory>',
    );
  });

  it("updates memory content and promotes scope to global together", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
        content: "Updated fact.",
        global: true,
      },
    });

    expect(lastUpdateInput).toEqual({
      id: "memory-1",
      content: "Updated fact.",
      workspace: null,
    });
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" global="true">\nUpdated fact.\n</memory>',
    );
  });

  it("returns an MCP error when no fields are provided", async () => {
    const response = await client.callTool({
      name: "revise",
      arguments: {
        id: "memory-1",
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content).toEqual([
      {
        type: "text",
        text: "MCP error -32602: Provide at least one field to revise.",
      },
    ]);
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
