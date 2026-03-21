import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingGenerator } from "../../memory.ts";
import { createPassthroughWorkspaceResolver } from "../../workspace-resolver.ts";
import { decodeEmbedding } from "../embedding-codec.ts";
import { initializeMemoryDatabase, runSqliteMigrations } from "../index.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createMemoryMigrations } from "./index.ts";

function createTestEmbeddingService(): EmbeddingGenerator {
  return {
    async createVector(text: string) {
      return [text.length, 0.5, 0.25];
    },
  };
}

describe("createMemoryMigrations", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-migration-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("initializes the full memory schema", async () => {
    const databasePath = join(directory, "memory.db");
    const database = new Database(databasePath);

    await initializeMemoryDatabase(
      database,
      createMemoryMigrations({
        embeddingService: createTestEmbeddingService(),
        workspaceResolver: createPassthroughWorkspaceResolver(),
      }),
    );

    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('memories', 'memories_fts') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const columns = database.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string; notnull: number }>;
    const versions = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;

    database.close();

    expect(tables).toEqual([{ name: "memories" }, { name: "memories_fts" }]);
    expect(columns.map((column) => column.name)).toEqual([
      "id",
      "content",
      "workspace",
      "embedding",
      "created_at",
      "updated_at",
    ]);
    expect(columns.find((column) => column.name === "embedding")?.notnull).toBe(1);
    expect(versions[0]?.user_version).toBe(3);
  });

  it("uses the provided embedding service for backfills", async () => {
    const databasePath = join(directory, "memory-backfill.db");
    const database = new Database(databasePath);
    const embeddingService: EmbeddingGenerator & { calls: string[] } = {
      calls: [],
      async createVector(text: string) {
        this.calls.push(text);
        return [text.length, 0.5, 0.25];
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration]);
    database
      .prepare("INSERT INTO memories (id, content, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("memory-1", "Backfill me.", "/repo", 1, 1);

    await initializeMemoryDatabase(
      database,
      createMemoryMigrations({
        embeddingService,
        workspaceResolver: createPassthroughWorkspaceResolver(),
      }),
    );

    const storedRows = database.prepare("SELECT embedding FROM memories WHERE id = ?").all("memory-1") as Array<{
      embedding: Uint8Array;
    }>;

    database.close();

    expect(embeddingService.calls).toEqual(["Backfill me."]);
    expect(decodeEmbedding(storedRows[0]?.embedding)).toEqual([12, 0.5, 0.25]);
  });
});
