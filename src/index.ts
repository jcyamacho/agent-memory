import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../package.json";

const server = new McpServer({
  name: "agent-memory",
  version,
});

const transport = new StdioServerTransport();
await server.connect(transport);
