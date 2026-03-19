import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const forgetInputSchema = {
  id: z.string().describe("The id of the memory to delete. Use the id returned by a previous recall result."),
};

export function registerForgetTool(server: McpServer, memory: Pick<MemoryApi, "delete">): void {
  server.registerTool(
    "forget",
    {
      description:
        "Permanently delete a memory that is wrong, obsolete, or no longer relevant. Pass the memory id from a previous recall result.",
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
