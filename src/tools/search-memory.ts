import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { parseOptionalDate, toMcpError } from "./shared.ts";

const searchMemoryInputSchema = {
  query: z.string().describe("Search query to match against saved memories."),
  limit: z.number().int().min(1).max(20).optional().describe("Maximum results to return."),
  preferred_source: z.string().optional().describe("Optional source used only as a ranking hint."),
  preferred_workspace: z.string().optional().describe("Optional workspace used only as a ranking hint."),
  filter_source: z.string().optional().describe("Optional strict source filter."),
  filter_workspace: z.string().optional().describe("Optional strict workspace filter."),
  created_after: z.string().optional().describe("Optional inclusive lower bound for created_at."),
  created_before: z.string().optional().describe("Optional inclusive upper bound for created_at."),
};

const searchMemoryOutputSchema = {
  results: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      score: z.number(),
      source: z.string().optional(),
      workspace: z.string().optional(),
      session: z.string().optional(),
      created_at: z.string(),
    }),
  ),
};

export const registerSearchMemoryTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "search_memory",
    {
      description: "Search saved memories using SQLite full-text search.",
      inputSchema: searchMemoryInputSchema,
      outputSchema: searchMemoryOutputSchema,
    },
    async ({
      query,
      limit,
      preferred_source,
      preferred_workspace,
      filter_source,
      filter_workspace,
      created_after,
      created_before,
    }) => {
      try {
        const results = await memoryService.search({
          query,
          limit,
          preferredSource: preferred_source,
          preferredWorkspace: preferred_workspace,
          filterSource: filter_source,
          filterWorkspace: filter_workspace,
          createdAfter: parseOptionalDate(created_after, "created_after"),
          createdBefore: parseOptionalDate(created_before, "created_before"),
        });

        const structuredContent = {
          results: results.map((result) => ({
            id: result.id,
            content: result.content,
            score: result.score,
            source: result.source,
            workspace: result.workspace,
            session: result.session,
            created_at: result.createdAt.toISOString(),
          })),
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
