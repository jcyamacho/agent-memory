import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";
import { ValidationError } from "./errors.ts";

const execFileAsync = promisify(execFile);

export interface WorkspaceResolver {
  resolve(workspace: string): Promise<string>;
}

export interface CreateGitWorkspaceResolverOptions {
  getGitCommonDir?: (cwd: string) => Promise<string>;
}

export function createGitWorkspaceResolver(options: CreateGitWorkspaceResolverOptions = {}): WorkspaceResolver {
  const getGitCommonDir = options.getGitCommonDir ?? defaultGetGitCommonDir;
  const cache = new Map<string, Promise<string>>();

  return {
    async resolve(workspace: string): Promise<string> {
      const trimmed = workspace.trim();
      if (!trimmed) {
        throw new ValidationError("Workspace is required.");
      }

      const cached = cache.get(trimmed);
      if (cached) {
        return cached;
      }

      const pending = resolveWorkspace(trimmed, getGitCommonDir);
      cache.set(trimmed, pending);
      return pending;
    },
  };
}

export function createPassthroughWorkspaceResolver(): WorkspaceResolver {
  return {
    async resolve(workspace: string): Promise<string> {
      const trimmed = workspace.trim();
      if (!trimmed) {
        throw new ValidationError("Workspace is required.");
      }

      return trimmed;
    },
  };
}

async function resolveWorkspace(
  workspace: string,
  getGitCommonDir: NonNullable<CreateGitWorkspaceResolverOptions["getGitCommonDir"]>,
): Promise<string> {
  try {
    const gitCommonDir = (await getGitCommonDir(workspace)).trim();
    if (basename(gitCommonDir) !== ".git") {
      return workspace;
    }

    return dirname(gitCommonDir);
  } catch {
    return workspace;
  }
}

async function defaultGetGitCommonDir(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd,
  });
  return stdout.trim();
}
