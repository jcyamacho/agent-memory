import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z
    .string()
    .describe(
      "The fact, preference, decision, or context to remember. Use a single self-contained sentence or short note. One fact per memory.",
    ),
  workspace: z
    .string()
    .optional()
    .describe(
      "Always pass the current working directory to scope this memory to a project. Omit only when the memory applies across all projects (global preference).",
    ),
};

export const registerRememberTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "remember",
    {
      description:
        "Save durable context for later recall. Use this when the user corrects your approach, states a preference, a key decision or convention is established, or you learn project context not obvious from the code. Store one concise fact per memory. Do not store secrets, ephemeral task state, or information already in the codebase.",
      inputSchema: rememberInputSchema,
    },
    async ({ content, workspace }) => {
      try {
        const memory = await memoryService.save({
          content,
          workspace,
        });

        return {
          content: [{ type: "text" as const, text: `<memory id="${memory.id}" />` }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
};
