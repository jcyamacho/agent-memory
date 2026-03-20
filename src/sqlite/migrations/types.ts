import type { SqliteDatabaseLike } from "../types.ts";

export interface SqliteMigration {
  version: number;
  up(database: SqliteDatabaseLike): Promise<void>;
}
