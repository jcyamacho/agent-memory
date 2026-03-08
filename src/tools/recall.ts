import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { MAX_LIMIT, type MemoryService } from "../memory-service.ts";
import { parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  terms: z
    .array(z.string())
    .min(1)
    .describe(
      "Search terms used to find relevant memories. Pass 2-5 short, distinctive items as separate array entries, such as project names, file names, APIs, feature names, issue IDs, or brief phrases. Avoid one long sentence.",
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
      "Preferred repository or workspace path for ranking. Use the current project path to bias results toward local context, while still allowing cross-workspace matches.",
    ),
  created_after: z
    .string()
    .optional()
    .describe(
      "Only return memories created at or after this ISO 8601 timestamp. Use it when you need to narrow recall to newer context.",
    ),
  created_before: z
    .string()
    .optional()
    .describe(
      "Only return memories created at or before this ISO 8601 timestamp. Use it when you need to narrow recall to older context.",
    ),
};

const recallOutputSchema = {
  results: z.array(
    z.object({
      id: z.string().describe("Stable identifier for the remembered item."),
      content: z.string().describe("Saved memory text that matched one or more search terms."),
      score: z.number().describe("Relative relevance score for ranking results. Higher means a stronger match."),
      workspace: z.string().optional().describe("Workspace associated with the memory, if available."),
      created_at: z.string().describe("ISO 8601 timestamp showing when the memory was created."),
    }),
  ),
};

export const registerRecallTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "recall",
    {
      description:
        "Recall previously saved context for the current task. Best results usually come from 2-5 short, distinctive terms such as project names, file names, APIs, decisions, or issue IDs.",
      inputSchema: recallInputSchema,
      outputSchema: recallOutputSchema,
    },
    async ({ terms, limit, workspace, created_after, created_before }) => {
      try {
        const results = await memoryService.search({
          terms,
          limit,
          workspace,
          createdAfter: parseOptionalDate(created_after, "created_after"),
          createdBefore: parseOptionalDate(created_before, "created_before"),
        });

        const structuredContent = {
          results: results.map((result) => ({
            id: result.id,
            content: result.content,
            score: result.score,
            workspace: result.workspace,
            created_at: result.createdAt.toISOString(),
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
