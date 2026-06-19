import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryApi } from "@/memory.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviewTool } from "./tools/review.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Durable memory for stable preferences, corrections, reusable decisions, and project context not obvious from code or git history.",
  "Workflow: (1) Call `review` with the absolute workspace path at conversation start. This loads workspace and global memories into context.",
  "(2) During the session, call `remember` to save a new fact, `revise` to correct content or promote a project-scoped memory to global scope, and `forget` to remove memories that are wrong or obsolete.",
  "(3) Before calling `remember`, check loaded memories to avoid duplicates. Use `revise` instead when the fact already exists.",
  "Default to workspace scope; pass the absolute workspace path on `remember` for project-scoped memory. Omit it only for facts that apply across all projects.",
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
