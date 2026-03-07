import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryService } from "./memory-service.ts";
import { registerSaveMemoryTool } from "./tools/save-memory.ts";
import { registerSearchMemoryTool } from "./tools/search-memory.ts";

export const createMcpServer = (memoryService: MemoryService, version: string): McpServer => {
  const server = new McpServer({
    name: "agent-memory",
    version,
  });

  registerSaveMemoryTool(server, memoryService);
  registerSearchMemoryTool(server, memoryService);

  return server;
};
