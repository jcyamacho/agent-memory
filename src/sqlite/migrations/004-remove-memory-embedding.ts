import {
  createMemoriesTable,
  createMemoryIndexes,
  createMemorySearchArtifacts,
  dropMemorySearchArtifacts,
} from "../memory-schema.ts";
import type { SqliteMigration } from "./types.ts";

export const removeMemoryEmbeddingMigration: SqliteMigration = {
  version: 4,
  async up(database) {
    dropMemorySearchArtifacts(database);
    database.exec("ALTER TABLE memories RENAME TO memories_old");
    createMemoriesTable(database);
    database.exec(`
      INSERT INTO memories (id, content, workspace, created_at, updated_at)
      SELECT id, content, workspace, created_at, updated_at
      FROM memories_old
    `);
    database.exec("DROP TABLE memories_old");
    createMemoryIndexes(database);
    createMemorySearchArtifacts(database, true);
  },
};
