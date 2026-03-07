import { PersistenceError } from "./errors.ts";
import type { MemoryRecord, MemoryRepository, MemorySearchQuery, MemorySearchResult } from "./memory.ts";
import type { SqliteDatabaseLike, SqlStatement } from "./sqlite-db.ts";

interface MemoryRow {
  id: string;
  content: string;
  source: string | null;
  workspace: string | null;
  session: string | null;
  created_at: number;
  score: number;
}

const CANDIDATE_MULTIPLIER = 5;
const MIN_CANDIDATES = 25;
const MAX_CANDIDATES = 100;

export class SqliteMemoryRepository implements MemoryRepository {
  private readonly database: SqliteDatabaseLike;
  private readonly insertStatement: SqlStatement;

  constructor(database: SqliteDatabaseLike) {
    this.database = database;
    this.insertStatement = database.prepare(`
      INSERT INTO memories (
        id,
        content,
        source,
        workspace,
        session,
        created_at,
        updated_at
      ) VALUES (
        ?,
        ?,
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
        memory.source,
        memory.workspace,
        memory.session,
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
      const whereClauses = ["memories_fts MATCH ?"];
      const params: unknown[] = [query.query];

      if (query.filterSource) {
        whereClauses.push("m.source = ?");
        params.push(query.filterSource);
      }

      if (query.filterWorkspace) {
        whereClauses.push("m.workspace = ?");
        params.push(query.filterWorkspace);
      }

      if (query.createdAfter) {
        whereClauses.push("m.created_at >= ?");
        params.push(query.createdAfter.getTime());
      }

      if (query.createdBefore) {
        whereClauses.push("m.created_at <= ?");
        params.push(query.createdBefore.getTime());
      }

      const statement = this.database.prepare(`
        SELECT
          m.id,
          m.content,
          m.source,
          m.workspace,
          m.session,
          m.created_at,
          MAX(0, -bm25(memories_fts)) AS score
        FROM memories_fts
        INNER JOIN memories AS m ON m.rowid = memories_fts.rowid
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY bm25(memories_fts)
        LIMIT ?
      `);
      params.push(toCandidateLimit(query.limit));

      const rows = statement.all(...params) as MemoryRow[];

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        score: row.score,
        source: row.source ?? undefined,
        workspace: row.workspace ?? undefined,
        session: row.session ?? undefined,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      throw new PersistenceError("Failed to search memories.", {
        cause: error,
      });
    }
  }
}

const toCandidateLimit = (limit: number): number =>
  Math.min(Math.max(limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATES), MAX_CANDIDATES);
