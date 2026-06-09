import { describe, expect, it } from "bun:test";
import type { CliOutput } from "./cli.ts";
import { runCli, runReviewCli } from "./cli.ts";
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
import type { WorkspaceResolver } from "./workspace-resolver.ts";

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

class FakeWorkspaceResolver implements WorkspaceResolver {
  async resolve(workspace: string): Promise<string> {
    return workspace.trim();
  }
}

function createOutput(): { output: CliOutput; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    output: {
      write: (text) => stdout.push(text),
      error: (text) => stderr.push(text),
    },
    stdout,
    stderr,
  };
}

describe("runReviewCli", () => {
  it("defaults workspace to cwd", async () => {
    const repository = new PaginatedMemoryRepository([
      {
        items: [
          {
            id: "mem-1",
            content: "Project memory.",
            workspace: "/project",
            updatedAt: new Date("2026-03-10T10:00:00.000Z"),
          },
        ],
        hasMore: false,
      },
    ]);
    const memory = new MemoryService(repository, new FakeWorkspaceResolver());
    const { output, stdout } = createOutput();

    const exitCode = await runReviewCli([], memory, { cwd: "/project", out: output });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain('<memories workspace="/project" has_more="false">');
  });

  it("uses --workspace override", async () => {
    const repository = new PaginatedMemoryRepository([
      {
        items: [
          {
            id: "mem-1",
            content: "Another project.",
            workspace: "/override",
            updatedAt: new Date("2026-03-10T10:00:00.000Z"),
          },
        ],
        hasMore: false,
      },
    ]);
    const memory = new MemoryService(repository, new FakeWorkspaceResolver());
    const { output, stdout } = createOutput();

    const exitCode = await runReviewCli(["--workspace", "/override"], memory, { cwd: "/ignored", out: output });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain('<memories workspace="/override" has_more="false">');
  });

  it("aggregates all pages and sets has_more to false", async () => {
    const repository = new PaginatedMemoryRepository([
      {
        items: [
          {
            id: "mem-1",
            content: "First page.",
            workspace: "/repo",
            updatedAt: new Date("2026-03-10T10:00:00.000Z"),
          },
        ],
        hasMore: true,
      },
      {
        items: [
          {
            id: "mem-2",
            content: "Second page.",
            updatedAt: new Date("2026-03-11T12:00:00.000Z"),
          },
        ],
        hasMore: false,
      },
    ]);
    const memory = new MemoryService(repository, new FakeWorkspaceResolver());
    const { output, stdout } = createOutput();

    const exitCode = await runReviewCli(["--workspace", "/repo"], memory, { out: output });
    const text = stdout.join("");

    expect(exitCode).toBe(0);
    expect(text).toContain('<memories workspace="/repo" has_more="false">');
    expect(text).toContain("First page.");
    expect(text).toContain('id="mem-2" updated_at="2026-03-11T12:00:00.000Z" global="true"');
    expect(text).toContain("Second page.");
  });

  it("returns empty-store message", async () => {
    const repository = new PaginatedMemoryRepository([{ items: [], hasMore: false }]);
    const memory = new MemoryService(repository, new FakeWorkspaceResolver());
    const { output, stdout } = createOutput();

    const exitCode = await runReviewCli(["--workspace", "/empty"], memory, { out: output });

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toBe('<memories workspace="/empty" has_more="false"></memories>\n');
  });
});

describe("runCli", () => {
  it("returns usage for unknown subcommands", async () => {
    const repository = new PaginatedMemoryRepository([{ items: [], hasMore: false }]);
    const memory = new MemoryService(repository, new FakeWorkspaceResolver());
    const { output, stderr } = createOutput();

    const exitCode = await runCli(["unknown"], memory, { out: output });

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("Unknown command: unknown");
    expect(stderr.join("")).toContain("agent-memory review");
  });
});
