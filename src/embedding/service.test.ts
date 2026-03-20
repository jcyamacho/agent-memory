import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env as transformersEnv } from "@huggingface/transformers";
import { AGENT_MEMORY_MODELS_CACHE_PATH_ENV } from "../config.ts";
import { ValidationError } from "../errors.ts";
import { EmbeddingService } from "./service.ts";
import type { EmbeddingExtractor } from "./types.ts";

describe("EmbeddingService", () => {
  let directory: string;
  const originalCacheDir = transformersEnv.cacheDir;
  const originalUseFSCache = transformersEnv.useFSCache;
  const originalModelsCachePath = process.env[AGENT_MEMORY_MODELS_CACHE_PATH_ENV];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "agent-memory-model-cache-test-"));
  });

  afterEach(async () => {
    transformersEnv.cacheDir = originalCacheDir;
    transformersEnv.useFSCache = originalUseFSCache;

    if (originalModelsCachePath === undefined) {
      delete process.env[AGENT_MEMORY_MODELS_CACHE_PATH_ENV];
    } else {
      process.env[AGENT_MEMORY_MODELS_CACHE_PATH_ENV] = originalModelsCachePath;
    }

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
      modelsCachePath: join(directory, "configured-model-cache"),
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
      modelsCachePath: join(directory, "configured-model-cache"),
    });

    await service.createVector("first");
    await service.createVector("second");

    expect(factoryCalls).toBe(1);
  });

  it("uses the configured models cache path from the environment and creates the directory", async () => {
    const modelsCachePath = join(directory, "env-model-cache");
    process.env[AGENT_MEMORY_MODELS_CACHE_PATH_ENV] = modelsCachePath;
    let extractorCalls = 0;
    const service = new EmbeddingService({
      createExtractor: async () => {
        extractorCalls += 1;
        expect(transformersEnv.cacheDir).toBe(modelsCachePath);
        expect(transformersEnv.useFSCache).toBe(true);
        expect(existsSync(modelsCachePath)).toBe(true);

        return async () => ({
          tolist: () => [[0.1, 0.2, 0.3]],
        });
      },
    });

    await service.createVector("cache me");

    expect(extractorCalls).toBe(1);
  });

  it("prefers an explicit models cache path over the environment", async () => {
    process.env[AGENT_MEMORY_MODELS_CACHE_PATH_ENV] = join(directory, "env-model-cache");
    const explicitModelsCachePath = join(directory, "explicit-model-cache");
    const service = new EmbeddingService({
      modelsCachePath: explicitModelsCachePath,
      createExtractor: async () => {
        expect(transformersEnv.cacheDir).toBe(explicitModelsCachePath);
        expect(existsSync(explicitModelsCachePath)).toBe(true);

        return async () => ({
          tolist: () => [[0.1, 0.2, 0.3]],
        });
      },
    });

    await service.createVector("cache me");
  });

  it("rejects empty text", () => {
    const service = new EmbeddingService({
      createExtractor: async () => {
        throw new Error("not used");
      },
      modelsCachePath: join(directory, "configured-model-cache"),
    });

    expect(service.createVector("   ")).rejects.toThrow(ValidationError);
    expect(service.createVector("   ")).rejects.toThrow("Text is required.");
  });
});
