import { randomUUID } from "node:crypto";
import { ValidationError } from "./errors.ts";
import type {
  MemoryRecord,
  MemoryRepository,
  MemorySearchQuery,
  MemorySearchResult,
  SaveMemoryInput,
  SearchMemoryInput,
} from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";

export const DEFAULT_LIMIT = 15;
export const MAX_LIMIT = 50;
export const RECALL_CANDIDATE_LIMIT_MULTIPLIER = 3;

const RETRIEVAL_SCORE_WEIGHT = 8;
const WORKSPACE_MATCH_WEIGHT = 4;
const RECENCY_WEIGHT = 1;
const MAX_COMPOSITE_SCORE = RETRIEVAL_SCORE_WEIGHT + WORKSPACE_MATCH_WEIGHT + RECENCY_WEIGHT;

export class MemoryService {
  private readonly repository: MemoryRepository;

  constructor(repository: MemoryRepository) {
    this.repository = repository;
  }

  async save(input: SaveMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();

    if (!content) {
      throw new ValidationError("Memory content is required.");
    }

    const now = new Date();
    const memory: MemoryRecord = {
      id: randomUUID(),
      content,
      workspace: normalizeOptionalString(input.workspace),
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.save(memory);
  }

  async search(input: SearchMemoryInput): Promise<MemorySearchResult[]> {
    const terms = normalizeTerms(input.terms);

    if (terms.length === 0) {
      throw new ValidationError("At least one search term is required.");
    }

    const requestedLimit = normalizeLimit(input.limit);
    const workspace = normalizeOptionalString(input.workspace);
    const normalizedQuery: MemorySearchQuery = {
      terms,
      limit: requestedLimit * RECALL_CANDIDATE_LIMIT_MULTIPLIER,
      updatedAfter: input.updatedAfter,
      updatedBefore: input.updatedBefore,
    };

    const results = await this.repository.search(normalizedQuery);
    const reranked = rerankSearchResults(results, workspace);
    return reranked.sort((a, b) => b.score - a.score).slice(0, requestedLimit);
  }
}

const normalizeLimit = (value: number | undefined): number => {
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new ValidationError(`Limit must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  return value;
};

const normalizeOptionalString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeTerms = (terms: string[]): string[] => {
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  return [...new Set(normalizedTerms)];
};

const GLOBAL_WORKSPACE_SCORE = 0.5;

const computeWorkspaceScore = (memoryWs: string | undefined, queryWs: string | undefined): number => {
  if (!memoryWs) return GLOBAL_WORKSPACE_SCORE;
  if (queryWs && memoryWs === queryWs) return 1;
  return 0;
};

const rerankSearchResults = (results: MemorySearchResult[], workspace: string | undefined): MemorySearchResult[] => {
  if (results.length <= 1) {
    return results;
  }

  const updatedAtTimes = results.map((result) => result.updatedAt.getTime());
  const minUpdatedAt = Math.min(...updatedAtTimes);
  const maxUpdatedAt = Math.max(...updatedAtTimes);

  return [...results].map((result) => {
    const workspaceScore = computeWorkspaceScore(result.workspace, workspace);
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
  });
};
