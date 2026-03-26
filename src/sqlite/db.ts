import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { PersistenceError } from "../errors.ts";
import type { WorkspaceResolver } from "../workspace-resolver.ts";
import { createMemoryMigrations, type SqliteMigration } from "./migrations/index.ts";
import type { SqliteDatabaseLike } from "./types.ts";

const PRAGMA_STATEMENTS = [
  "journal_mode = WAL",
  "synchronous = NORMAL",
  "foreign_keys = ON",
  "busy_timeout = 5000",
] as const;

export type SqliteDatabase = Database.Database;

export type { SqliteMigration } from "./migrations/index.ts";
export type { SqliteDatabaseLike, SqlStatement } from "./types.ts";

export interface OpenMemoryDatabaseOptions {
  workspaceResolver: WorkspaceResolver;
}

export async function openMemoryDatabase(
  databasePath: string,
  options: OpenMemoryDatabaseOptions,
): Promise<SqliteDatabase> {
  let database: SqliteDatabase | undefined;

  try {
    mkdirSync(dirname(databasePath), { recursive: true });

    database = new Database(databasePath);
    await initializeMemoryDatabase(database, createMemoryMigrations(options));

    return database;
  } catch (error) {
    database?.close();

    if (error instanceof PersistenceError) {
      throw error;
    }

    throw new PersistenceError("Failed to initialize the SQLite database.", {
      cause: error,
    });
  }
}

export async function initializeMemoryDatabase(
  database: SqliteDatabaseLike,
  migrations: readonly SqliteMigration[],
): Promise<void> {
  try {
    applyPragmas(database);
    await runSqliteMigrations(database, migrations);
  } catch (error) {
    throw new PersistenceError("Failed to initialize the SQLite database.", {
      cause: error,
    });
  }
}

export async function runSqliteMigrations(
  database: SqliteDatabaseLike,
  migrations: readonly SqliteMigration[],
): Promise<void> {
  validateMigrations(migrations);

  let currentVersion = getUserVersion(database);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    database.exec("BEGIN");

    try {
      await migration.up(database);
      setUserVersion(database, migration.version);
      database.exec("COMMIT");
      currentVersion = migration.version;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {}

      throw error;
    }
  }
}

function applyPragmas(database: SqliteDatabaseLike): void {
  if (database.pragma) {
    for (const statement of PRAGMA_STATEMENTS) {
      database.pragma(statement);
    }
    return;
  }
  for (const statement of PRAGMA_STATEMENTS) {
    database.exec(`PRAGMA ${statement}`);
  }
}

function getUserVersion(database: SqliteDatabaseLike): number {
  const rows = database.prepare("PRAGMA user_version").all() as Array<{ user_version: number }>;
  return rows[0]?.user_version ?? 0;
}

function setUserVersion(database: SqliteDatabaseLike, version: number): void {
  database.exec(`PRAGMA user_version = ${version}`);
}

function validateMigrations(migrations: readonly SqliteMigration[]): void {
  let previousVersion = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new Error("SQLite migrations must use strictly increasing versions.");
    }
    previousVersion = migration.version;
  }
}
