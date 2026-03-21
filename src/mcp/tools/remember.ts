import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z.string().describe("One new durable fact to save. Use a self-contained sentence or short note."),
  workspace: z
    .string()
    .optional()
    .describe(
      "Pass the current working directory for project-scoped memory. Git worktree paths are saved as the main repo root. Omit for truly global memory.",
    ),
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
        'Save one new durable fact for later recall. Use for stable preferences, corrections, reusable decisions, and project context not obvious from code or git history. Save exactly one fact. If the memory already exists, use `revise` instead. Do not store secrets, temporary task state, or facts obvious from code or git history. Returns `<memory id="..." />`.',
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
