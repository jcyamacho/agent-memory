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
  source: z
    .string()
    .optional()
    .describe(
      "Where this memory came from, such as the client, tool, or agent name. Helps with filtering and ranking later.",
    ),
  workspace: z
    .string()
    .optional()
    .describe("Repository or workspace path this memory belongs to. Use it to keep memories scoped to a project."),
  session: z
    .string()
    .optional()
    .describe("Conversation or execution session identifier. Useful for tying memories back to one run or thread."),
};

const rememberOutputSchema = {
  id: z.string().describe("Stable identifier for the saved memory."),
  source: z.string().optional().describe("Source stored with the memory, if provided."),
  workspace: z.string().optional().describe("Workspace stored with the memory, if provided."),
  session: z.string().optional().describe("Session stored with the memory, if provided."),
  created_at: z.string().describe("ISO 8601 timestamp showing when the memory was created."),
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
    async ({ content, source, workspace, session }) => {
      try {
        const memory = await memoryService.save({
          content,
          source,
          workspace,
          session,
        });

        const structuredContent = {
          id: memory.id,
          source: memory.source,
          workspace: memory.workspace,
          session: memory.session,
          created_at: memory.createdAt.toISOString(),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(structuredContent, null, 2),
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
