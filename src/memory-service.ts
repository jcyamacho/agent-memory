import PQueue from "p-queue";
import { ValidationError } from "./errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoriesInput,
  DeleteMemoriesResult,
  DeleteMemoryOutcome,
  ListAllMemoriesInput,
  ListMemoriesInput,
  MemoryApi,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "./memory.ts";
import type { WorkspaceResolver } from "./workspace-resolver.ts";

const DEFAULT_LIST_LIMIT = 15;
const MAX_LIST_LIMIT = 100;

export class MemoryService implements MemoryApi {
  private readonly deleteQueue = new PQueue({ concurrency: 5 });

  constructor(
    private readonly repository: MemoryRepository,
    private readonly workspaceResolver: WorkspaceResolver,
  ) {}

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();

    if (!content) {
      throw new ValidationError("Memory content is required.");
    }

    const workspace = await this.normalizeWorkspaceInput(input.workspace);

    return this.repository.create({ content, workspace });
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    const content = this.normalizeUpdateContent(input.content);
    const workspace = await this.normalizeUpdateWorkspace(input.workspace);

    return this.repository.update({ id: input.id, content, workspace });
  }

  async delete(input: DeleteMemoriesInput): Promise<DeleteMemoriesResult> {
    const uniqueIds = [...new Set(input.ids)];

    const outcomes = await Promise.all(
      uniqueIds.map((id) =>
        this.deleteQueue.add(async (): Promise<DeleteMemoryOutcome> => {
          try {
            const existingMemory = await this.repository.get(id);
            if (!existingMemory) {
              return { deleted: false, id, code: "not_found" };
            }

            await this.repository.delete({ id });
            return { deleted: true, memory: existingMemory };
          } catch {
            return { deleted: false, id, code: "internal_error" };
          }
        }),
      ),
    );

    return { outcomes };
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return this.repository.get(id);
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    const queryWorkspace = input.workspace?.trim() || undefined;
    const workspace = queryWorkspace ? await this.workspaceResolver.resolve(queryWorkspace) : undefined;

    const page = await this.repository.list({
      workspace,
      global: input.global,
      offset: normalizeOffset(input.offset),
      limit: normalizeListLimit(input.limit),
    });

    return {
      items: page.items.map((item) => remapWorkspace(item, workspace, queryWorkspace)),
      hasMore: page.hasMore,
    };
  }

  async listAll(input: ListAllMemoriesInput): Promise<MemoryRecord[]> {
    const items: MemoryRecord[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await this.list({
        ...input,
        offset,
        limit: MAX_LIST_LIMIT,
      });

      items.push(...page.items);
      hasMore = page.hasMore;
      offset += MAX_LIST_LIMIT;
    }

    return items;
  }

  async listWorkspaces(): Promise<string[]> {
    return this.repository.listWorkspaces();
  }

  private normalizeUpdateContent(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new ValidationError("Memory content is required.");
    }

    return trimmed;
  }

  private async normalizeUpdateWorkspace(value: string | null | undefined): Promise<string | null | undefined> {
    if (value === undefined || value === null) {
      return value;
    }

    return this.normalizeWorkspaceInput(value);
  }

  private async normalizeWorkspaceInput(value: string | undefined): Promise<string | undefined> {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new ValidationError("Workspace is required.");
    }

    return this.workspaceResolver.resolve(trimmed);
  }
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
