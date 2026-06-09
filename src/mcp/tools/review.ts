import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { formatMemoriesXml } from "../../memory-format.ts";
import { toMcpError } from "./shared.ts";

export const REVIEW_PAGE_SIZE = 50;

const reviewInputSchema = {
  workspace: z.string().describe("Current working directory for project-scoped listing."),
  page: z.number().int().min(0).optional().describe("Zero-based page number. Defaults to 0."),
};

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
        'Load workspace and global memories sorted by most recently updated. Use at the start of a task and before saving or revising memory. Returns `<memories workspace="..." has_more="true|false">...</memories>` with pagination support. Global memories are marked with `global="true"`.',
      inputSchema: reviewInputSchema,
    },
    async ({ workspace, page }) => {
      try {
        const pageIndex = page ?? 0;
        const result = await memory.list({
          workspace,
          global: true,
          offset: pageIndex * REVIEW_PAGE_SIZE,
          limit: REVIEW_PAGE_SIZE,
        });

        const text = formatMemoriesXml(workspace, result.items, result.hasMore);

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
