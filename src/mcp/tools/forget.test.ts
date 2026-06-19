import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DeleteMemoriesResult } from "@/memory.ts";
import { registerForgetTool } from "./forget.ts";

describe("registerForgetTool", () => {
  let deletedIds: string[] | undefined;
  let forgetImpl: (ids: string[]) => Promise<DeleteMemoriesResult>;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    deletedIds = undefined;
    forgetImpl = async (ids) => {
      deletedIds = ids;
      const now = new Date("2026-03-19T12:00:00.000Z");
      return {
        outcomes: ids.map((id) => ({
          deleted: true as const,
          memory: {
            id,
            content: "Deleted fact.",
            workspace: undefined,
            updatedAt: now,
          },
        })),
      };
    };
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerForgetTool(server, {
      delete: async ({ ids }) => forgetImpl(ids),
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

  it("deletes memories and returns ordered result XML", async () => {
    const response = await client.callTool({
      name: "forget",
      arguments: { ids: [" memory-1 ", "memory-2"] },
    });

    expect(deletedIds).toEqual(["memory-1", "memory-2"]);
    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe(
      '<forget_results deleted="2" failed="0">\n<memory id="memory-1" updated_at="2026-03-19T12:00:00.000Z" global="true" deleted="true">\nDeleted fact.\n</memory>\n<memory id="memory-2" updated_at="2026-03-19T12:00:00.000Z" global="true" deleted="true">\nDeleted fact.\n</memory>\n</forget_results>',
    );
  });

  it("returns failed ids and statuses", async () => {
    forgetImpl = async () => ({
      outcomes: [
        { deleted: false, id: "missing<&", code: "not_found" },
        {
          deleted: true,
          memory: {
            id: "memory-2",
            content: "Deleted fact.",
            updatedAt: new Date("2026-03-19T12:00:00.000Z"),
          },
        },
      ],
    });

    const response = await client.callTool({
      name: "forget",
      arguments: { ids: ["missing", "memory-2", "missing"] },
    });

    expect(response.isError).toBeUndefined();
    expect((response.content as { type: string; text: string }[])[0]?.text).toBe(
      '<forget_results deleted="1" failed="1">\n<failure id="missing&lt;&amp;" status="not_found" />\n<memory id="memory-2" updated_at="2026-03-19T12:00:00.000Z" global="true" deleted="true">\nDeleted fact.\n</memory>\n</forget_results>',
    );
  });

  it("rejects invalid batch input", async () => {
    for (const ids of [[], ["   "], Array.from({ length: 51 }, (_, index) => `memory-${index}`)]) {
      const response = await client.callTool({ name: "forget", arguments: { ids } });
      expect(response.isError).toBe(true);
    }
  });

  it("advertises non-idempotent destructive behavior", async () => {
    const tools = await client.listTools();
    const forget = tools.tools.find((tool) => tool.name === "forget");

    expect(forget?.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    });
  });
});
