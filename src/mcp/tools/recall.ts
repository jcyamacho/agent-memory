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
      "Pass 2-5 short anchor-heavy terms or exact phrases as separate entries. Prefer identifiers, commands, file paths, package names, and conventions likely to appear verbatim. Avoid vague words, full questions, and repeating the workspace name.",
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
      "Pass the current working directory to prefer memories from the active project. Git worktree paths are normalized to the main repo root for matching.",
    ),
  updated_after: z.string().optional().describe("Only return memories updated on or after this ISO 8601 timestamp."),
  updated_before: z.string().optional().describe("Only return memories updated on or before this ISO 8601 timestamp."),
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
      annotations: {
        title: "Recall",
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        "Find memories relevant to the current task or check whether a fact already exists before saving. Use at conversation start and before design choices. Pass short anchor-heavy `terms` and `workspace` when available. Returns `<memories>...</memories>` or a no-match hint.",
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
            ? "No matching memories found. Retry once with 1-3 overlapping alternate terms or an exact identifier, command, file path, or phrase likely to appear in the memory."
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
