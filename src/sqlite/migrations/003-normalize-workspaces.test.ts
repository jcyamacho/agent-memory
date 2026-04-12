import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import { runSqliteMigrations } from "../index.ts";
import { createMemorySchemaMigration } from "./001-create-memory-schema.ts";
import { createAddMemoryEmbeddingMigration } from "./002-add-memory-embedding.ts";
import { createNormalizeWorkspaceMigration } from "./003-normalize-workspaces.ts";

describe("createNormalizeWorkspaceMigration", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-migration-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("normalizes existing worktree workspaces", async () => {
    const databasePath = join(directory, "normalize-workspaces.db");
    const database = new Database(databasePath);
    const workspaceResolver: WorkspaceResolver = {
      async resolve(workspace: string): Promise<string> {
        return workspace === "/worktrees/feature" ? "/repo" : workspace;
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration, createAddMemoryEmbeddingMigration()]);
    database
      .prepare(
        "INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        "memory-1",
        "Keep repo-scoped decisions at the repo root.",
        "/worktrees/feature",
        new Uint8Array(4),
        Date.now(),
        Date.now(),
      );
    database
      .prepare(
        "INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("memory-2", "Keep non-git paths unchanged.", "/not-a-repo", new Uint8Array(4), Date.now(), Date.now());

    await runSqliteMigrations(database, [createNormalizeWorkspaceMigration(workspaceResolver)]);

    const rows = database.prepare("SELECT id, workspace FROM memories ORDER BY id").all() as Array<{
      id: string;
      workspace: string;
    }>;

    database.close();

    expect(rows).toEqual([
      { id: "memory-1", workspace: "/repo" },
      { id: "memory-2", workspace: "/not-a-repo" },
    ]);
  });

  it("leaves existing workspaces unchanged when normalization falls back", async () => {
    const databasePath = join(directory, "normalize-workspaces-fallback.db");
    const database = new Database(databasePath);
    const workspaceResolver: WorkspaceResolver = {
      async resolve(workspace: string): Promise<string> {
        return workspace;
      },
    };

    await runSqliteMigrations(database, [createMemorySchemaMigration, createAddMemoryEmbeddingMigration()]);
    database
      .prepare(
        "INSERT INTO memories (id, content, workspace, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("memory-1", "Leave unresolved paths alone.", "/missing-worktree", new Uint8Array(4), Date.now(), Date.now());

    await runSqliteMigrations(database, [createNormalizeWorkspaceMigration(workspaceResolver)]);

    const rows = database.prepare("SELECT workspace FROM memories").all() as Array<{ workspace: string }>;

    database.close();

    expect(rows).toEqual([{ workspace: "/missing-worktree" }]);
  });
});
