import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "../../memory.ts";
import { MemoryService } from "../../memory-service.ts";
import type { WorkspaceResolver } from "../../workspace-resolver.ts";
import { REVIEW_PAGE_SIZE, registerReviewTool } from "./review.ts";

class ReviewOnlyRepository implements MemoryRepository {
  public lastListInput: ListMemoriesInput | undefined;
  public listResult: MemoryPage = { items: [], hasMore: false };

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const now = new Date();
    return { id: "memory-1", content: input.content, workspace: input.workspace, updatedAt: now };
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
    this.lastListInput = input;
    return this.listResult;
  }

  async listWorkspaces(): Promise<string[]> {
    return [];
  }
}

class FakeWorkspaceResolver implements WorkspaceResolver {
  constructor(private readonly resolved = new Map<string, string>()) {}

  async resolve(workspace: string): Promise<string> {
    const trimmed = workspace?.trim();
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
    const memoryService = new MemoryService(repository, workspaceResolver);
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
          workspace: "/repo-a",
          updatedAt: new Date("2026-03-10T10:00:00.000Z"),
        },
        {
          id: "mem-2",
          content: "Second memory.",
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
    expect(text).toContain('<memories workspace="/repo-a" has_more="true">');
    expect(text).toContain('id="mem-1" updated_at="2026-03-10T10:00:00.000Z"');
    expect(text).not.toContain('id="mem-1" global=');
    expect(text).toContain("First memory.");
    expect(text).toContain('id="mem-2" updated_at="2026-03-11T12:00:00.000Z" global="true"');
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
          workspace: "/repo-a",
          updatedAt: new Date("2026-03-10T10:00:00.000Z"),
        },
      ],
      hasMore: false,
    };
    const memoryService = new MemoryService(repository, workspaceResolver);
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
    expect(text).toContain('<memories workspace="/worktrees/feature" has_more="false">');
    expect(text).not.toContain('global="true"');
  });

  it("escapes XML special characters in content", async () => {
    repository.listResult = {
      items: [
        {
          id: "mem-1",
          content: 'Use <script> & "quotes"',
          workspace: "/repo-a",
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
