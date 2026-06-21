import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryApi } from "@/memory.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviewTool } from "./tools/review.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Use agent-memory for durable preferences, decisions, corrections, and hard-to-recover project context.",
  "If memories are not already in context, call `review` with the absolute workspace path before acting.",
  "Use `remember` for new facts, `revise` for existing facts that changed or should become global, and `forget` only for confirmed obsolete or incorrect memories.",
  "Default new memories to workspace scope. Never store secrets, temporary state, or facts obvious from code or git history.",
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
