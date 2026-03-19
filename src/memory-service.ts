import { ValidationError } from "./errors.ts";
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
import { rerankSearchResults } from "./ranking.ts";

export const DEFAULT_RECALL_LIMIT = 15;
export const MAX_RECALL_LIMIT = 50;
export const RECALL_CANDIDATE_LIMIT_MULTIPLIER = 3;

const DEFAULT_LIST_LIMIT = 15;
const MAX_LIST_LIMIT = 100;

export class MemoryService implements MemoryApi {
  constructor(private readonly repository: MemoryApi) {}

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();

    if (!content) {
      throw new ValidationError("Memory content is required.");
    }

    return this.repository.create({
      content,
      workspace: normalizeOptionalString(input.workspace),
    });
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();
    if (!content) throw new ValidationError("Memory content is required.");
    return this.repository.update({ id: input.id, content });
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    const id = input.id.trim();
    if (!id) throw new ValidationError("Memory id is required.");
    return this.repository.delete({ id });
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return this.repository.get(id);
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    const workspace = normalizeOptionalString(input.workspace);

    return this.repository.list({
      workspace,
      workspaceIsNull: workspace ? false : Boolean(input.workspaceIsNull),
      offset: normalizeOffset(input.offset),
      limit: normalizeListLimit(input.limit),
    });
  }

  async listWorkspaces(): Promise<string[]> {
    return this.repository.listWorkspaces();
  }

  async search(input: SearchMemoryInput): Promise<MemorySearchResult[]> {
    const terms = normalizeTerms(input.terms);

    if (terms.length === 0) {
      throw new ValidationError("At least one search term is required.");
    }

    const requestedLimit = normalizeLimit(input.limit);
    const workspace = normalizeOptionalString(input.workspace);
    const normalizedQuery: SearchMemoryInput = {
      terms,
      limit: requestedLimit * RECALL_CANDIDATE_LIMIT_MULTIPLIER,
      updatedAfter: input.updatedAfter,
      updatedBefore: input.updatedBefore,
    };

    const results = await this.repository.search(normalizedQuery);
    return rerankSearchResults(results, workspace).slice(0, requestedLimit);
  }
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_RECALL_LIMIT;
  }

  if (!Number.isInteger(value) || value < 1 || value > MAX_RECALL_LIMIT) {
    throw new ValidationError(`Limit must be an integer between 1 and ${MAX_RECALL_LIMIT}.`);
  }

  return value;
}

function normalizeOffset(value: number | undefined): number {
  return Number.isInteger(value) && value && value > 0 ? value : 0;
}

function normalizeListLimit(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(value, 1), MAX_LIST_LIMIT);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTerms(terms: string[]): string[] {
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  return [...new Set(normalizedTerms)];
}
