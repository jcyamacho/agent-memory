import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryService } from "./memory-service.ts";
import { registerRecallTool } from "./tools/recall.ts";
import { registerRememberTool } from "./tools/remember.ts";

export const createMcpServer = (memoryService: MemoryService, version: string): McpServer => {
  const server = new McpServer({
    name: "agent-memory",
    version,
  });

  registerRememberTool(server, memoryService);
  registerRecallTool(server, memoryService);

  return server;
};
