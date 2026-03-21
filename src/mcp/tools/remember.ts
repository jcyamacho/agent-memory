import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { MemoryApi } from "../../memory.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z
    .string()
    .describe(
      "One durable fact to save. Use a single self-contained sentence or short note with concrete nouns, identifiers, commands, file paths, or exact phrases the agent is likely to reuse.",
    ),
  workspace: z
    .string()
    .optional()
    .describe(
      "Pass the current working directory for project-specific memories. Git worktree paths are saved as the main repo root automatically. Omit only for truly global memories.",
    ),
};

export function registerRememberTool(server: McpServer, memory: Pick<MemoryApi, "create">): void {
  server.registerTool(
    "remember",
    {
      description:
        'Save one durable memory for later recall. Use when the user states a stable preference, corrects you, or establishes reusable project context not obvious from code or git history. Save one fact per memory. Call `recall` first; use `revise` instead of creating duplicates. Do not store secrets, temporary task state, or codebase facts. Returns `<memory id="..." />`.',
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
