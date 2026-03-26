import { ValidationError } from "./errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  EmbeddingGenerator,
  ListMemoriesInput,
  MemoryApi,
  MemoryEntity,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  MemorySearchEntity,
  MemorySearchResult,
  SearchMemoryInput,
  UpdateMemoryInput,
} from "./memory.ts";
import { rerankSearchResults } from "./ranking.ts";
import type { WorkspaceResolver } from "./workspace-resolver.ts";

export const DEFAULT_RECALL_LIMIT = 15;
export const MAX_RECALL_LIMIT = 50;
export const RECALL_CANDIDATE_LIMIT_MULTIPLIER = 2;

const DEFAULT_LIST_LIMIT = 15;
const MAX_LIST_LIMIT = 100;

export class MemoryService implements MemoryApi {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly embeddingService: EmbeddingGenerator,
    private readonly workspaceResolver: WorkspaceResolver,
  ) {}

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();

    if (!content) {
      throw new ValidationError("Memory content is required.");
    }

    const workspace = await this.workspaceResolver.resolve(input.workspace);

    const memory = await this.repository.create({
      content,
      embedding: await this.embeddingService.createVector(content),
      workspace,
    });

    return toPublicMemoryRecord(memory);
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();
    if (!content) throw new ValidationError("Memory content is required.");

    const memory = await this.repository.update({
      id: input.id,
      content,
      embedding: await this.embeddingService.createVector(content),
    });

    return toPublicMemoryRecord(memory);
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    const id = input.id.trim();
    if (!id) throw new ValidationError("Memory id is required.");
    return this.repository.delete({ id });
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    const memory = await this.repository.get(id);
    return memory ? toPublicMemoryRecord(memory) : undefined;
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    const queryWorkspace = normalizeOptionalString(input.workspace);
    const workspace = await this.workspaceResolver.resolve(input.workspace);

    const page = await this.repository.list({
      workspace,
      global: input.global,
      offset: normalizeOffset(input.offset),
      limit: normalizeListLimit(input.limit),
    });

    return {
      items: page.items.map((item) => toPublicMemoryRecord(remapWorkspace(item, workspace, queryWorkspace))),
      hasMore: page.hasMore,
    };
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
    const queryWorkspace = normalizeOptionalString(input.workspace);
    const workspace = await this.workspaceResolver.resolve(input.workspace);
    const normalizedQuery: SearchMemoryInput = {
      terms,
      limit: requestedLimit * RECALL_CANDIDATE_LIMIT_MULTIPLIER,
      workspace,
      updatedAfter: input.updatedAfter,
      updatedBefore: input.updatedBefore,
    };

    const [results, queryEmbedding] = await Promise.all([
      this.repository.search(normalizedQuery),
      this.embeddingService.createVector(terms.join(" ")),
    ]);

    return rerankSearchResults(results, workspace, queryEmbedding)
      .slice(0, requestedLimit)
      .map((result) => toPublicSearchResult(remapWorkspace(result, workspace, queryWorkspace)));
  }
}

function toPublicMemoryRecord(memory: MemoryEntity): MemoryRecord {
  return {
    id: memory.id,
    content: memory.content,
    workspace: memory.workspace,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

function toPublicSearchResult(result: MemorySearchEntity): MemorySearchResult {
  return {
    id: result.id,
    content: result.content,
    score: result.score,
    workspace: result.workspace,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
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

function normalizeTerms(terms: string[]): string[] {
  const normalizedTerms = terms.map((term) => term.trim()).filter(Boolean);
  return [...new Set(normalizedTerms)];
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function remapWorkspace<T extends { workspace?: string }>(
  record: T,
  canonicalWorkspace: string | undefined,
  queryWorkspace: string | undefined,
): T {
  if (record.workspace !== canonicalWorkspace) {
    return record;
  }

  return { ...record, workspace: queryWorkspace };
}
