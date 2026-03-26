import { mkdirSync } from "node:fs";
import { pipeline, env as transformersEnv } from "@huggingface/transformers";
import { ValidationError } from "../errors.ts";
import type {
  EmbeddingExtractor,
  EmbeddingServiceOptions,
  EmbeddingTensorLike,
  EmbeddingTensorValue,
  EmbeddingVector,
} from "./types.ts";

export const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

export function configureModelsCache(modelsCachePath: string): void {
  mkdirSync(modelsCachePath, { recursive: true });
  transformersEnv.useFSCache = true;
  transformersEnv.cacheDir = modelsCachePath;
}

export class EmbeddingService {
  private extractorPromise: Promise<EmbeddingExtractor> | undefined;

  constructor(private readonly options: EmbeddingServiceOptions = {}) {}

  async warmup(): Promise<void> {
    await this.getExtractor();
  }

  async createVector(text: string): Promise<EmbeddingVector> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      throw new ValidationError("Text is required.");
    }

    const extractor = await this.getExtractor();
    const embedding = await extractor(normalizedText);

    return normalizeVector(embedding.tolist());
  }

  private getExtractor(): Promise<EmbeddingExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = (this.options.createExtractor ?? createDefaultExtractor)();
    }

    return this.extractorPromise;
  }
}

async function createDefaultExtractor(): Promise<EmbeddingExtractor> {
  const extractor = await pipeline("feature-extraction", DEFAULT_EMBEDDING_MODEL);

  return (text) =>
    extractor(text, {
      pooling: "mean",
      normalize: true,
    }) as Promise<EmbeddingTensorLike>;
}

function normalizeVector(value: EmbeddingTensorValue[]): EmbeddingVector {
  if (value.length === 0) {
    throw new ValidationError("Embedding model returned an empty vector.");
  }

  const [firstItem] = value;

  if (typeof firstItem === "number") {
    return value.map((item) => {
      if (typeof item !== "number" || !Number.isFinite(item)) {
        throw new ValidationError("Embedding model returned a non-numeric vector.");
      }

      return item;
    });
  }

  if (Array.isArray(firstItem)) {
    return normalizeVector(firstItem);
  }

  throw new ValidationError("Embedding model returned an unexpected vector shape.");
}
