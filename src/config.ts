import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_MEMORY_STORE_PATH_ENV = "AGENT_MEMORY_STORE_PATH";

export interface AppConfig {
  storePath: string;
}

export function resolveConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    storePath: resolveStorePath(environment),
  };
}

export function resolveStorePath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment[AGENT_MEMORY_STORE_PATH_ENV] || join(homedir(), ".config", "agent-memory");
}
