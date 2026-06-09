import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../package.json";
import { runCli } from "./cli.ts";
import { resolveConfig } from "./config.ts";
import { FilesystemMemoryRepository } from "./filesystem/index.ts";
import { createMcpServer } from "./mcp/server.ts";
import { MemoryService } from "./memory-service.ts";
import { createGitWorkspaceResolver } from "./workspace-resolver.ts";

const config = resolveConfig();

const workspaceResolver = createGitWorkspaceResolver();
const repository = new FilesystemMemoryRepository(config.storePath);
const memoryService = new MemoryService(repository, workspaceResolver);

const [, , ...args] = process.argv;

if (args.length > 0) {
  process.exit(await runCli(args, memoryService));
}

const server = createMcpServer(memoryService, version);
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to start agent-memory.");
  process.exit(1);
}
