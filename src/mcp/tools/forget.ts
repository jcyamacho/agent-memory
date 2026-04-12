import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError, toMemoryXml } from "./shared.ts";

const forgetInputSchema = {
  id: z.string().describe("Memory id to delete. Use an id returned by `review`."),
};

export function registerForgetTool(server: McpServer, memory: Pick<MemoryApi, "delete">): void {
  server.registerTool(
    "forget",
    {
      annotations: {
        title: "Forget",
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        'Delete a memory that is wrong or obsolete. Use after `review` when you have the memory id. Use `revise` instead if the fact should remain with corrected wording. Returns the deleted memory as `<memory ... deleted="true">...</memory>`.',
      inputSchema: forgetInputSchema,
    },
    async ({ id }) => {
      try {
        const deletedMemory = await memory.delete({ id });

        return {
          content: [{ type: "text" as const, text: toMemoryXml(deletedMemory, { deleted: true }) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
