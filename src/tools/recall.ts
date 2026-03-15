import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { MAX_LIMIT, type MemoryService } from "../memory-service.ts";
import { parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  terms: z
    .array(z.string())
    .min(1)
    .describe(
      "Search terms used to find relevant memories. Pass 2-5 short, distinctive items as separate array entries. Focus on the topic, not the project name -- use workspace for project scoping. Prefer file names, APIs, feature names, or brief phrases. Avoid full sentences.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe("Maximum number of matches to return. Keep this small when you only need the strongest hits."),
  workspace: z
    .string()
    .optional()
    .describe(
      "Always pass the current working directory. Biases ranking toward the active project while still allowing cross-workspace matches. Memories saved without a workspace are treated as global and rank between matching and non-matching results.",
    ),
  updated_after: z
    .string()
    .optional()
    .describe(
      "Only return memories updated at or after this ISO 8601 timestamp. Use it when you need to narrow recall to newer context.",
    ),
  updated_before: z
    .string()
    .optional()
    .describe(
      "Only return memories updated at or before this ISO 8601 timestamp. Use it when you need to narrow recall to older context.",
    ),
};

const recallOutputSchema = {
  results: z.array(
    z.object({
      id: z.string().describe("Stable identifier for the remembered item."),
      content: z.string().describe("Saved memory text that matched one or more search terms."),
      score: z.number().describe("Relative relevance score for ranking results. Higher means a stronger match."),
      workspace: z.string().optional().describe("Workspace associated with the memory, if available."),
      updated_at: z.string().describe("ISO 8601 timestamp showing when the memory was last updated."),
    }),
  ),
};

export const registerRecallTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "recall",
    {
      description:
        "Recall previously saved context for the current task. Call this at the start of every conversation and whenever prior preferences, decisions, or project context may be relevant. Pass workspace to bias results toward the active project.",
      inputSchema: recallInputSchema,
      outputSchema: recallOutputSchema,
    },
    async ({ terms, limit, workspace, updated_after, updated_before }) => {
      try {
        const results = await memoryService.search({
          terms,
          limit,
          workspace,
          updatedAfter: parseOptionalDate(updated_after, "updated_after"),
          updatedBefore: parseOptionalDate(updated_before, "updated_before"),
        });

        const structuredContent = {
          results: results.map((result) => ({
            id: result.id,
            content: result.content,
            score: result.score,
            workspace: result.workspace,
            updated_at: result.updatedAt.toISOString(),
          })),
        };

        const matchCount = structuredContent.results.length;
        const summary = matchCount === 1 ? "Found 1 matching memory." : `Found ${matchCount} matching memories.`;

        return {
          content: [
            {
              type: "text" as const,
              text: summary,
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
