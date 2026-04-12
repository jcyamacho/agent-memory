import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { ValidationError } from "../../errors.ts";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError, toMemoryXml } from "./shared.ts";

const reviseInputSchema = {
  id: z.string().describe("Memory id to update. Use an id returned by `review`."),
  content: z
    .string()
    .optional()
    .describe("Corrected replacement text for that memory. Omit to keep the current content."),
  global: z.boolean().optional().describe("Set to true to move a project-scoped memory to global scope."),
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
        "Update one existing memory when the same fact still applies but its wording changed, or when a project-scoped memory should become global. Use after `review` when you already have the memory id. Omit fields you do not want to change. Returns the revised memory as `<memory ...>...</memory>`.",
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
