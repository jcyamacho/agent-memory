import type { EmbeddingGenerator } from "../../memory.ts";
import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./002-add-memory-embedding.ts";
import { createNormalizeWorkspaceMigration } from "./003-normalize-workspaces.ts";
import type { SqliteMigration } from "./types.ts";

export interface CreateMemoryMigrationsOptions {
  embeddingService: EmbeddingGenerator;
  workspaceResolver: WorkspaceResolver;
}

export function createMemoryMigrations(options: CreateMemoryMigrationsOptions): readonly SqliteMigration[] {
  return [
    createMemorySchemaMigration,
    createAddMemoryEmbeddingMigration(options.embeddingService),
    createNormalizeWorkspaceMigration(options.workspaceResolver),
  ];
}

export type { SqliteMigration } from "./types.ts";
