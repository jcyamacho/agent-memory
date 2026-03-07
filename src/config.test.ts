import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_MEMORY_DB_PATH_ENV, resolveConfig } from "./config.ts";

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
  });
});
