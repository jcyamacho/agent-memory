export interface MemoryRecord {
  id: string;
  content: string;
  workspace?: string;
  createdAt: Date;
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

export interface CreateMemoryInput {
  content: string;
  workspace?: string;
}

export interface UpdateMemoryInput {
  id: string;
  content: string;
}

export interface DeleteMemoryInput {
  id: string;
}

export interface MemoryApi {
  create(input: CreateMemoryInput): Promise<MemoryRecord>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  delete(input: DeleteMemoryInput): Promise<void>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(input: ListMemoriesInput): Promise<MemoryPage>;
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
