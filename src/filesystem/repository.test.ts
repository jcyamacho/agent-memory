import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { access, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeWorkspaceSegment, encodeWorkspaceSegment, FilesystemMemoryRepository } from "./repository.ts";

describe("FilesystemMemoryRepository", () => {
  let storePath: string;
  let repository: FilesystemMemoryRepository;

  beforeEach(() => {
    storePath = mkdtempSync(join(tmpdir(), "agent-memory-fs-test-"));
    repository = new FilesystemMemoryRepository(storePath);
  });

  afterEach(async () => {
    await rm(storePath, { recursive: true, force: true });
  });

  it("creates and retrieves a global memory", async () => {
    const created = await repository.create({
      content: "Persist memory bodies as Markdown.",
    });

    const fetched = await repository.get(created.id);

    expect(fetched).toEqual({
      id: created.id,
      content: "Persist memory bodies as Markdown.",
      workspace: undefined,
      updatedAt: created.updatedAt,
    });
  });

  it("stores workspace memories in encoded workspace directories", async () => {
    const created = await repository.create({
      content: "Workspace-scoped memory.",
      workspace: "/repo/worktrees/feature",
    });

    const encodedWorkspace = encodeWorkspaceSegment("/repo/worktrees/feature");
    const filePath = join(storePath, "workspaces", encodedWorkspace, `${created.id}.md`);

    expect(await readFile(filePath, "utf8")).toBe("Workspace-scoped memory.");
  });

  it("lists memories newest-first by updatedAt", async () => {
    await writeMemoryFile({ id: "m1", content: "First.", updatedAt: new Date("2026-03-01T00:00:00.000Z") }, storePath);
    await writeMemoryFile({ id: "m2", content: "Second.", updatedAt: new Date("2026-03-03T00:00:00.000Z") }, storePath);
    await writeMemoryFile({ id: "m3", content: "Third.", updatedAt: new Date("2026-03-02T00:00:00.000Z") }, storePath);

    const page = await repository.list({ offset: 0, limit: 2 });

    expect(page.items.map((memory) => memory.id)).toEqual(["m2", "m3"]);
    expect(page.hasMore).toBe(true);
  });

  it("supports offset pagination", async () => {
    await writeMemoryFile({ id: "m1", content: "First.", updatedAt: new Date("2026-03-01T00:00:00.000Z") }, storePath);
    await writeMemoryFile({ id: "m2", content: "Second.", updatedAt: new Date("2026-03-02T00:00:00.000Z") }, storePath);
    await writeMemoryFile({ id: "m3", content: "Third.", updatedAt: new Date("2026-03-03T00:00:00.000Z") }, storePath);

    const page = await repository.list({ offset: 2, limit: 2 });

    expect(page.items.map((memory) => memory.id)).toEqual(["m1"]);
    expect(page.hasMore).toBe(false);
  });

  it("filters workspace and global memories together", async () => {
    await writeMemoryFile(
      {
        id: "workspace-memory",
        content: "Workspace memory.",
        workspace: "/repo-a",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      storePath,
    );
    await writeMemoryFile(
      {
        id: "other-workspace-memory",
        content: "Other workspace memory.",
        workspace: "/repo-b",
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
      storePath,
    );
    await writeMemoryFile(
      { id: "global-memory", content: "Global memory.", updatedAt: new Date("2026-03-03T00:00:00.000Z") },
      storePath,
    );

    const page = await repository.list({ workspace: "/repo-a", global: true, offset: 0, limit: 10 });

    expect(page.items.map((memory) => memory.id)).toEqual(["global-memory", "workspace-memory"]);
  });

  it("moves a memory between workspace and global scopes on update", async () => {
    await writeMemoryFile(
      {
        id: "move-me",
        content: "Workspace memory.",
        workspace: "/repo-a",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      storePath,
    );

    const updated = await repository.update({
      id: "move-me",
      workspace: null,
    });

    expect(updated.workspace).toBeUndefined();
    expect(updated.updatedAt.getTime()).toBeGreaterThan(new Date("2026-03-01T00:00:00.000Z").getTime());
    expect(await repository.get("move-me")).toMatchObject({
      id: "move-me",
      workspace: undefined,
    });
  });

  it("deletes memories and removes empty workspace directories", async () => {
    await writeMemoryFile(
      {
        id: "delete-me",
        content: "Workspace memory.",
        workspace: "/repo-a",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      storePath,
    );

    await repository.delete({ id: "delete-me" });

    await expect(repository.get("delete-me")).resolves.toBeUndefined();
    await expect(access(join(storePath, "workspaces", encodeWorkspaceSegment("/repo-a")))).rejects.toBeDefined();
  });

  it("lists workspaces as decoded canonical paths", async () => {
    await writeMemoryFile(
      {
        id: "a",
        content: "A",
        workspace: "/repo-a/worktrees/feature",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      storePath,
    );
    await writeMemoryFile(
      { id: "b", content: "B", workspace: "C:\\repo\\feature", updatedAt: new Date("2026-03-02T00:00:00.000Z") },
      storePath,
    );

    const workspaces = await repository.listWorkspaces();

    expect(workspaces).toEqual(["/repo-a/worktrees/feature", "C:\\repo\\feature"]);
  });

  it("encodes and decodes workspace paths reversibly", () => {
    const workspace = "/repo/feature branch\\nested";

    expect(decodeWorkspaceSegment(encodeWorkspaceSegment(workspace))).toBe(workspace);
  });
});

async function writeMemoryFile(
  input: {
    id: string;
    content: string;
    workspace?: string;
    updatedAt: Date;
  },
  storePath: string,
): Promise<void> {
  const directoryPath = input.workspace
    ? join(storePath, "workspaces", encodeWorkspaceSegment(input.workspace))
    : join(storePath, "globals");
  const filePath = join(directoryPath, `${input.id}.md`);

  await mkdir(directoryPath, { recursive: true });
  await writeFile(filePath, input.content, "utf8");
  await utimes(filePath, input.updatedAt, input.updatedAt);
}
