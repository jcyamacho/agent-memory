import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "../memory.ts";
import { MemoryService } from "../memory-service.ts";
import { createPassthroughWorkspaceResolver } from "../workspace-resolver.ts";
import { createMcpServer } from "./server.ts";

class FakeMemoryRepository implements MemoryRepository {
  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const now = new Date();
    return { id: "memory-1", content: input.content, workspace: input.workspace, createdAt: now, updatedAt: now };
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

  async list(_input: ListMemoriesInput): Promise<MemoryPage> {
    return { items: [], hasMore: false };
  }

  async listWorkspaces(): Promise<string[]> {
    return [];
  }
}

describe("createMcpServer", () => {
  let server: ReturnType<typeof createMcpServer>;
  let client: Client;

  beforeEach(async () => {
    server = createMcpServer(
      new MemoryService(new FakeMemoryRepository(), createPassthroughWorkspaceResolver()),
      "1.0.0",
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({
      name: "mcp-server-test-client",
      version: "1.0.0",
    });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers the memory tools", async () => {
    const response = await client.listTools();

    expect(response.tools.map((tool) => tool.name).sort()).toEqual(["forget", "remember", "review", "revise"]);
  });
});
