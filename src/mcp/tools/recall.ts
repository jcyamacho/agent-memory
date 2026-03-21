import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi, MemorySearchResult } from "../../memory.ts";
import { MAX_RECALL_LIMIT } from "../../memory-service.ts";
import { escapeXml, parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  terms: z
    .array(z.string())
    .min(1)
    .describe(
      "Search terms for lexical memory lookup. Pass 2-5 short anchor-heavy terms or exact phrases as separate entries. Prefer identifiers, commands, file paths, package names, and conventions likely to appear verbatim in the memory. Avoid vague words, full sentences, and repeating the workspace name. If recall misses, retry once with overlapping alternate terms.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_RECALL_LIMIT)
    .optional()
    .describe("Maximum matches to return. Keep this small when you only need the strongest hits."),
  workspace: z
    .string()
    .optional()
    .describe(
      "Pass the current working directory. Git worktree paths are normalized to the main repo root for matching. This strongly boosts memories from the active project while still allowing global and cross-workspace matches.",
    ),
  updated_after: z.string().optional().describe("Only return memories updated at or after this ISO 8601 timestamp."),
  updated_before: z.string().optional().describe("Only return memories updated at or before this ISO 8601 timestamp."),
};

function toMemoryXml(r: MemorySearchResult): string {
  const workspace = r.workspace ? ` workspace="${escapeXml(r.workspace)}"` : "";
  const content = escapeXml(r.content);
  const score = Number(r.score.toFixed(3)).toString();
  return `<memory id="${r.id}" score="${score}"${workspace} updated_at="${r.updatedAt.toISOString()}">\n${content}\n</memory>`;
}

export function registerRecallTool(server: McpServer, memory: Pick<MemoryApi, "search">): void {
  server.registerTool(
    "recall",
    {
      description:
        "Retrieve relevant memories for the current task. Use at conversation start and before design choices, conventions, or edge cases. Query with 2-5 short anchor-heavy terms or exact phrases, not questions or full sentences. `recall` is lexical-first; semantic reranking only reorders lexical matches. If it misses, retry once with overlapping alternate terms. Pass workspace; git worktree paths are normalized to the main repo root for matching. Returns `<memories>...</memories>` or a no-match hint.",
      inputSchema: recallInputSchema,
    },
    async ({ terms, limit, workspace, updated_after, updated_before }) => {
      try {
        const results = await memory.search({
          terms,
          limit,
          workspace,
          updatedAfter: parseOptionalDate(updated_after, "updated_after"),
          updatedBefore: parseOptionalDate(updated_before, "updated_before"),
        });

        const text =
          results.length === 0
            ? "No matching memories found. Retry once with 1-3 alternate overlapping terms or an exact phrase likely to appear in the memory text. Recall is lexical-first, so semantic reranking cannot rescue a query with no wording overlap."
            : `<memories>\n${results.map(toMemoryXml).join("\n")}\n</memories>`;

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
