import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryApi } from "@/memory.ts";
import { formatForgetResultsXml } from "@/memory-format.ts";
import { toMcpError } from "./shared.ts";

const forgetInputSchema = {
  ids: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(50)
    .describe("One to 50 memory ids to delete. Use ids returned by `review`. Duplicate ids are ignored."),
};

export function registerForgetTool(server: McpServer, memory: Pick<MemoryApi, "delete">): void {
  server.registerTool(
    "forget",
    {
      annotations: {
        title: "Forget",
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Delete one or more memories that are wrong or obsolete. Use after `review` when you have the memory ids. Use `revise` instead if a fact should remain with corrected wording. Processes up to 50 ids with best-effort semantics and returns ordered results as `<forget_results>...</forget_results>`.",
      inputSchema: forgetInputSchema,
    },
    async ({ ids }) => {
      try {
        const result = await memory.delete({ ids });

        return {
          content: [{ type: "text" as const, text: formatForgetResultsXml(result) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
