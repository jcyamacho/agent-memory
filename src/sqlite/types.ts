export interface SqlStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabaseLike {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
  pragma?(query: string): unknown;
  close(): void;
}
