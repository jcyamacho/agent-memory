import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import type { SqliteMigration } from "./types.ts";

interface WorkspaceRow {
  workspace: string;
}

export function createNormalizeWorkspaceMigration(workspaceResolver: WorkspaceResolver): SqliteMigration {
  return {
    version: 3,
    async up(database) {
      const rows = database
        .prepare("SELECT DISTINCT workspace FROM memories WHERE workspace IS NOT NULL ORDER BY workspace")
        .all() as WorkspaceRow[];
      const updateStatement = database.prepare("UPDATE memories SET workspace = ? WHERE workspace = ?");

      for (const row of rows) {
        const normalizedWorkspace = await workspaceResolver.resolve(row.workspace);
        if (!normalizedWorkspace || normalizedWorkspace === row.workspace) {
          continue;
        }

        updateStatement.run(normalizedWorkspace, row.workspace);
      }
    },
  };
}
