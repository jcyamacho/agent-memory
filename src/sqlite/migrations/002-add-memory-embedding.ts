import { createMemoryIndexes, createMemorySearchArtifacts, dropMemorySearchArtifacts } from "../memory-schema.ts";
import type { SqliteMigration } from "./types.ts";

export function createAddMemoryEmbeddingMigration(): SqliteMigration {
  return {
    version: 2,
    async up(database) {
      database.exec("ALTER TABLE memories ADD COLUMN embedding BLOB");

      dropMemorySearchArtifacts(database);
      database.exec("ALTER TABLE memories RENAME TO memories_old");
      database.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          workspace TEXT,
          embedding BLOB NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      database.exec(`
        INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at)
        SELECT id, content, workspace, COALESCE(embedding, X'00000000'), created_at, updated_at
        FROM memories_old
      `);
      database.exec("DROP TABLE memories_old");
      createMemoryIndexes(database);
      createMemorySearchArtifacts(database, true);
    },
  };
}
