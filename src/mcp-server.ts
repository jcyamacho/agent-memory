import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryService } from "./memory-service.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRecallTool } from "./tools/recall.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Stores decisions, corrections, and context that cannot be derived from code or git history.",
  "Use `recall` at the start of every conversation and again mid-task before making design choices or picking conventions the user may have guided before.",
  "Use `remember` when the user corrects your approach, states a preference, a key decision is established, or you learn project context not obvious from the code.",
  "Before saving a new memory, recall to check whether a memory about the same fact already exists. If so, use `revise` to update it instead of creating a duplicate.",
  "Use `revise` when a previously saved memory is outdated or inaccurate and needs correction rather than deletion.",
  "Use `forget` to remove memories that are wrong, obsolete, or no longer relevant.",
  "Always pass workspace (the current working directory) to scope results to the active project.",
  "Omit workspace only when saving a memory that applies across all projects.",
].join(" ");

export const createMcpServer = (memoryService: MemoryService, version: string): McpServer => {
  const server = new McpServer(
    {
      name: "agent-memory",
      version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerRememberTool(server, memoryService);
  registerRecallTool(server, memoryService);
  registerReviseTool(server, memoryService);
  registerForgetTool(server, memoryService);

  return server;
};
