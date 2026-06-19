import { describe, expect, it } from "bun:test";
import { NotFoundError, PersistenceError, ValidationError } from "./errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "./memory.ts";
import { MemoryService } from "./memory-service.ts";
import { createPassthroughWorkspaceResolver, type WorkspaceResolver } from "./workspace-resolver.ts";

const DEFAULT_WORKSPACE = "/tmp/project";
const DEFAULT_TIMESTAMP = new Date("2026-03-01T00:00:00.000Z");
const DEFAULT_CONTENT = "Use shared filesystem decisions to coordinate agents.";

function createMemoryRecord(id: string, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    content: DEFAULT_CONTENT,
    workspace: DEFAULT_WORKSPACE,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

class FakeMemoryRepository implements MemoryRepository {
  public created: Array<CreateMemoryInput & { id: string }> = [];
  public lastListInput: ListMemoriesInput | null = null;
  public updatedRecord: MemoryRecord | undefined;
  public deletedId: string | undefined;
  public updateError: Error | undefined;
  public deleteError: Error | undefined;
  public lastUpdateInput: UpdateMemoryInput | undefined;
  public memory: MemoryRecord | undefined = createMemoryRecord("memory-1", {
    content: "Shared read policy belongs in the application layer.",
    workspace: "/repo",
  });

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const now = new Date();
    const record: MemoryRecord = {
      id: "memory-saved",
      content: input.content,
      workspace: input.workspace,
      updatedAt: now,
    };
    this.created.push({ ...input, id: record.id });
    return record;
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    if (this.updateError) throw this.updateError;
    this.lastUpdateInput = input;
    const now = new Date();
    const workspace = input.workspace === undefined ? this.memory?.workspace : (input.workspace ?? undefined);
    const record: MemoryRecord = {
      id: input.id,
      content: input.content ?? this.memory?.content ?? DEFAULT_CONTENT,
      workspace,
      updatedAt: now,
    };
    this.updatedRecord = record;
    this.memory = record;
    return record;
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deletedId = input.id;
    if (this.memory?.id === input.id) {
      this.memory = undefined;
    }
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return id === this.memory?.id ? this.memory : undefined;
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    this.lastListInput = input;
    return {
      items: this.memory ? [this.memory] : [],
      hasMore: false,
    };
  }

  async listWorkspaces(): Promise<string[]> {
    return this.memory?.workspace ? [this.memory.workspace] : [];
  }
}

class FakeWorkspaceResolver implements WorkspaceResolver {
  public calls: Array<string | undefined> = [];

  constructor(private readonly resolved = new Map<string, string>()) {}

  async resolve(workspace: string): Promise<string> {
    this.calls.push(workspace);

    const trimmed = workspace?.trim();
    return this.resolved.get(trimmed) ?? trimmed;
  }
}

class PaginatedMemoryRepository implements MemoryRepository {
  public listInputs: ListMemoriesInput[] = [];

  constructor(private readonly pages: MemoryPage[]) {}

  async create(_input: CreateMemoryInput): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async update(_input: UpdateMemoryInput): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async delete(_input: DeleteMemoryInput): Promise<void> {
    throw new Error("Not implemented");
  }

  async get(_id: string): Promise<MemoryRecord | undefined> {
    return undefined;
  }

  async list(input: ListMemoriesInput): Promise<MemoryPage> {
    this.listInputs.push(input);
    const pageIndex = Math.floor((input.offset ?? 0) / 100);
    return this.pages[pageIndex] ?? { items: [], hasMore: false };
  }

  async listWorkspaces(): Promise<string[]> {
    return [];
  }
}

class BatchDeleteMemoryRepository implements MemoryRepository {
  public readonly deletedIds: string[] = [];
  public readonly errors = new Map<string, Error>();
  public activeDeletes = 0;
  public maxActiveDeletes = 0;
  public delayMs = 0;
  public readonly delays = new Map<string, number>();

