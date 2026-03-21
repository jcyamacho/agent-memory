import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryApi } from "../memory.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRecallTool } from "./tools/recall.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Use this server only for durable memory that should survive across turns: stable preferences, corrections, reusable decisions, and project context not obvious from code or git history.",
  "Use `recall` at conversation start, before design choices, and before saving or revising memory.",
  "Use `remember` for one new durable fact. Use `revise` when the fact already exists but needs correction.",
  "Use `forget` only when a memory is wrong or obsolete.",
  "Pass workspace for project-scoped memory. Omit it only for facts that apply across projects.",
  "Do not store secrets, temporary task state, or facts obvious from current code or git history.",
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
  registerRecallTool(server, memory);
  registerReviseTool(server, memory);
  registerForgetTool(server, memory);

  return server;
}
