import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryApi } from "../memory.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviewTool } from "./tools/review.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Durable memory for stable preferences, corrections, reusable decisions, and project context not obvious from code or git history.",
  "Workflow: (1) Call `review` with the current workspace at conversation start -- this loads workspace and global memories into context.",
  "(2) During the session, call `remember` to save a new fact, `revise` to correct content or promote a project-scoped memory to global scope, and call `forget` to remove one that is wrong or obsolete.",
  "Always check loaded memories before calling `remember` to avoid duplicates -- use `revise` instead when the fact already exists.",
  "Pass workspace on `remember` for project-scoped memory. Omit it only for facts that apply across all projects.",
  "Never store secrets, temporary task state, or facts obvious from current code or git history.",
].join(" ");

export function createMcpServer(memory: MemoryApi, version: string): McpServer {
  const server = new McpServer(
    {
      name: "agent-memory",
      version,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  registerRememberTool(server, memory);
  registerReviseTool(server, memory);
  registerForgetTool(server, memory);
  registerReviewTool(server, memory);

  return server;
}
