export type EmbeddingVector = number[];
export type EmbeddingTensorValue = number | EmbeddingTensorValue[];

export interface EmbeddingTensorLike {
  tolist(): EmbeddingTensorValue[];
}

export type EmbeddingExtractor = (text: string) => Promise<EmbeddingTensorLike>;

export interface EmbeddingServiceOptions {
  createExtractor?: () => Promise<EmbeddingExtractor>;
  modelsCachePath?: string;
}
