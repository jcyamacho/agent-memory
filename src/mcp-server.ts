import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryService } from "./memory-service.ts";
import { registerRecallTool } from "./tools/recall.ts";
import { registerRememberTool } from "./tools/remember.ts";

const SERVER_INSTRUCTIONS = [
  "Persistent memory for coding agents.",
  "Use `recall` at the start of every conversation and whenever prior preferences, decisions, or project context may be relevant.",
  "Use `remember` when the user corrects your approach, states a preference, a key decision is established, or you learn project context not obvious from the code.",
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

  return server;
};
