import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const reviseInputSchema = {
  id: z.string().describe("The id of the memory to update. Use the id returned by a previous recall result."),
  content: z
    .string()
    .describe(
      "The replacement content for the memory. Use a single self-contained sentence or short note. One fact per memory.",
    ),
};

export function registerReviseTool(server: McpServer, memory: Pick<MemoryApi, "update">): void {
  server.registerTool(
    "revise",
    {
      description:
        "Update the content of an existing memory. Use when a previously saved memory is outdated or inaccurate and needs correction rather than deletion. Pass the memory id from a previous recall result.",
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
