import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { NotFoundError, PersistenceError } from "../errors.ts";
import type {
  CreateMemoryInput,
  DeleteMemoryInput,
  ListMemoriesInput,
  MemoryPage,
  MemoryRecord,
  MemoryRepository,
  UpdateMemoryInput,
} from "../memory.ts";

const DEFAULT_LIST_LIMIT = 15;
const MARKDOWN_EXTENSION = ".md";

interface MemoryTarget {
  path: string;
  workspace?: string;
}

interface WorkspaceTarget extends MemoryTarget {
  workspace: string;
}

export class FilesystemMemoryRepository implements MemoryRepository {
  private readonly globalsDirectory: string;
  private readonly workspacesDirectory: string;

  constructor(storePath: string) {
    this.globalsDirectory = join(storePath, "globals");
    this.workspacesDirectory = join(storePath, "workspaces");
  }

  async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    try {
      const id = randomUUID();
      const updatedAt = new Date();
      const targetPath = this.memoryPath(id, input.workspace);
      await this.writeFileAtomically(targetPath, input.content, updatedAt);
      return this.readRecord({ path: targetPath, workspace: input.workspace });
    } catch (error) {
      throw asPersistenceError("Failed to save memory.", error);
    }
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    try {
      const located = await this.findMemoryFile(id);
      if (!located) {
        return undefined;
      }

      return this.readRecord(located);
    } catch (error) {
      throw asPersistenceError("Failed to find memory.", error);
    }
  }

  async list(options: ListMemoriesInput): Promise<MemoryPage> {
    try {
      const offset = options.offset ?? 0;
      const limit = options.limit ?? DEFAULT_LIST_LIMIT;

      const targets = await this.resolveListTargets(options);
      const groups = await Promise.all(targets.map((target) => this.readDirectoryRecords(target)));

      const items = groups
        .flat()
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.id.localeCompare(right.id));

      const pageItems = items.slice(offset, offset + limit);

      return {
        items: pageItems,
        hasMore: offset + limit < items.length,
      };
    } catch (error) {
      throw asPersistenceError("Failed to list memories.", error);
    }
  }

  async update(input: UpdateMemoryInput): Promise<MemoryRecord> {
    const existing = await this.get(input.id);
    if (!existing) {
      throw new NotFoundError(`Memory not found: ${input.id}`);
    }

    const nextContent = input.content ?? existing.content;
    const nextWorkspace = input.workspace === undefined ? existing.workspace : (input.workspace ?? undefined);

    if (nextContent === existing.content && nextWorkspace === existing.workspace) {
      return existing;
    }

    const currentPath = this.memoryPath(existing.id, existing.workspace);
    const targetPath = this.memoryPath(existing.id, nextWorkspace);
    const updatedAt = new Date();

    try {
      await this.writeFileAtomically(targetPath, nextContent, updatedAt);
      if (targetPath !== currentPath) {
        await unlink(currentPath);
        await this.cleanupWorkspaceDirectory(existing.workspace);
      }

      return this.readRecord({ path: targetPath, workspace: nextWorkspace });
    } catch (error) {
      throw asPersistenceError("Failed to update memory.", error);
    }
  }

  async delete(input: DeleteMemoryInput): Promise<void> {
    const located = await this.findMemoryFile(input.id);
    if (!located) {
      throw new NotFoundError(`Memory not found: ${input.id}`);
    }

    try {
      await unlink(located.path);
      await this.cleanupWorkspaceDirectory(located.workspace);
    } catch (error) {
      throw asPersistenceError("Failed to delete memory.", error);
    }
  }

  async listWorkspaces(): Promise<string[]> {
    try {
      return (await this.listWorkspaceTargets())
        .map((target) => target.workspace)
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      throw asPersistenceError("Failed to list workspaces.", error);
    }
  }

  private async resolveListTargets(options: ListMemoriesInput): Promise<MemoryTarget[]> {
    if (options.workspace && options.global) {
      return [
        { path: this.globalsDirectory },
        { path: this.workspaceDirectory(options.workspace), workspace: options.workspace },
      ];
    }

    if (options.workspace) {
      return [{ path: this.workspaceDirectory(options.workspace), workspace: options.workspace }];
    }

    if (options.global) {
      return [{ path: this.globalsDirectory }];
    }

    return [{ path: this.globalsDirectory }, ...(await this.listWorkspaceTargets())];
  }

  private async readDirectoryRecords(target: MemoryTarget): Promise<MemoryRecord[]> {
    const entries = await readDirectory(target.path);
    const memoryFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION));

    return Promise.all(
      memoryFiles.map(async (entry) =>
        this.readRecord({
          path: join(target.path, entry.name),
          workspace: target.workspace,
        }),
      ),
    );
  }

  private async findMemoryFile(id: string): Promise<MemoryTarget | undefined> {
    const globalPath = this.memoryPath(id, undefined);
    if (await pathExists(globalPath)) {
      return { path: globalPath };
    }

    for (const target of await this.listWorkspaceTargets()) {
      const filePath = join(target.path, `${id}${MARKDOWN_EXTENSION}`);
      if (await pathExists(filePath)) {
        return { path: filePath, workspace: target.workspace };
      }
    }

    return undefined;
  }

  private async listWorkspaceTargets(): Promise<WorkspaceTarget[]> {
    const entries = await readDirectory(this.workspacesDirectory);
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        path: join(this.workspacesDirectory, entry.name),
        workspace: decodeWorkspaceSegment(entry.name),
      }));
  }

  private async readRecord(located: MemoryTarget): Promise<MemoryRecord> {
    const [content, updatedAt] = await Promise.all([readFile(located.path, "utf8"), this.readUpdatedAt(located.path)]);

    return {
      id: basename(located.path, MARKDOWN_EXTENSION),
      content,
      workspace: located.workspace,
      updatedAt,
    };
  }

  private async readUpdatedAt(filePath: string): Promise<Date> {
    const fileStats = await stat(filePath);
    return fileStats.mtime;
  }

  private memoryPath(id: string, workspace: string | undefined): string {
    return join(workspace ? this.workspaceDirectory(workspace) : this.globalsDirectory, `${id}${MARKDOWN_EXTENSION}`);
  }

  private workspaceDirectory(workspace: string): string {
    return join(this.workspacesDirectory, encodeWorkspaceSegment(workspace));
  }

  private async writeFileAtomically(filePath: string, content: string, updatedAt: Date): Promise<void> {
    const directoryPath = dirname(filePath);
    await mkdir(directoryPath, { recursive: true });

    const tempPath = join(directoryPath, `.${basename(filePath)}.${randomUUID()}.tmp`);

    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, filePath);
      await utimes(filePath, updatedAt, updatedAt);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async cleanupWorkspaceDirectory(workspace: string | undefined): Promise<void> {
    if (!workspace) {
      return;
    }

    const directoryPath = this.workspaceDirectory(workspace);
    const entries = await readDirectory(directoryPath);
    if (entries.length === 0) {
      await rm(directoryPath, { recursive: true, force: true });
    }
  }
}

export function encodeWorkspaceSegment(workspace: string): string {
  return encodeURIComponent(workspace);
}

export function decodeWorkspaceSegment(segment: string): string {
  return decodeURIComponent(segment);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readDirectory(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function asPersistenceError(message: string, error: unknown): Error {
  if (error instanceof NotFoundError || error instanceof PersistenceError) {
    return error;
  }

  return new PersistenceError(message, { cause: error });
}
