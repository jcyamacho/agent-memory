import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryService } from "../memory-service.ts";
import { initializeMemoryDatabase, type SqliteDatabaseLike, SqliteMemoryRepository } from "../sqlite/index.ts";
import { createMemoryMigrations } from "../sqlite/migrations/index.ts";
import { createPassthroughWorkspaceResolver } from "../workspace-resolver.ts";
import { startWebServer } from "./server.tsx";

function createTestMigrations() {
  return createMemoryMigrations({
    embeddingService: {
      async createVector(text: string) {
        return [text.length, 0.5, 0.25];
      },
    },
    workspaceResolver: createPassthroughWorkspaceResolver(),
  });
}

describe("Web UI server", () => {
  let directory: string;
  let database: SqliteDatabaseLike;
  let repository: SqliteMemoryRepository;
  let memoryService: MemoryService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-ui-test-"));
    const databasePath = join(directory, "memory.db");

    database = new Database(databasePath);
    await initializeMemoryDatabase(database, createTestMigrations());
    repository = new SqliteMemoryRepository(database);
    memoryService = new MemoryService(
      repository,
      {
        async createVector() {
          return [0.1, 0.2, 0.3];
        },
      },
      createPassthroughWorkspaceResolver(),
    );
    server = startWebServer(memoryService, { port: 0 });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    server.close();
    database.close();
    await rm(directory, { force: true, recursive: true });
  });

  it("GET / returns server-rendered HTML with memories", async () => {
    await memoryService.create({ content: "Server rendered." });

    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("agent-memory");
    expect(body).toContain("Server rendered.");
  });

  it("GET / filters by workspace query param", async () => {
    await memoryService.create({ content: "In A.", workspace: "/a" });
    await memoryService.create({ content: "In B.", workspace: "/b" });

    const response = await fetch(`${baseUrl}/?workspace=${encodeURIComponent("/a")}`);
    const body = await response.text();

    expect(body).toContain("In A.");
    expect(body).not.toContain("In B.");
  });

  it("POST /memories creates and redirects", async () => {
    const response = await fetch(`${baseUrl}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "content=New+memory.&workspace=/repo",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const all = await repository.list({ offset: 0, limit: 10 });
    expect(all.items).toHaveLength(1);
    expect(all.items[0]?.content).toBe("New memory.");
  });

  it("POST /memories/:id/update updates and redirects", async () => {
    const memory = await memoryService.create({ content: "Old.", workspace: "/repo" });

    const response = await fetch(`${baseUrl}/memories/${memory.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "content=Updated.&returnUrl=/",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const updated = await repository.get(memory.id);
    expect(updated?.content).toBe("Updated.");
  });

  it("POST /memories/:id/delete deletes and redirects", async () => {
    const memory = await memoryService.create({ content: "Gone." });

    const response = await fetch(`${baseUrl}/memories/${memory.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "returnUrl=/",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const deleted = await repository.get(memory.id);
    expect(deleted).toBeUndefined();
  });

  it("POST /memories/:id/delete rejects absolute returnUrl", async () => {
    const memory = await memoryService.create({ content: "Test." });

    const response = await fetch(`${baseUrl}/memories/${memory.id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "returnUrl=https://evil.example.com",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });
});
