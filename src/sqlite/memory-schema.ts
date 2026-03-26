import type { SqliteDatabaseLike } from "./types.ts";

export function createMemoriesTable(database: SqliteDatabaseLike): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      workspace TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function createMemoryIndexes(database: SqliteDatabaseLike): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at);
    CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace);
  `);
}

export function createMemorySearchArtifacts(database: SqliteDatabaseLike, rebuild = false): void {
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      content = 'memories',
      content_rowid = 'rowid',
      tokenize = 'porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content)
      VALUES ('delete', old.rowid, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content)
      VALUES ('delete', old.rowid, old.content);
      INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
    END;
  `);

  if (rebuild) {
    database.exec("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')");
  }
}

export function dropMemorySearchArtifacts(database: SqliteDatabaseLike): void {
  database.exec(`
    DROP TRIGGER IF EXISTS memories_ai;
    DROP TRIGGER IF EXISTS memories_ad;
    DROP TRIGGER IF EXISTS memories_au;
    DROP TABLE IF EXISTS memories_fts;
  `);
}
