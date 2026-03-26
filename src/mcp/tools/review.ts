import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi, MemoryRecord } from "../../memory.ts";
import { escapeXml, toMcpError } from "./shared.ts";

export const REVIEW_PAGE_SIZE = 25;

const reviewInputSchema = {
  workspace: z.string().describe("Current working directory for project-scoped listing."),
  page: z.number().int().min(0).optional().describe("Zero-based page number. Defaults to 0."),
};

function toMemoryXml(record: MemoryRecord): string {
  const content = escapeXml(record.content);
  return `<memory id="${record.id}" updated_at="${record.updatedAt.toISOString()}">\n${content}\n</memory>`;
}

export function registerReviewTool(server: McpServer, memory: Pick<MemoryApi, "list">): void {
  server.registerTool(
    "review",
    {
      annotations: {
        title: "Review",
        readOnlyHint: true,
        openWorldHint: false,
      },
      description:
        'Browse all memories for a workspace in creation order. Use before bulk review, cleanup, or when you need to scan memories without specific search terms. For targeted retrieval by topic, use `recall` instead. Returns `<memories workspace="..." has_more="true|false">...</memories>` with pagination support.',
      inputSchema: reviewInputSchema,
    },
    async ({ workspace, page }) => {
      try {
        const pageIndex = page ?? 0;
        const result = await memory.list({
          workspace,
          offset: pageIndex * REVIEW_PAGE_SIZE,
          limit: REVIEW_PAGE_SIZE,
        });

        if (result.items.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories found for this workspace." }],
          };
        }

        const text = `<memories workspace="${escapeXml(workspace)}" has_more="${result.hasMore}">\n${result.items.map(toMemoryXml).join("\n")}\n</memories>`;

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
