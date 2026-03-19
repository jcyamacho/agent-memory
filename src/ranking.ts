import type { MemorySearchResult } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";

const RETRIEVAL_SCORE_WEIGHT = 8;
const WORKSPACE_MATCH_WEIGHT = 4;
const RECENCY_WEIGHT = 1;
const MAX_COMPOSITE_SCORE = RETRIEVAL_SCORE_WEIGHT + WORKSPACE_MATCH_WEIGHT + RECENCY_WEIGHT;

const GLOBAL_WORKSPACE_SCORE = 0.5;
const SIBLING_WORKSPACE_SCORE = 0.25;

export function rerankSearchResults(
  results: MemorySearchResult[],
  workspace: string | undefined,
): MemorySearchResult[] {
  if (results.length <= 1) {
    return results;
  }

  const normalizedQueryWs = workspace ? normalizeWorkspacePath(workspace) : undefined;
  const updatedAtTimes = results.map((result) => result.updatedAt.getTime());
  const minUpdatedAt = Math.min(...updatedAtTimes);
  const maxUpdatedAt = Math.max(...updatedAtTimes);

  return results
    .map((result) => {
      const workspaceScore = computeWorkspaceScore(result.workspace, normalizedQueryWs);
      const recencyScore =
        maxUpdatedAt === minUpdatedAt ? 0 : (result.updatedAt.getTime() - minUpdatedAt) / (maxUpdatedAt - minUpdatedAt);
      const combinedScore =
        (result.score * RETRIEVAL_SCORE_WEIGHT +
          workspaceScore * WORKSPACE_MATCH_WEIGHT +
          recencyScore * RECENCY_WEIGHT) /
        MAX_COMPOSITE_SCORE;

      return {
        ...result,
        score: toNormalizedScore(combinedScore),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function normalizeWorkspacePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/\/+/g, "/").split("/").filter(Boolean).join("/");
}

function computeWorkspaceScore(memoryWs: string | undefined, queryWs: string | undefined): number {
  if (!queryWs) {
    return 0;
  }

  if (!memoryWs) {
    return GLOBAL_WORKSPACE_SCORE;
  }

  const normalizedMemoryWs = normalizeWorkspacePath(memoryWs);
  if (normalizedMemoryWs === queryWs) {
    return 1;
  }

  const queryLastSlashIndex = queryWs.lastIndexOf("/");
  const memoryLastSlashIndex = normalizedMemoryWs.lastIndexOf("/");
  if (queryLastSlashIndex <= 0 || memoryLastSlashIndex <= 0) {
    return 0;
  }

  const queryParent = queryWs.slice(0, queryLastSlashIndex);
  const memoryParent = normalizedMemoryWs.slice(0, memoryLastSlashIndex);
  return memoryParent === queryParent ? SIBLING_WORKSPACE_SCORE : 0;
}
