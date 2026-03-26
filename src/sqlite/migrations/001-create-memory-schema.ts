import { createMemoriesTable, createMemoryIndexes, createMemorySearchArtifacts } from "../memory-schema.ts";
import type { SqliteMigration } from "./types.ts";

export const createMemorySchemaMigration: SqliteMigration = {
  version: 1,
  async up(database) {
    createMemoriesTable(database);
    createMemoryIndexes(database);
    createMemorySearchArtifacts(database);
  },
};
