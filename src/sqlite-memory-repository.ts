import { randomUUID } from "node:crypto";
import { NotFoundError, PersistenceError } from "./errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryApi,
  MemoryPage,
  MemoryRecord,
  MemorySearchResult,
  SearchMemoryInput,
  UpdateMemoryInput,
} from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import type { SqliteDatabaseLike, SqlStatement } from "./sqlite-db.ts";

interface MemoryRow {
  id: string;
  content: string;
  workspace: string | null;
  created_at: number;
  updated_at: number;
}

interface ScoredMemoryRow extends MemoryRow {
  score: number;
}

const DEFAULT_SEARCH_LIMIT = 15;
const DEFAULT_LIST_LIMIT = 15;

export class SqliteMemoryRepository implements MemoryApi {
  private readonly database: SqliteDatabaseLike;
  private readonly insertStatement: SqlStatement;

  private readonly getStatement: SqlStatement;
  private readonly updateStatement: SqlStatement;
  private readonly deleteStatement: SqlStatement;
  private readonly listWorkspacesStatement: SqlStatement;

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
    this.getStatement = database.prepare(
      "SELECT id, content, workspace, created_at, updated_at FROM memories WHERE id = ?",
    );
    this.updateStatement = database.prepare("UPDATE memories SET content = ?, updated_at = ? WHERE id = ?");
    this.deleteStatement = database.prepare("DELETE FROM memories WHERE id = ?");
    this.listWorkspacesStatement = database.prepare(
      "SELECT DISTINCT workspace FROM memories WHERE workspace IS NOT NULL ORDER BY workspace",
    );
  }

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    try {
      const now = new Date();
      const memory: MemoryRecord = {
        id: randomUUID(),
        content: input.content,
        workspace: input.workspace,
        createdAt: now,
        updatedAt: now,
      };
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

  async search(query: SearchMemoryInput): Promise<MemorySearchResult[]> {
    try {
      const whereParams: unknown[] = [toFtsQuery(query.terms)];
      const limit = query.limit ?? DEFAULT_SEARCH_LIMIT;

      const whereClauses = ["memories_fts MATCH ?"];

      if (query.updatedAfter) {
        whereClauses.push("m.updated_at >= ?");
        whereParams.push(query.updatedAfter.getTime());
      }

      if (query.updatedBefore) {
        whereClauses.push("m.updated_at <= ?");
        whereParams.push(query.updatedBefore.getTime());
      }

      const params = [...whereParams, limit];

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

      const rows = statement.all(...params) as ScoredMemoryRow[];

      const maxScore = Math.max(...rows.map((row) => row.score), 0);

      return rows.map((row) => ({
        ...toMemoryRecord(row),
        score: toNormalizedScore(maxScore > 0 ? row.score / maxScore : 0),
      }));
    } catch (error) {
      throw new PersistenceError("Failed to search memories.", {
        cause: error,
      });
    }
  }
  async get(id: string): Promise<MemoryRecord | undefined> {
    try {
      const rows = this.getStatement.all(id) as MemoryRow[];
      const row = rows[0];
      return row ? toMemoryRecord(row) : undefined;
    } catch (error) {
      throw new PersistenceError("Failed to find memory.", { cause: error });
    }
  }

  async list(options: ListMemoriesInput): Promise<MemoryPage> {
    try {
      const whereClauses: string[] = [];
      const params: unknown[] = [];
      const offset = options.offset ?? 0;
      const limit = options.limit ?? DEFAULT_LIST_LIMIT;

      if (options.workspace) {
        whereClauses.push("workspace = ?");
        params.push(options.workspace);
      } else if (options.workspaceIsNull) {
        whereClauses.push("workspace IS NULL");
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const queryLimit = limit + 1;
      params.push(queryLimit, offset);

      const statement = this.database.prepare(`
        SELECT id, content, workspace, created_at, updated_at
        FROM memories
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);

      const rows = statement.all(...params) as MemoryRow[];
      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map(toMemoryRecord);

      return { items, hasMore };
    } catch (error) {
      throw new PersistenceError("Failed to list memories.", { cause: error });
    }
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    let result: { changes: number } | undefined;
    try {
      const now = Date.now();
      result = this.updateStatement.run(input.content, now, input.id) as { changes: number };
    } catch (error) {
      throw new PersistenceError("Failed to update memory.", { cause: error });
    }
    if (result.changes === 0) {
      throw new NotFoundError(`Memory not found: ${input.id}`);
    }

    const memory = await this.get(input.id);
    if (!memory) {
      throw new NotFoundError(`Memory not found after update: ${input.id}`);
    }

    return memory;
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    let result: { changes: number } | undefined;
    try {
      result = this.deleteStatement.run(input.id) as { changes: number };
    } catch (error) {
      throw new PersistenceError("Failed to delete memory.", { cause: error });
    }
    if (result.changes === 0) {
      throw new NotFoundError(`Memory not found: ${input.id}`);
    }
  }

  async listWorkspaces(): Promise<string[]> {
    try {
      const rows = this.listWorkspacesStatement.all() as Array<{ workspace: string }>;
      return rows.map((row) => row.workspace);
    } catch (error) {
      throw new PersistenceError("Failed to list workspaces.", { cause: error });
    }
  }
}

const toMemoryRecord = (row: MemoryRow): MemoryRecord => ({
  id: row.id,
  content: row.content,
  workspace: row.workspace ?? undefined,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toFtsQuery = (terms: string[]): string => terms.map(toFtsTerm).join(" OR ");

function toFtsTerm(term: string): string {
  const escaped = term.replaceAll('"', '""');
  if (term.includes(" ")) {
    return `"${escaped}"`;
  }
  return `"${escaped}"*`;
}
