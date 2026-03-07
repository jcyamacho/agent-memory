import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { toMcpError } from "./shared.ts";

const saveMemoryInputSchema = {
  content: z.string().describe("Memory content to persist."),
  source: z.string().optional().describe("Optional tool or client source."),
  workspace: z.string().optional().describe("Optional workspace or repo path."),
  session: z.string().optional().describe("Optional session identifier."),
};

const saveMemoryOutputSchema = {
  id: z.string(),
  source: z.string().optional(),
  workspace: z.string().optional(),
  session: z.string().optional(),
  created_at: z.string(),
};

export const registerSaveMemoryTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "save_memory",
    {
      description: "Persist a memory entry for later retrieval across tools.",
      inputSchema: saveMemoryInputSchema,
      outputSchema: saveMemoryOutputSchema,
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
