import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../package.json";
import { resolveConfig } from "./config.ts";
import { createMcpServer } from "./mcp-server.ts";
import { MemoryService } from "./memory-service.ts";
import { openMemoryDatabase } from "./sqlite-db.ts";
import { SqliteMemoryRepository } from "./sqlite-repository.ts";

const { databasePath } = resolveConfig();
const database = openMemoryDatabase(databasePath);
const repository = new SqliteMemoryRepository(database);
const memoryService = new MemoryService(repository);
const server = createMcpServer(memoryService, version);

const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to start agent-memory.");
  database.close();
  process.exit(1);
}
