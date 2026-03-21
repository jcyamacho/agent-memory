import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const reviseInputSchema = {
  id: z.string().describe("Memory id to update. Use an id returned by `recall`."),
  content: z.string().describe("Corrected replacement text for that memory."),
};

export function registerReviseTool(server: McpServer, memory: Pick<MemoryApi, "update">): void {
  server.registerTool(
    "revise",
    {
      annotations: {
        title: "Revise",
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        'Update one existing memory when the same fact still applies but its wording or details changed. Use after `recall` when you already have the memory id. Returns `<memory id="..." updated_at="..." />`.',
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
