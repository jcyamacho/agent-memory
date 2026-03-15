import Database from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeMemoryDatabase, type SqliteDatabaseLike } from "../sqlite-db.ts";
import { SqliteMemoryRepository } from "../sqlite-repository.ts";
import { startWebServer } from "./server.tsx";

// biome-ignore lint/suspicious/noExplicitAny: test convenience for JSON responses
type Json = any;

describe("Web UI server", () => {
  let directory: string;
  let database: SqliteDatabaseLike;
  let repository: SqliteMemoryRepository;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-ui-test-"));
    const databasePath = join(directory, "memory.db");

    database = new Database(databasePath);
    initializeMemoryDatabase(database);
    repository = new SqliteMemoryRepository(database);

    server = startWebServer(repository, { port: 0 });
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
    const t = new Date();
    await repository.save({ id: "ssr-1", content: "Server rendered.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("agent-memory");
    expect(body).toContain("Server rendered.");
  });

  it("GET / filters by workspace query param", async () => {
    const t = new Date();
    await repository.save({ id: "a1", content: "In A.", workspace: "/a", createdAt: t, updatedAt: t });
    await repository.save({ id: "b1", content: "In B.", workspace: "/b", createdAt: t, updatedAt: t });

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
    const all = await repository.findAll({ offset: 0, limit: 10 });
    expect(all.items).toHaveLength(1);
    expect(all.items[0]?.content).toBe("New memory.");
  });

  it("POST /memories/:id/update updates and redirects", async () => {
    const t = new Date();
    await repository.save({ id: "upd-1", content: "Old.", workspace: "/repo", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/memories/upd-1/update`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "content=Updated.&returnUrl=/",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const memory = await repository.findById("upd-1");
    expect(memory?.content).toBe("Updated.");
  });

  it("POST /memories/:id/delete deletes and redirects", async () => {
    const t = new Date();
    await repository.save({ id: "del-1", content: "Gone.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/memories/del-1/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "returnUrl=/",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    const memory = await repository.findById("del-1");
    expect(memory).toBeUndefined();
  });

  it("POST /memories/:id/delete rejects absolute returnUrl", async () => {
    const t = new Date();
    await repository.save({ id: "redirect-test", content: "Test.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/memories/redirect-test/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "returnUrl=https://evil.example.com",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("POST /api/memories creates a memory", async () => {
    const response = await fetch(`${baseUrl}/api/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Test memory.", workspace: "/repo" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Json;
    expect(body.id).toBeDefined();
    expect(body.content).toBe("Test memory.");
    expect(body.workspace).toBe("/repo");
  });

  it("POST /api/memories returns 400 for empty content", async () => {
    const response = await fetch(`${baseUrl}/api/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    });

    expect(response.status).toBe(400);
  });

  it("GET /api/memories lists memories", async () => {
    await repository.save({
      id: "m1",
      content: "First.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await fetch(`${baseUrl}/api/memories`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Json;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("m1");
  });

  it("GET /api/memories supports workspace filter", async () => {
    const t = new Date();
    await repository.save({ id: "a1", content: "In A.", workspace: "/a", createdAt: t, updatedAt: t });
    await repository.save({ id: "b1", content: "In B.", workspace: "/b", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/api/memories?workspace=/a`);
    const body = (await response.json()) as Json;

    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("a1");
  });

  it("GET /api/memories supports offset pagination", async () => {
    const t1 = new Date("2026-03-01T00:00:00.000Z");
    const t2 = new Date("2026-03-02T00:00:00.000Z");
    const t3 = new Date("2026-03-03T00:00:00.000Z");

    await repository.save({ id: "m1", content: "First.", createdAt: t1, updatedAt: t1 });
    await repository.save({ id: "m2", content: "Second.", createdAt: t2, updatedAt: t2 });
    await repository.save({ id: "m3", content: "Third.", createdAt: t3, updatedAt: t3 });

    const page1 = await fetch(`${baseUrl}/api/memories?limit=2`);
    const body1 = (await page1.json()) as Json;
    expect(body1.items).toHaveLength(2);
    expect(body1.hasMore).toBe(true);

    const page2 = await fetch(`${baseUrl}/api/memories?limit=2&offset=2`);
    const body2 = (await page2.json()) as Json;
    expect(body2.items).toHaveLength(1);
    expect(body2.hasMore).toBe(false);
  });

  it("GET /api/memories/:id returns a memory", async () => {
    const t = new Date();
    await repository.save({ id: "get-me", content: "Found.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/api/memories/get-me`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Json;
    expect(body.id).toBe("get-me");
    expect(body.content).toBe("Found.");
  });

  it("GET /api/memories/:id returns 404 for missing", async () => {
    const response = await fetch(`${baseUrl}/api/memories/nonexistent`);

    expect(response.status).toBe(404);
  });

  it("PATCH /api/memories/:id updates content", async () => {
    const t = new Date();
    await repository.save({ id: "patch-me", content: "Old.", workspace: "/repo", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/api/memories/patch-me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "New." }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Json;
    expect(body.content).toBe("New.");
    expect(body.workspace).toBe("/repo");
  });

  it("PATCH /api/memories/:id returns 404 for missing", async () => {
    const response = await fetch(`${baseUrl}/api/memories/nonexistent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "New." }),
    });

    expect(response.status).toBe(404);
  });

  it("DELETE /api/memories/:id deletes a memory", async () => {
    const t = new Date();
    await repository.save({ id: "delete-me", content: "Gone.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/api/memories/delete-me`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);

    const check = await repository.findById("delete-me");
    expect(check).toBeUndefined();
  });

  it("DELETE /api/memories/:id returns 404 for missing", async () => {
    const response = await fetch(`${baseUrl}/api/memories/nonexistent`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await fetch(`${baseUrl}/api/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(response.status).toBe(400);
  });

  it("GET /api/workspaces returns distinct workspaces", async () => {
    const t = new Date();
    await repository.save({ id: "a1", content: "A.", workspace: "/repo-a", createdAt: t, updatedAt: t });
    await repository.save({ id: "a2", content: "A2.", workspace: "/repo-a", createdAt: t, updatedAt: t });
    await repository.save({ id: "b1", content: "B.", workspace: "/repo-b", createdAt: t, updatedAt: t });
    await repository.save({ id: "g1", content: "Global.", createdAt: t, updatedAt: t });

    const response = await fetch(`${baseUrl}/api/workspaces`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Json;
    expect(body.workspaces).toEqual(["/repo-a", "/repo-b"]);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });
});
