import type { EmbeddingGenerator } from "../../memory.ts";
import { encodeEmbedding } from "../embedding-codec.ts";
import {
  createMemoriesTable,
  createMemoryIndexes,
  createMemorySearchArtifacts,
  dropMemorySearchArtifacts,
} from "../memory-schema.ts";
import type { SqliteMigration } from "./types.ts";

interface MemoryEmbeddingRow {
  id: string;
  content: string;
}

export function createAddMemoryEmbeddingMigration(embeddingService: EmbeddingGenerator): SqliteMigration {
  return {
    version: 2,
    async up(database) {
      database.exec("ALTER TABLE memories ADD COLUMN embedding BLOB");

      const rows = database
        .prepare("SELECT id, content FROM memories ORDER BY created_at ASC")
        .all() as MemoryEmbeddingRow[];
      const updateStatement = database.prepare("UPDATE memories SET embedding = ? WHERE id = ?");

      for (const row of rows) {
        const embedding = await embeddingService.createVector(row.content);
        updateStatement.run(encodeEmbedding(embedding), row.id);
      }

      const nullRows = database
        .prepare("SELECT COUNT(*) AS count FROM memories WHERE embedding IS NULL")
        .all() as Array<{ count: number }>;

      if ((nullRows[0]?.count ?? 0) > 0) {
        throw new Error("Failed to backfill embeddings for all memories.");
      }

      dropMemorySearchArtifacts(database);
      database.exec("ALTER TABLE memories RENAME TO memories_old");
      createMemoriesTable(database, { embeddingColumn: "required" });
      database.exec(`
        INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at)
        SELECT id, content, workspace, embedding, created_at, updated_at
        FROM memories_old
      `);
      database.exec("DROP TABLE memories_old");
      createMemoryIndexes(database);
      createMemorySearchArtifacts(database, true);
    },
  };
}
