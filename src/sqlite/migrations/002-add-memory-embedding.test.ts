import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbeddingGenerator } from "../../memory.ts";
import { decodeEmbedding } from "../embedding-codec.ts";
import { runSqliteMigrations } from "../index.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./002-add-memory-embedding.ts";

describe("createAddMemoryEmbeddingMigration", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-migration-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("backfills embeddings before making the column required", async () => {
    const databasePath = join(directory, "migration-backfill.db");
    const database = new Database(databasePath);
    const embeddingService: EmbeddingGenerator = {
      async createVector(text: string) {
        return [text.length, 0.5, 0.25];
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration]);
    database
      .prepare("INSERT INTO memories (id, content, workspace, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("memory-1", "Backfill me.", "/repo", 1, 1);

    await runSqliteMigrations(database, [
      createMemorySchemaMigration,
      createAddMemoryEmbeddingMigration(embeddingService),
    ]);

    const columns = database.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string; notnull: number }>;
    const storedRows = database.prepare("SELECT embedding FROM memories WHERE id = ?").all("memory-1") as Array<{
      embedding: Uint8Array;
    }>;
    const ftsRows = database
      .prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH ?")
      .all("Backfill") as Array<{ rowid: number }>;

    database.close();

    expect(columns.find((column) => column.name === "embedding")?.notnull).toBe(1);
    expect(decodeEmbedding(storedRows[0]?.embedding)).toEqual([12, 0.5, 0.25]);
    expect(ftsRows).toHaveLength(1);
  });
});
