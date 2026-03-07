import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_MEMORY_DB_PATH_ENV = "AGENT_MEMORY_DB_PATH";

export interface AppConfig {
  databasePath: string;
}

export const resolveConfig = (environment: NodeJS.ProcessEnv = process.env): AppConfig => ({
  databasePath: environment[AGENT_MEMORY_DB_PATH_ENV] || join(homedir(), ".config", "agent-memory", "memory.db"),
});
