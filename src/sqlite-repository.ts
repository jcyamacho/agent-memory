import { PersistenceError } from "./errors.ts";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import type { SqliteDatabaseLike, SqlStatement } from "./sqlite-db.ts";

interface MemoryRow {
  id: string;
  content: string;
  workspace: string | null;
  created_at: number;
  updated_at: number;
  score: number;
}

export class SqliteMemoryRepository implements MemoryRepository {
  private readonly database: SqliteDatabaseLike;
  private readonly insertStatement: SqlStatement;

  constructor(database: SqliteDatabaseLike) {
    this.database = database;
    this.insertStatement = database.prepare(`
      INSERT INTO memories (
        id,
        content,
        workspace,
        created_at,
        updated_at
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `);
  }

  async save(memory: MemoryRecord): Promise<MemoryRecord> {
    try {
      this.insertStatement.run(
        memory.id,
        memory.content,
        memory.workspace,
        memory.createdAt.getTime(),
        memory.updatedAt.getTime(),
      );
      return memory;
    } catch (error) {
      throw new PersistenceError("Failed to save memory.", { cause: error });
    }
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    try {
      const whereParams: unknown[] = [toFtsQuery(query.terms)];

      const whereClauses = ["memories_fts MATCH ?"];

      if (query.createdAfter) {
        whereClauses.push("m.created_at >= ?");
        whereParams.push(query.createdAfter.getTime());
      }

      if (query.createdBefore) {
        whereClauses.push("m.created_at <= ?");
        whereParams.push(query.createdBefore.getTime());
      }

      const params = [...whereParams, query.limit];

      const statement = this.database.prepare(`
        SELECT
          m.id,
          m.content,
          m.workspace,
          m.created_at,
          m.updated_at,
          MAX(0, -bm25(memories_fts)) AS score
        FROM memories_fts
        INNER JOIN memories AS m ON m.rowid = memories_fts.rowid
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY score DESC
        LIMIT ?
      `);

      const rows = statement.all(...params) as MemoryRow[];

      const maxScore = Math.max(...rows.map((row) => row.score), 0);

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        score: toNormalizedScore(maxScore > 0 ? row.score / maxScore : 0),
        workspace: row.workspace ?? undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    } catch (error) {
      throw new PersistenceError("Failed to search memories.", {
        cause: error,
      });
    }
  }
}

const toFtsQuery = (terms: string[]): string => terms.map(toFtsTerm).join(" OR ");

const toFtsTerm = (term: string): string => {
  const escaped = term.replaceAll('"', '""');
  if (term.includes(" ")) {
    return `"${escaped}"`;
  }
  return `"${escaped}"*`;
};
