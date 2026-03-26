import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateMemoryEntityInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryEntity,
  MemoryEntityPage,
  MemoryRepository,
  MemorySearchEntity,
  SearchMemoryInput,
  UpdateMemoryEntityInput,
} from "../../memory.ts";
import { MemoryService } from "../../memory-service.ts";
import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import { REVIEW_PAGE_SIZE, registerReviewTool } from "./review.ts";

class ReviewOnlyRepository implements MemoryRepository {
  public lastListInput: ListMemoriesInput | undefined;
  public listResult: MemoryEntityPage = { items: [], hasMore: false };

  async create(input: CreateMemoryEntityInput): Promise<MemoryEntity> {
    const now = new Date();
    return {
      id: "memory-1",
      content: input.content,
      embedding: input.embedding,
      workspace: input.workspace,
      createdAt: now,
      updatedAt: now,
    };
  }

  async search(_query: SearchMemoryInput): Promise<MemorySearchEntity[]> {
    return [];
  }

  async update(_input: UpdateMemoryEntityInput): Promise<MemoryEntity> {
    throw new Error("Not implemented");
  }

  async delete(_input: DeleteMemoryInput): Promise<void> {
    throw new Error("Not implemented");
  }

  async get(_id: string): Promise<MemoryEntity | undefined> {
    return undefined;
  }

  async list(input: ListMemoriesInput): Promise<MemoryEntityPage> {
    this.lastListInput = input;
    return this.listResult;
  }

  async listWorkspaces(): Promise<string[]> {
    return [];
  }
}

class FakeWorkspaceResolver implements WorkspaceResolver {
  constructor(private readonly resolved = new Map<string, string>()) {}

  async resolve(workspace?: string): Promise<string | undefined> {
    const trimmed = workspace?.trim();
    if (!trimmed) {
      return undefined;
    }
    return this.resolved.get(trimmed) ?? trimmed;
  }
}

describe("registerReviewTool", () => {
  let repository: ReviewOnlyRepository;
  let workspaceResolver: FakeWorkspaceResolver;
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    repository = new ReviewOnlyRepository();
    workspaceResolver = new FakeWorkspaceResolver();
    const memoryService = new MemoryService(
      repository,
      {
        async createVector() {
          return [0.1, 0.2, 0.3];
        },
      },
      workspaceResolver,
    );
    server = new McpServer({
      name: "agent-memory-test",
      version: "1.0.0",
    });

    registerReviewTool(server, memoryService);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({
      name: "review-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("returns memories with workspace per-memory and has_more on wrapper", async () => {
    repository.listResult = {
      items: [
        {
          id: "mem-1",
          content: "First memory.",
          embedding: [0.1, 0.2],
          workspace: "/repo-a",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
          updatedAt: new Date("2026-03-10T10:00:00.000Z"),
        },
        {
          id: "mem-2",
          content: "Second memory.",
          embedding: [0.3, 0.4],
          createdAt: new Date("2026-03-09T08:00:00.000Z"),
          updatedAt: new Date("2026-03-11T12:00:00.000Z"),
        },
      ],
      hasMore: true,
    };

    const response = await client.callTool({
      name: "review",
      arguments: { workspace: "/repo-a" },
    });

    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain('<memories has_more="true">');
    expect(text).toContain('id="mem-1" workspace="/repo-a"');
    expect(text).toContain('updated_at="2026-03-10T10:00:00.000Z"');
    expect(text).toContain("First memory.");
    expect(text).toContain('id="mem-2" updated_at=');
    expect(text).not.toContain('id="mem-2" workspace=');
    expect(text).toContain("Second memory.");
    expect(text).toContain("</memories>");
  });

  it("returns empty hint when no memories exist", async () => {
    const response = await client.callTool({
      name: "review",
      arguments: { workspace: "/empty-repo" },
    });

    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toBe("No memories found for this workspace.");
  });

  it("remaps canonical workspace to the query workspace on the wrapper", async () => {
    workspaceResolver = new FakeWorkspaceResolver(new Map([["/worktrees/feature", "/repo-a"]]));
    repository = new ReviewOnlyRepository();
    repository.listResult = {
      items: [
        {
          id: "mem-1",
          content: "A memory.",
          embedding: [0.1],
          workspace: "/repo-a",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
          updatedAt: new Date("2026-03-10T10:00:00.000Z"),
        },
      ],
      hasMore: false,
    };
    const memoryService = new MemoryService(
      repository,
      {
        async createVector() {
          return [0.1, 0.2, 0.3];
        },
      },
      workspaceResolver,
    );
    await client.close();
    await server.close();
    server = new McpServer({ name: "agent-memory-test", version: "1.0.0" });
    registerReviewTool(server, memoryService);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "review-test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const response = await client.callTool({
      name: "review",
      arguments: { workspace: "/worktrees/feature" },
    });

    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain('<memories has_more="false">');
    expect(text).toContain('workspace="/worktrees/feature"');
  });

  it("escapes XML special characters in content", async () => {
    repository.listResult = {
      items: [
        {
          id: "mem-1",
          content: 'Use <script> & "quotes"',
          embedding: [0.1],
          workspace: "/repo-a",
          createdAt: new Date("2026-03-10T10:00:00.000Z"),
          updatedAt: new Date("2026-03-10T10:00:00.000Z"),
        },
      ],
      hasMore: false,
    };

    const response = await client.callTool({
      name: "review",
      arguments: { workspace: "/repo-a" },
    });

    const text = (response.content as { type: string; text: string }[])[0]?.text;
    expect(text).toContain("Use &lt;script&gt; &amp; &quot;quotes&quot;");
  });

  it("converts page to offset correctly", async () => {
    await client.callTool({
      name: "review",
      arguments: { workspace: "/repo-a", page: 2 },
    });

    expect(repository.lastListInput).toMatchObject({
      workspace: "/repo-a",
      offset: 2 * REVIEW_PAGE_SIZE,
      limit: REVIEW_PAGE_SIZE,
    });
  });

  it("defaults page to 0", async () => {
    await client.callTool({
      name: "review",
      arguments: { workspace: "/repo-a" },
    });

    expect(repository.lastListInput).toMatchObject({
      offset: 0,
      limit: REVIEW_PAGE_SIZE,
    });
  });

  it("includes global memories alongside workspace memories", async () => {
    await client.callTool({
      name: "review",
      arguments: { workspace: "/repo-a" },
    });

    expect(repository.lastListInput).toMatchObject({
      workspace: "/repo-a",
      global: true,
    });
  });
});
