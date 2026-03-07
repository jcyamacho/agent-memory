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

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const SOURCE_BIAS = 0.15;
const WORKSPACE_BIAS = 0.1;

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
      source: normalizeOptionalString(input.source),
      workspace: normalizeOptionalString(input.workspace),
      session: normalizeOptionalString(input.session),
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.save(memory);
  }

  async search(input: SearchMemoryInput): Promise<MemorySearchResult[]> {
    const query = input.query.trim();

    if (!query) {
      throw new ValidationError("Search query is required.");
    }

    const normalizedQuery: MemorySearchQuery = {
      query,
      limit: normalizeLimit(input.limit),
      preferredSource: normalizeOptionalString(input.preferredSource),
      preferredWorkspace: normalizeOptionalString(input.preferredWorkspace),
      filterSource: normalizeOptionalString(input.filterSource),
      filterWorkspace: normalizeOptionalString(input.filterWorkspace),
      createdAfter: input.createdAfter,
      createdBefore: input.createdBefore,
    };

    const results = await this.repository.search(normalizedQuery);

    return results
      .map((result) => ({
        ...result,
        score: rankResult(result, normalizedQuery),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, normalizedQuery.limit);
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

const rankResult = (result: MemorySearchResult, query: MemorySearchQuery): number => {
  let score = result.score;

  if (query.preferredSource && result.source === query.preferredSource) {
    score += SOURCE_BIAS;
  }

  if (query.preferredWorkspace && result.workspace === query.preferredWorkspace) {
    score += WORKSPACE_BIAS;
  }

  return Number(score.toFixed(6));
};
