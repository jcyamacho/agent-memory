import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const reviseInputSchema = {
  id: z.string().describe("The memory id to update. Use an id returned by `recall`."),
  content: z.string().describe("The corrected replacement for that same fact. Keep it to one durable fact."),
};

export function registerReviseTool(server: McpServer, memory: Pick<MemoryApi, "update">): void {
  server.registerTool(
    "revise",
    {
      description:
        'Replace one existing memory with corrected wording. Use after `recall` when the same fact still applies but details changed. Do not append unrelated facts or merge memories. Returns `<memory id="..." updated_at="..." />`.',
      inputSchema: reviseInputSchema,
    },
    async ({ id, content }) => {
      try {
        const revisedMemory = await memory.update({ id, content });

        return {
          content: [
            {
              type: "text" as const,
              text: `<memory id="${revisedMemory.id}" updated_at="${revisedMemory.updatedAt.toISOString()}" />`,
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
