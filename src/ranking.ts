import { compareVectors } from "./embedding/similarity.ts";
import type { EmbeddingVector } from "./embedding/types.ts";
import type { MemorySearchEntity } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";

const RETRIEVAL_SCORE_WEIGHT = 9;
const EMBEDDING_SIMILARITY_WEIGHT = 4;
const WORKSPACE_MATCH_WEIGHT = 5;
const RECENCY_WEIGHT = 1;
const MAX_COMPOSITE_SCORE =
  RETRIEVAL_SCORE_WEIGHT + EMBEDDING_SIMILARITY_WEIGHT + WORKSPACE_MATCH_WEIGHT + RECENCY_WEIGHT;

const GLOBAL_WORKSPACE_SCORE = 0.5;

export function rerankSearchResults(
  results: MemorySearchEntity[],
  workspace: string | undefined,
  queryEmbedding: EmbeddingVector,
): MemorySearchEntity[] {
  if (results.length === 0) {
    return results;
  }

  const normalizedQueryWs = workspace ? normalizeWorkspacePath(workspace) : undefined;
  const updatedAtTimes = results.map((result) => result.updatedAt.getTime());
  const minUpdatedAt = Math.min(...updatedAtTimes);
  const maxUpdatedAt = Math.max(...updatedAtTimes);

  return results
    .map((result) => {
      const embeddingSimilarityScore = computeEmbeddingSimilarityScore(result, queryEmbedding);
      const workspaceScore = computeWorkspaceScore(result.workspace, normalizedQueryWs);
      const recencyScore =
        maxUpdatedAt === minUpdatedAt ? 0 : (result.updatedAt.getTime() - minUpdatedAt) / (maxUpdatedAt - minUpdatedAt);
      const combinedScore =
        (result.score * RETRIEVAL_SCORE_WEIGHT +
          embeddingSimilarityScore * EMBEDDING_SIMILARITY_WEIGHT +
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

function computeEmbeddingSimilarityScore(result: MemorySearchEntity, queryEmbedding: EmbeddingVector): number {
  return normalizeCosineSimilarity(compareVectors(result.embedding, queryEmbedding));
}

function normalizeWorkspacePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/\/+/g, "/").split("/").filter(Boolean).join("/");
}

function normalizeCosineSimilarity(value: number): number {
  return (value + 1) / 2;
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
  return 0;
}
