import { randomUUID } from "node:crypto";
import { NotFoundError, PersistenceError } from "../errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "../memory.ts";
import type { SqliteDatabaseLike, SqlStatement } from "./types.ts";

interface MemoryRow {
  id: string;
  content: string;
  workspace: string | null;
  created_at: number;
  updated_at: number;
}

const DEFAULT_LIST_LIMIT = 15;

export class SqliteMemoryRepository implements MemoryRepository {
  private readonly database: SqliteDatabaseLike;
  private readonly insertStatement: SqlStatement;
  private readonly getStatement: SqlStatement;
  private readonly updateStatement: SqlStatement;
  private readonly deleteStatement: SqlStatement;
  private readonly listWorkspacesStatement: SqlStatement;

  constructor(database: SqliteDatabaseLike) {
    this.database = database;
    this.insertStatement = database.prepare(`
      INSERT INTO memories (id, content, workspace, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
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

      if (options.workspace && options.global) {
        whereClauses.push("(workspace = ? OR workspace IS NULL)");
        params.push(options.workspace);
      } else if (options.workspace) {
        whereClauses.push("workspace = ?");
        params.push(options.workspace);
      } else if (options.global) {
        whereClauses.push("workspace IS NULL");
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const queryLimit = limit + 1;
      params.push(queryLimit, offset);

      const statement = this.database.prepare(`
        SELECT id, content, workspace, created_at, updated_at
        FROM memories
        ${whereClause}
        ORDER BY updated_at DESC
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
