import { describe, expect, it } from "bun:test";
import type { MemorySearchEntity } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import { rerankSearchResults } from "./ranking.ts";

const DEFAULT_TIMESTAMP = new Date("2026-03-01T00:00:00.000Z");
const DEFAULT_QUERY_EMBEDDING = [1, 0];

function createSearchEntity(id: string, overrides: Partial<MemorySearchEntity> = {}): MemorySearchEntity {
  return {
    id,
    content: "Use shared sqlite decisions to coordinate agents.",
    embedding: [1, 0],
    score: toNormalizedScore(0.8),
    workspace: "/tmp/project",
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    ...overrides,
  };
}

describe("rerankSearchResults", () => {
  it("ranks exact, global, sibling, and unrelated workspaces in that order when retrieval is tied", () => {
    const results = rerankSearchResults(
      [
        createSearchEntity("unrelated", { workspace: "/x/y/z" }),
        createSearchEntity("global", { workspace: undefined }),
        createSearchEntity("sibling", { workspace: "/a/b/d" }),
        createSearchEntity("child", { workspace: "/a/b/c/d" }),
        createSearchEntity("exact", { workspace: "/a/b/c" }),
      ],
      "/a/b/c",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results.map((result) => result.id)).toEqual(["exact", "global", "sibling", "unrelated", "child"]);
  });

  it("ranks recently updated memories above older ones when other signals are equal", () => {
    const results = rerankSearchResults(
      [
        createSearchEntity("old", { updatedAt: new Date("2026-03-01T00:00:00.000Z") }),
        createSearchEntity("new", { updatedAt: new Date("2026-03-02T00:00:00.000Z") }),
      ],
      "/tmp/project",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results[0]?.id).toBe("new");
  });

  it("uses embedding similarity as a reranking signal when retrieval is tied", () => {
    const results = rerankSearchResults(
      [createSearchEntity("orthogonal", { embedding: [0, 1] }), createSearchEntity("aligned", { embedding: [1, 0] })],
      undefined,
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results[0]?.id).toBe("aligned");
  });
});
