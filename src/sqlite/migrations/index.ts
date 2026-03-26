import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./002-add-memory-embedding.ts";
import { createNormalizeWorkspaceMigration } from "./003-normalize-workspaces.ts";
import { removeMemoryEmbeddingMigration } from "./004-remove-memory-embedding.ts";
import type { SqliteMigration } from "./types.ts";

export interface CreateMemoryMigrationsOptions {
  workspaceResolver: WorkspaceResolver;
}

export function createMemoryMigrations(options: CreateMemoryMigrationsOptions): readonly SqliteMigration[] {
  return [
    createMemorySchemaMigration,
    createAddMemoryEmbeddingMigration(),
    createNormalizeWorkspaceMigration(options.workspaceResolver),
    removeMemoryEmbeddingMigration,
  ];
}

export type { SqliteMigration } from "./types.ts";