  constructor(public readonly records: Map<string, MemoryRecord>) {}

  async create(_input: CreateMemoryInput): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async update(_input: UpdateMemoryInput): Promise<MemoryRecord> {
    throw new Error("Not implemented");
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    this.activeDeletes += 1;
    this.maxActiveDeletes = Math.max(this.maxActiveDeletes, this.activeDeletes);

    try {
      const delayMs = this.delays.get(input.id) ?? this.delayMs;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const error = this.errors.get(input.id);
      if (error) throw error;
      this.deletedIds.push(input.id);
      this.records.delete(input.id);
    } finally {
      this.activeDeletes -= 1;
    }
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    return this.records.get(id);
  }

  async list(_input: ListMemoriesInput): Promise<MemoryPage> {
    return { items: [], hasMore: false };
  }

  async listWorkspaces(): Promise<string[]> {
    return [];
  }
}

function createService(repository: MemoryRepository, workspaceResolver?: WorkspaceResolver): MemoryService {
  return new MemoryService(repository, workspaceResolver ?? createPassthroughWorkspaceResolver());
}

describe("MemoryService", () => {
  it("creates memory with resolved workspace", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.create({
      content: "Use a shared filesystem store across tools.",
      workspace: DEFAULT_WORKSPACE,
    });

    expect(repository.created).toHaveLength(1);
    expect(result.content).toBe("Use a shared filesystem store across tools.");
    expect(result.workspace).toBe(DEFAULT_WORKSPACE);
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("stores the canonical workspace returned by the resolver on create", async () => {
    const repository = new FakeMemoryRepository();
    const workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo"]]));
    const service = createService(repository, workspaceResolver);

    const result = await service.create({
      content: "Keep the shared repo root as the workspace key.",
      workspace: "  /worktrees/feature  ",
    });

    expect(workspaceResolver.calls).toEqual(["/worktrees/feature"]);
    expect(repository.created[0]?.workspace).toBe("/repo");
    expect(result.workspace).toBe("/repo");
  });

  it("preserves the given workspace on create when the resolver falls back", async () => {
    const repository = new FakeMemoryRepository();
    const workspaceResolver = new FakeWorkspaceResolver(new Map());
    const service = createService(repository, workspaceResolver);

    const result = await service.create({
      content: "Keep non-git workspaces as provided.",
      workspace: "  /not-a-repo  ",
    });

    expect(repository.created[0]?.workspace).toBe("/not-a-repo");
    expect(result.workspace).toBe("/not-a-repo");
  });

  it("updates memory content and returns the updated record", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.update({ id: "memory-1", content: "Updated content." });

    expect(repository.updatedRecord).toBeDefined();
    expect(result.id).toBe("memory-1");
    expect(result.content).toBe("Updated content.");
  });

  it("trims content before delegating update to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.update({ id: "memory-1", content: "  trimmed  " });

    expect(repository.updatedRecord?.content).toBe("trimmed");
    expect(result.content).toBe("trimmed");
  });

  it("preserves workspace when update changes only content", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.update({ id: "memory-1", content: "Updated content." });

    expect(repository.lastUpdateInput).toEqual({
      id: "memory-1",
      content: "Updated content.",
      workspace: undefined,
    });
    expect(result.workspace).toBe("/repo");
  });

  it("resolves workspace before delegating update to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo"]]));
    const service = createService(repository, workspaceResolver);

    const result = await service.update({ id: "memory-1", workspace: "  /worktrees/feature  " });

    expect(workspaceResolver.calls).toEqual(["/worktrees/feature"]);
    expect(repository.lastUpdateInput).toEqual({
      id: "memory-1",
      content: undefined,
      workspace: "/repo",
    });
    expect(result.workspace).toBe("/repo");
  });

  it("passes null workspace through update to make a memory global", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.update({ id: "memory-1", workspace: null });

    expect(repository.lastUpdateInput).toEqual({
      id: "memory-1",
      content: undefined,
      workspace: null,
    });
    expect(result.workspace).toBeUndefined();
  });

  it("allows empty update patches", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.update({ id: "memory-1" });

    expect(repository.lastUpdateInput).toEqual({
      id: "memory-1",
      content: undefined,
      workspace: undefined,
    });
    expect(result.content).toBe("Shared read policy belongs in the application layer.");
    expect(result.workspace).toBe("/repo");
  });

  it("throws ValidationError when update content is empty", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    expect(service.update({ id: "memory-1", content: "   " })).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when update workspace is blank", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    expect(service.update({ id: "memory-1", workspace: "   " })).rejects.toThrow(ValidationError);
  });

  it("propagates NotFoundError from repository on update", async () => {
    const repository = new FakeMemoryRepository();
    repository.updateError = new NotFoundError("Memory not found.");
    const service = createService(repository);

    expect(service.update({ id: "missing", workspace: null })).rejects.toThrow(NotFoundError);
  });

  it("deletes each memory id once", async () => {
    const repository = new BatchDeleteMemoryRepository(
      new Map([
        ["memory-1", createMemoryRecord("memory-1")],
        ["memory-2", createMemoryRecord("memory-2")],
      ]),
    );
    const service = createService(repository);

    const result = await service.delete({ ids: ["memory-1", "memory-1", "missing", "memory-2"] });

    expect(repository.deletedIds).toEqual(["memory-1", "memory-2"]);
    expect(result.outcomes).toEqual([
      { deleted: true, memory: createMemoryRecord("memory-1") },
      { deleted: false, id: "missing", code: "not_found" },
      { deleted: true, memory: createMemoryRecord("memory-2") },
    ]);
  });

  it("returns thrown errors as internal failures and continues deleting", async () => {
    const repository = new BatchDeleteMemoryRepository(
      new Map([
        ["persistence", createMemoryRecord("persistence")],
        ["unexpected", createMemoryRecord("unexpected")],
        ["deleted", createMemoryRecord("deleted")],
      ]),
    );
    repository.errors.set("persistence", new PersistenceError("Disk failed."));
    repository.errors.set("unexpected", new Error("Unexpected failure."));
    const service = createService(repository);

    const result = await service.delete({ ids: ["persistence", "unexpected", "deleted"] });

    expect(result.outcomes).toEqual([
      { deleted: false, id: "persistence", code: "internal_error" },
      { deleted: false, id: "unexpected", code: "internal_error" },
      { deleted: true, memory: createMemoryRecord("deleted") },
    ]);
    expect(repository.deletedIds).toEqual(["deleted"]);
  });

  it("accepts batches larger than the MCP limit", async () => {
    const records = new Map(
      Array.from({ length: 51 }, (_, index) => [`memory-${index}`, createMemoryRecord(`memory-${index}`)]),
    );
    const repository = new BatchDeleteMemoryRepository(records);
    const service = createService(repository);

    const result = await service.delete({ ids: [...records.keys()] });

    expect(result.outcomes).toHaveLength(51);
    expect(result.outcomes.every((outcome) => outcome.deleted)).toBe(true);
  });

  it("returns outcomes in input order when deletes finish out of order", async () => {
    const repository = new BatchDeleteMemoryRepository(
      new Map([
        ["slow", createMemoryRecord("slow")],
        ["fast", createMemoryRecord("fast")],
      ]),
    );
    repository.delays.set("slow", 20);
    const service = createService(repository);

    const result = await service.delete({ ids: ["slow", "fast"] });

    expect(repository.deletedIds).toEqual(["fast", "slow"]);
    expect(result.outcomes.map((outcome) => (outcome.deleted ? outcome.memory.id : undefined))).toEqual([
      "slow",
      "fast",
    ]);
  });

  it("limits concurrent deletes across simultaneous service calls", async () => {
    const records = new Map(
      Array.from({ length: 12 }, (_, index) => [`memory-${index}`, createMemoryRecord(`memory-${index}`)]),
    );
    const repository = new BatchDeleteMemoryRepository(records);
    repository.delayMs = 10;
    const service = createService(repository);

    const [first, second] = await Promise.all([
      service.delete({ ids: Array.from({ length: 6 }, (_, index) => `memory-${index}`) }),
      service.delete({ ids: Array.from({ length: 6 }, (_, index) => `memory-${index + 6}`) }),
    ]);

    expect(first.outcomes.map((outcome) => (outcome.deleted ? outcome.memory.id : undefined))).toEqual(
      Array.from({ length: 6 }, (_, index) => `memory-${index}`),
    );
    expect(second.outcomes.map((outcome) => (outcome.deleted ? outcome.memory.id : undefined))).toEqual(
      Array.from({ length: 6 }, (_, index) => `memory-${index + 6}`),
    );
    expect(repository.maxActiveDeletes).toBe(5);
  });

  it("gets a memory by id", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const result = await service.get("memory-1");

    expect(result).toMatchObject({
      id: "memory-1",
      content: "Shared read policy belongs in the application layer.",
      workspace: "/repo",
      updatedAt: DEFAULT_TIMESTAMP,
    });
  });

  it("normalizes list input before delegating to the repository", async () => {
    const repository = new FakeMemoryRepository();
    const workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo"]]));
    const service = createService(repository, workspaceResolver);

    await service.list({
      workspace: "  /worktrees/feature  ",
      global: true,
      offset: -10,
      limit: 999,
    });

    expect(workspaceResolver.calls).toEqual(["/worktrees/feature"]);
    expect(repository.lastListInput).toEqual({
      workspace: "/repo",
      global: true,
      offset: 0,
      limit: 100,
    });
  });

  it("remaps canonical workspace to the query workspace in list results", async () => {
    const repository = new FakeMemoryRepository();
    repository.memory = createMemoryRecord("memory-1", { workspace: "/repo" });
    const workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo"]]));
    const service = createService(repository, workspaceResolver);

    const page = await service.list({ workspace: "/worktrees/feature" });

    expect(page.items[0]?.workspace).toBe("/worktrees/feature");
  });

  it("does not remap workspace in list results when it differs from the canonical", async () => {
    const repository = new FakeMemoryRepository();
    repository.memory = createMemoryRecord("memory-1", { workspace: "/other-repo" });
    const workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo"]]));
    const service = createService(repository, workspaceResolver);

    const page = await service.list({ workspace: "/worktrees/feature" });

    expect(page.items[0]?.workspace).toBe("/other-repo");
  });

  it("defaults list input when values are omitted", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    await service.list({});

    expect(repository.lastListInput).toEqual({
      workspace: undefined,
      global: undefined,
      offset: 0,
      limit: 15,
    });
  });

  it("listAll aggregates paginated results", async () => {
    const repository = new PaginatedMemoryRepository([
      {
        items: [
          createMemoryRecord("memory-1", {
            content: "Page one.",
            workspace: "/repo",
          }),
        ],
        hasMore: true,
      },
      {
        items: [
          createMemoryRecord("memory-2", {
            content: "Page two.",
            workspace: undefined,
          }),
        ],
        hasMore: false,
      },
    ]);
    const service = createService(repository);

    const items = await service.listAll({ workspace: "/repo", global: true });

    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe("memory-1");
    expect(items[1]?.id).toBe("memory-2");
    expect(repository.listInputs).toEqual([
      { workspace: "/repo", global: true, offset: 0, limit: 100 },
      { workspace: "/repo", global: true, offset: 100, limit: 100 },
    ]);
  });

  it("lists workspaces", async () => {
    const repository = new FakeMemoryRepository();
    const service = createService(repository);

    const workspaces = await service.listWorkspaces();

    expect(workspaces).toEqual(["/repo"]);
  });
});
