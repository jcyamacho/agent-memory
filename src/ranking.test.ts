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
  it("reranks a single workspace result so the score is not the raw retrieval score", () => {
    const [result] = rerankSearchResults(
      [createSearchEntity("only-result", { score: toNormalizedScore(1) })],
      "/tmp/project",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(result?.score).toBeLessThan(1);
  });

  it("ranks workspace memories above global memories when other signals are equal", () => {
    const results = rerankSearchResults(
      [createSearchEntity("global", { workspace: undefined }), createSearchEntity("exact", { workspace: "/a/b/c" })],
      "/a/b/c",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results.map((result) => result.id)).toEqual(["exact", "global"]);
  });

  it("prefers a workspace match over better embedding similarity when retrieval is tied", () => {
    const results = rerankSearchResults(
      [
        createSearchEntity("global", { embedding: [1, 0], workspace: undefined }),
        createSearchEntity("exact-workspace", { embedding: [0, 1], workspace: "/tmp/project" }),
      ],
      "/tmp/project",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results[0]?.id).toBe("exact-workspace");
  });

  it("keeps recency as a tiebreaker behind a materially better semantic match", () => {
    const results = rerankSearchResults(
      [
        createSearchEntity("older-semantic-match", {
          embedding: [1, 0],
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        }),
        createSearchEntity("newer-weaker-semantic-match", {
          embedding: [0.4, 0.916515138991168],
          updatedAt: new Date("2026-03-02T00:00:00.000Z"),
        }),
      ],
      "/tmp/project",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results[0]?.id).toBe("older-semantic-match");
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
      "/tmp/project",
      DEFAULT_QUERY_EMBEDDING,
    );

    expect(results[0]?.id).toBe("aligned");
  });
});
