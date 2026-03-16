import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemorySearchResult } from "../memory.ts";
import { MAX_LIMIT, type MemoryService } from "../memory-service.ts";
import { escapeXml, parseOptionalDate, toMcpError } from "./shared.ts";

const recallInputSchema = {
  terms: z
    .array(z.string())
    .min(1)
    .describe(
      "Search terms used to find relevant memories. Pass 2-5 short, distinctive items as separate array entries. Be specific: instead of 'preferences' or 'context', name the actual topic -- e.g. 'error handling', 'commit format', 'testing strategy'. Do not repeat the project or workspace name here -- use the workspace parameter for project scoping. Avoid full sentences.",
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

const toMemoryXml = (r: MemorySearchResult): string => {
  const workspace = r.workspace ? ` workspace="${escapeXml(r.workspace)}"` : "";
  const content = escapeXml(r.content);
  return `<memory id="${r.id}" score="${r.score}"${workspace} updated_at="${r.updatedAt.toISOString()}">\n${content}\n</memory>`;
};

export const registerRecallTool = (server: McpServer, memoryService: MemoryService): void => {
  server.registerTool(
    "recall",
    {
      description:
        "Search memories for prior decisions, corrections, and context that cannot be derived from code or git history. Call at the start of every conversation and again mid-task when you are about to make a design choice, pick a convention, or handle an edge case that the user may have guided before. Always pass workspace.",
      inputSchema: recallInputSchema,
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

        const text =
          results.length === 0
            ? "No matching memories found."
            : `<memories>\n${results.map(toMemoryXml).join("\n")}\n</memories>`;

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
};
