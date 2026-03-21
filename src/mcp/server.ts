import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryApi } from "../memory.ts";
import { registerForgetTool } from "./tools/forget.ts";
import { registerRecallTool } from "./tools/recall.ts";
import { registerRememberTool } from "./tools/remember.ts";
import { registerReviseTool } from "./tools/revise.ts";

const SERVER_INSTRUCTIONS = [
  "Use this server for durable memory: user preferences, corrections, decisions, and project context not obvious from code or git history.",
  "Use `recall` at conversation start and before design choices, conventions, or edge cases.",
  "Query `recall` with 2-5 short anchor-heavy terms or exact phrases likely to appear verbatim in memory text: identifiers, commands, file paths, and conventions.",
  "`recall` is lexical-first; semantic reranking only reorders lexical matches.",
  "If `recall` misses, retry once with overlapping alternate terms.",
  "Use `remember` for one durable fact when the user states a preference, corrects you, or a reusable project decision becomes clear.",
  "Call `recall` before `remember`; if the fact already exists, use `revise` instead of creating a duplicate.",
  "Use `revise` to correct an existing memory and `forget` to remove a wrong or obsolete one.",
  "Pass workspace for project-scoped calls. Git worktree paths are canonicalized to the main repo root on save and recall. Omit workspace only for truly global memories.",
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
