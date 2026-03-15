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
  createdAfter?: Date;
  createdBefore?: Date;
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
