import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  query: z
    .string()
    .describe(
      "What to look for in memory. Use keywords, short phrases, names, decisions, or facts that should match previously remembered context.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of memory results to return. Use a small number when you only need the best matches."),
  preferred_source: z
    .string()
    .optional()
    .describe(
      "Preferred source to rank higher when relevant, such as a client, tool, or agent name. This does not exclude other sources.",
    ),
  preferred_workspace: z
    .string()
    .optional()
    .describe(
      "Preferred workspace or repository path to rank higher when relevant. This does not exclude other workspaces.",
    ),
  filter_source: z.string().optional().describe("Only return memories from this exact source."),
  filter_workspace: z
    .string()
    .optional()
    .describe("Only return memories from this exact workspace or repository path."),
  created_after: z.string().optional().describe("Only return memories created at or after this ISO 8601 timestamp."),
  created_before: z.string().optional().describe("Only return memories created at or before this ISO 8601 timestamp."),
};

const recallOutputSchema = {
  results: z.array(
    z.object({
      id: z.string().describe("Stable identifier for the remembered item."),
      content: z.string().describe("The remembered content that matched the query."),
      score: z.number().describe("Relevance score for this result. Higher means a better match."),
      source: z.string().optional().describe("Source associated with the memory, if available."),
      workspace: z.string().optional().describe("Workspace associated with the memory, if available."),
      session: z.string().optional().describe("Session associated with the memory, if available."),
      created_at: z.string().describe("ISO 8601 timestamp showing when the memory was created."),
    }),
  ),
};

export const registerRecallTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "recall",
    {
      description:
        "Retrieve previously remembered context that may help with the current task. Use it for user preferences, project facts, prior decisions, constraints, or earlier conversation details.",
      inputSchema: recallInputSchema,
      outputSchema: recallOutputSchema,
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
