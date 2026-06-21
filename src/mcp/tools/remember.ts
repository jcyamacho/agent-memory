import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryApi } from "@/memory.ts";
import { toMemoryXml } from "@/memory-format.ts";
import { toMcpError } from "./shared.ts";

const rememberInputSchema = {
  content: z.string().describe("One new durable fact to save. Use a self-contained sentence or short note."),
  workspace: z
    .string()
    .optional()
    .describe(
      "Absolute path of the current working directory for project-scoped memory. Omit only for facts that apply across all projects.",
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
        "Save one new durable fact, such as a stable preference, decision, or hard-to-recover project constraint. Use `revise` when an equivalent memory already exists. Never store secrets or temporary state. Returns `<memory ...>` XML.",
      inputSchema: rememberInputSchema,
    },
    async ({ content, workspace }) => {
      try {
        const savedMemory = await memory.create({
          content,
          workspace,
        });

        return {
          content: [{ type: "text" as const, text: toMemoryXml(savedMemory) }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );
}
