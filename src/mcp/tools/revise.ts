import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ValidationError } from "@/errors.ts";
import type { MemoryApi } from "@/memory.ts";
import { toMemoryXml } from "@/memory-format.ts";
import { toMcpError } from "./shared.ts";

const reviseInputSchema = {
  id: z.string().describe("Memory id to update. Use an id returned by `review`."),
  content: z
    .string()
    .optional()
    .describe("Corrected replacement text for that memory. Omit to keep the current content."),
  global: z.literal(true).optional().describe("Set to true to move a project-scoped memory to global scope."),
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
        "Update one existing memory or promote it from workspace to global scope. Use instead of `remember` when the durable fact already exists. Returns `<memory ...>` XML.",
      inputSchema: reviseInputSchema,
    },
    async ({ id, content, global }) => {
      try {
        if (content === undefined && global !== true) {
          throw new ValidationError("Provide at least one field to revise.");
        }

        const revisedMemory = await memory.update({
          id,
          content,
          workspace: global === true ? null : undefined,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: toMemoryXml(revisedMemory),
            },
          ],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
