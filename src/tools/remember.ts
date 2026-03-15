import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z
    .string()
    .describe(
      "The exact fact, preference, decision, or context to remember for future retrieval. Use a self-contained sentence or short note.",
    ),
  workspace: z
    .string()
    .optional()
    .describe("Repository or workspace path this memory belongs to. Use it to keep memories scoped to a project."),
};

const rememberOutputSchema = {
  id: z.string().describe("Stable identifier for the saved memory."),
};

export const registerRememberTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "remember",
    {
      description:
        "Save durable context for later recall. Use this for user preferences, project facts, decisions, constraints, or other information worth remembering across turns and tools.",
      inputSchema: rememberInputSchema,
      outputSchema: rememberOutputSchema,
    },
    async ({ content, workspace }) => {
      try {
        const memory = await memoryService.save({
          content,
          workspace,
        });

        const structuredContent = {
          id: memory.id,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: "Saved memory.",
            },
          ],
          structuredContent,
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
};
