export interface MemoryRecord {
  id: string;
  content: string;
  workspace?: string;
  createdAt: Date;
  updatedAt: Date;
}

declare const NormalizedScoreBrand: unique symbol;
export type NormalizedScore = number & { readonly [NormalizedScoreBrand]: true };
export const toNormalizedScore = (value: number): NormalizedScore => value as NormalizedScore;

export interface MemorySearchResult {
  id: string;
  content: string;
  score: NormalizedScore;
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
  workspaceIsNull?: boolean;
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

export interface SearchMemoryInput {
  terms: string[];
  limit?: number;
  workspace?: string;
  updatedAfter?: Date;
  updatedBefore?: Date;
}

export interface MemoryApi {
  create(input: CreateMemoryInput): Promise<MemoryRecord>;
  search(input: SearchMemoryInput): Promise<MemorySearchResult[]>;
  update(input: UpdateMemoryInput): Promise<MemoryRecord>;
  delete(input: DeleteMemoryInput): Promise<void>;
  get(id: string): Promise<MemoryRecord | undefined>;
  list(input: ListMemoriesInput): Promise<MemoryPage>;
  listWorkspaces(): Promise<string[]>;
}
