export interface MemoryRecord {
  id: string;
  content: string;
  workspace?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchQuery {
  terms: string[];
  limit: number;
  workspace?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  workspace?: string;
  createdAt: Date;
}

export interface MemoryRepository {
  save(memory: MemoryRecord): Promise<MemoryRecord>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
}

export interface SaveMemoryInput {
  content: string;
  workspace?: string;
}

export interface SearchMemoryInput {
  terms: string[];
  limit?: number;
  workspace?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}
