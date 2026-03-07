export interface MemoryRecord {
  id: string;
  content: string;
  source?: string;
  workspace?: string;
  session?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchQuery {
  query: string;
  limit: number;
  preferredSource?: string;
  preferredWorkspace?: string;
  filterSource?: string;
  filterWorkspace?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  source?: string;
  workspace?: string;
  session?: string;
  createdAt: Date;
}

export interface MemoryRepository {
  save(memory: MemoryRecord): Promise<MemoryRecord>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
}

export interface SaveMemoryInput {
  content: string;
  source?: string;
  workspace?: string;
  session?: string;
}

export interface SearchMemoryInput {
  query: string;
  limit?: number;
  preferredSource?: string;
  preferredWorkspace?: string;
  filterSource?: string;
  filterWorkspace?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}
