export interface MemoryRecord {
  id: string;
  content: string;
  workspace?: string;
  updatedAt: Date;
}

export interface MemoryPage {
  items: MemoryRecord[];
  hasMore: boolean;
}

export interface ListMemoriesInput {
  workspace?: string;
  global?: boolean;
  offset?: number;
  limit?: number;
}

export type ListAllMemoriesInput = Omit<ListMemoriesInput, "offset" | "limit">;

export interface CreateMemoryInput {
  content: string;
  workspace?: string;
}

export interface UpdateMemoryInput {
  id: string;
  content?: string;
  workspace?: string | null;
}

export interface DeleteMemoriesInput {
  ids: string[];
}

export interface DeleteMemoryInput {
  id: string;
}

export type DeleteMemoryFailureCode = "not_found" | "internal_error";

export type DeleteMemoryOutcome =
  | {
      deleted: true;
      memory: MemoryRecord;
    }
  | {
      deleted: false;
      id: string;
      code: DeleteMemoryFailureCode;
    };

export interface DeleteMemoriesResult {
  outcomes: DeleteMemoryOutcome[];
}

export interface MemoryApi {
  create(input: CreateMemoryInput): Promise<MemoryRecord>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  delete(input: DeleteMemoriesInput): Promise<DeleteMemoriesResult>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(input: ListMemoriesInput): Promise<MemoryPage>;
  listAll(input: ListAllMemoriesInput): Promise<MemoryRecord[]>;
  listWorkspaces(): Promise<string[]>;
}

export interface MemoryRepository {
  create(input: CreateMemoryInput): Promise<MemoryRecord>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  delete(input: DeleteMemoryInput): Promise<void>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(input: ListMemoriesInput): Promise<MemoryPage>;
  listWorkspaces(): Promise<string[]>;
}
