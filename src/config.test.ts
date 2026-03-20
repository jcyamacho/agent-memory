import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AGENT_MEMORY_DB_PATH_ENV,
  AGENT_MEMORY_MODELS_CACHE_PATH_ENV,
  DEFAULT_UI_PORT,
  resolveConfig,
} from "./config.ts";

describe("resolveConfig", () => {
  it("uses the configured database path from the environment", () => {
    const config = resolveConfig({
      [AGENT_MEMORY_DB_PATH_ENV]: "/tmp/custom-memory.db",
    });

    expect(config.databasePath).toBe("/tmp/custom-memory.db");
  });

  it("falls back to the default user config path", () => {
    const config = resolveConfig({});

    expect(config.databasePath).toBe(join(homedir(), ".config", "agent-memory", "memory.db"));
    expect(config.modelsCachePath).toBe(join(homedir(), ".config", "agent-memory", "models"));
  });

  it("uses the configured models cache path from the environment", () => {
    const config = resolveConfig({
      [AGENT_MEMORY_MODELS_CACHE_PATH_ENV]: "/tmp/custom-models-cache",
    });

    expect(config.modelsCachePath).toBe("/tmp/custom-models-cache");
  });

  it("detects --ui flag", () => {
    const config = resolveConfig({}, ["--ui"]);

    expect(config.uiMode).toBe(true);
    expect(config.uiPort).toBe(DEFAULT_UI_PORT);
  });

  it("defaults to non-ui mode", () => {
    const config = resolveConfig({}, []);

    expect(config.uiMode).toBe(false);
  });

  it("parses --port flag", () => {
    const config = resolveConfig({}, ["--ui", "--port", "9090"]);

    expect(config.uiPort).toBe(9090);
  });
});
