import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryService } from "../memory-service.ts";
import { parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  terms: z
    .array(z.string())
    .min(1)
    .describe(
      "Search terms to match against remembered content. Use distinctive keywords, IDs, names, file names, or short phrases as separate items.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of memory results to return. Use a small number when you only need the best matches."),
  preferred_workspace: z
    .string()
    .optional()
    .describe(
      "Preferred workspace or repository path to rank higher when relevant. This does not exclude other workspaces.",
    ),
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
      content: z.string().describe("The remembered content that matched the search terms."),
      score: z.number().describe("Relevance score for this result. Higher means a better match."),
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
        "Retrieve previously remembered context that may help with the current task. Use it for user preferences, project facts, prior decisions, constraints, or earlier conversation details.",
      inputSchema: recallInputSchema,
      outputSchema: recallOutputSchema,
    },
    async ({ terms, limit, preferred_workspace, filter_workspace, created_after, created_before }) => {
      try {
        const results = await memoryService.search({
          terms,
          limit,
          preferredWorkspace: preferred_workspace,
          filterWorkspace: filter_workspace,
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
