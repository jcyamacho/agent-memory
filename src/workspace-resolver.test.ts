import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createGitWorkspaceResolver } from "./workspace-resolver.ts";

const execFileAsync = promisify(execFile);

describe("createGitWorkspaceResolver", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-workspace-resolver-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("returns undefined for blank workspaces", async () => {
    const resolver = createGitWorkspaceResolver();

    await expect(resolver.resolve("   ")).resolves.toBeUndefined();
  });

  it("keeps the main repo path unchanged", async () => {
    const { repoPath } = await createGitRepo(directory);
    const resolver = createGitWorkspaceResolver();

    await expect(resolver.resolve(repoPath)).resolves.toBe(await realpath(repoPath));
  });

  it("resolves linked worktrees to the main repo path", async () => {
    const { repoPath, worktreePath } = await createGitRepoWithWorktree(directory);
    const resolver = createGitWorkspaceResolver();

    await expect(resolver.resolve(worktreePath)).resolves.toBe(await realpath(repoPath));
  });

  it("falls back to the given workspace for non-git directories", async () => {
    const workspace = join(directory, "not-a-repo");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "placeholder.txt"), "test");
    const resolver = createGitWorkspaceResolver();

    await expect(resolver.resolve(`  ${workspace}  `)).resolves.toBe(workspace);
  });

  it("falls back to the given workspace when git execution fails", async () => {
    const resolver = createGitWorkspaceResolver({
      getGitCommonDir: async () => {
        throw new Error("git failed");
      },
    });

    await expect(resolver.resolve("/tmp/worktree")).resolves.toBe("/tmp/worktree");
  });

  it("falls back when git-common-dir does not end in .git", async () => {
    const resolver = createGitWorkspaceResolver({
      getGitCommonDir: async () => "/tmp/not-a-dot-git-dir",
    });

    await expect(resolver.resolve("/tmp/worktree")).resolves.toBe("/tmp/worktree");
  });
});

async function createGitRepo(baseDir: string): Promise<{ repoPath: string }> {
  const repoPath = join(baseDir, "repo");
  await runGit(["init", repoPath], baseDir);
  await runGit(["config", "user.name", "Test User"], repoPath);
  await runGit(["config", "user.email", "test@example.com"], repoPath);
  await writeFile(join(repoPath, "README.md"), "repo\n");
  await runGit(["add", "README.md"], repoPath);
  await runGit(["commit", "-m", "init"], repoPath);

  return { repoPath };
}

async function createGitRepoWithWorktree(baseDir: string): Promise<{ repoPath: string; worktreePath: string }> {
  const { repoPath } = await createGitRepo(baseDir);
  const worktreePath = join(baseDir, "repo-feature");
  await runGit(["branch", "feature"], repoPath);
  await runGit(["worktree", "add", worktreePath, "feature"], repoPath);

  return { repoPath, worktreePath };
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}
