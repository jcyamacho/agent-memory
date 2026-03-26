import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z.string().describe("One new durable fact to save. Use a self-contained sentence or short note."),
  workspace: z
    .string()
    .optional()
    .describe("Current working directory for project-scoped memory. Omit for facts that apply across projects."),
};

export function registerRememberTool(server: McpServer, memory: Pick<MemoryApi, "create">): void {
  server.registerTool(
    "remember",
    {
      annotations: {
        title: "Remember",
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        'Save one new durable fact. Use for stable preferences, reusable decisions, and project context not obvious from code or git history. If the fact already exists, use `revise` instead. Returns `<memory id="..." />`.',
      inputSchema: rememberInputSchema,
    },
    async ({ content, workspace }) => {
      try {
        const savedMemory = await memory.create({
          content,
          workspace,
        });

        return {
          content: [{ type: "text" as const, text: `<memory id="${savedMemory.id}" />` }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
