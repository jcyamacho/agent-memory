import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../package.json";
import { resolveConfig } from "./config.ts";
import { createMcpServer } from "./mcp/server.ts";
import { MemoryService } from "./memory-service.ts";
import { openMemoryDatabase } from "./sqlite-db.ts";
import { SqliteMemoryRepository } from "./sqlite-memory-repository.ts";
import { startWebServer } from "./ui/server.tsx";

const config = resolveConfig();
const database = openMemoryDatabase(config.databasePath);

const repository = new SqliteMemoryRepository(database);
const memoryService = new MemoryService(repository);

if (config.uiMode) {
  const server = startWebServer(memoryService, { port: config.uiPort });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : config.uiPort;
  console.log(`agent-memory UI running at http://localhost:${port}`);

  function shutdown(): void {
    server.close();
    database.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  const server = createMcpServer(memoryService, version);
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to start agent-memory.");
    database.close();
    process.exit(1);
  }
}
