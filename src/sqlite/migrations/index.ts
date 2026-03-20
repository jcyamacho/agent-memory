import { EmbeddingService } from "../../embedding/service.ts";
import type { EmbeddingGenerator } from "../../memory.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./002-add-memory-embedding.ts";
import type { SqliteMigration } from "./types.ts";

export function createMemoryMigrations(
  embeddingService: EmbeddingGenerator = new EmbeddingService(),
): readonly SqliteMigration[] {
  return [createMemorySchemaMigration, createAddMemoryEmbeddingMigration(embeddingService)];
}

export const MEMORY_MIGRATIONS: readonly SqliteMigration[] = createMemoryMigrations();

export type { SqliteMigration } from "./types.ts";
