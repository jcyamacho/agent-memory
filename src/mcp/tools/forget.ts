import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const forgetInputSchema = {
  id: z.string().describe("The memory id to delete. Use an id returned by `recall`."),
};

export function registerForgetTool(server: McpServer, memory: Pick<MemoryApi, "delete">): void {
  server.registerTool(
    "forget",
    {
      description:
        'Permanently delete a wrong or obsolete memory. Use `revise` instead when the fact still exists and only needs correction. Returns `<memory id="..." deleted="true" />`.',
      inputSchema: forgetInputSchema,
    },
    async ({ id }) => {
      try {
        await memory.delete({ id });

        return {
          content: [{ type: "text" as const, text: `<memory id="${id.trim()}" deleted="true" />` }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
