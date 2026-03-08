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

export const DEFAULT_LIMIT = 15;
export const MAX_LIMIT = 50;

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

    const normalizedQuery: MemorySearchQuery = {
      terms,
      limit: normalizeLimit(input.limit),
      workspace: normalizeOptionalString(input.workspace),
      createdAfter: input.createdAfter,
      createdBefore: input.createdBefore,
    };

    return this.repository.search(normalizedQuery);
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
