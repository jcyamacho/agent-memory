import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPassthroughWorkspaceResolver } from "../../workspace-resolver.ts";
import { initializeMemoryDatabase } from "../index.ts";
import { createMemoryMigrations } from "./index.ts";

describe("createMemoryMigrations", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-migration-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("initializes the full memory schema without embedding column", async () => {
    const databasePath = join(directory, "memory.db");
    const database = new Database(databasePath);

    await initializeMemoryDatabase(
      database,
      createMemoryMigrations({
        workspaceResolver: createPassthroughWorkspaceResolver(),
      }),
    );

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memories', 'memories_fts') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const columns = database.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>;
    const versions = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;

    database.close();

    expect(tables).toEqual([{ name: "memories" }, { name: "memories_fts" }]);
    expect(columns.map((column) => column.name)).toEqual(["id", "content", "workspace", "created_at", "updated_at"]);
    expect(versions[0]?.user_version).toBe(4);
  });
});
