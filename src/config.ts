import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

export const AGENT_MEMORY_DB_PATH_ENV = "AGENT_MEMORY_DB_PATH";
export const AGENT_MEMORY_MODELS_CACHE_PATH_ENV = "AGENT_MEMORY_MODELS_CACHE_PATH";

export const DEFAULT_UI_PORT = 6580;

export interface AppConfig {
  databasePath: string;
  modelsCachePath: string;
  uiMode: boolean;
  uiPort: number;
}

export function resolveConfig(
  environment: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): AppConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      ui: { type: "boolean", default: false },
      port: { type: "string", default: String(DEFAULT_UI_PORT) },
    },
    strict: false,
  });

  return {
    databasePath: resolveDatabasePath(environment),
    modelsCachePath: resolveModelsCachePath(environment),
    uiMode: Boolean(values.ui),
    uiPort: Number(values.port) || DEFAULT_UI_PORT,
  };
}

export function resolveDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment[AGENT_MEMORY_DB_PATH_ENV] || join(homedir(), ".config", "agent-memory", "memory.db");
}

export function resolveModelsCachePath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment[AGENT_MEMORY_MODELS_CACHE_PATH_ENV] || join(homedir(), ".config", "agent-memory", "models");
}
