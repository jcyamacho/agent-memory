import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env as transformersEnv } from "@huggingface/transformers";
import { ValidationError } from "../errors.ts";
import { configureModelsCache, EmbeddingService } from "./service.ts";
import type { EmbeddingExtractor } from "./types.ts";

describe("EmbeddingService", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-model-cache-test-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("creates a vector from text using the configured extractor", async () => {
    let calls = 0;
    const extractor: EmbeddingExtractor = async (text) => {
      calls += 1;
      expect(text).toBe("Share WAL mode guidance across agents.");

      return {
        tolist: () => [[0.25, 0.5, 0.75]],
      };
    };

    const service = new EmbeddingService({
      createExtractor: async () => extractor,
    });

    const vector = await service.createVector("  Share WAL mode guidance across agents.  ");

    expect(vector).toEqual([0.25, 0.5, 0.75]);
    expect(calls).toBe(1);
  });

  it("reuses the same extractor across vector requests", async () => {
    let factoryCalls = 0;
    const service = new EmbeddingService({
      createExtractor: async () => {
        factoryCalls += 1;

        return async () => ({
          tolist: () => [[0.1, 0.2, 0.3]],
        });
      },
    });

    await service.createVector("first");
    await service.createVector("second");

    expect(factoryCalls).toBe(1);
  });

  it("warmup triggers extractor initialization without creating a vector", async () => {
    let factoryCalls = 0;
    const service = new EmbeddingService({
      createExtractor: async () => {
        factoryCalls += 1;

        return async () => ({
          tolist: () => [[0.1, 0.2, 0.3]],
        });
      },
    });

    expect(factoryCalls).toBe(0);

    await service.warmup();

    expect(factoryCalls).toBe(1);

    await service.createVector("after warmup");

    expect(factoryCalls).toBe(1);
  });

  it("rejects empty text", () => {
    const service = new EmbeddingService({
      createExtractor: async () => {
        throw new Error("not used");
      },
    });

    expect(service.createVector("   ")).rejects.toThrow(ValidationError);
    expect(service.createVector("   ")).rejects.toThrow("Text is required.");
  });
});

describe("configureModelsCache", () => {
  let directory: string;
  const originalCacheDir = transformersEnv.cacheDir;
  const originalUseFSCache = transformersEnv.useFSCache;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-model-cache-test-"));
  });

  afterEach(async () => {
    transformersEnv.cacheDir = originalCacheDir;
    transformersEnv.useFSCache = originalUseFSCache;
    await rm(directory, { force: true, recursive: true });
  });

  it("creates the cache directory and configures the transformers environment", () => {
    const modelsCachePath = join(directory, "model-cache");

    configureModelsCache(modelsCachePath);

    expect(existsSync(modelsCachePath)).toBe(true);
    expect(transformersEnv.cacheDir).toBe(modelsCachePath);
    expect(transformersEnv.useFSCache).toBe(true);
  });
});
