import { describe, expect, it } from "bun:test";
import type { MemorySearchResult } from "./memory.ts";
import { toNormalizedScore } from "./memory.ts";
import { rerankSearchResults } from "./ranking.ts";

const DEFAULT_TIMESTAMP = new Date("2026-03-01T00:00:00.000Z");

function createSearchResult(id: string, overrides: Partial<MemorySearchResult> = {}): MemorySearchResult {
  return {
    id,
    content: "Use shared sqlite decisions to coordinate agents.",
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
        createSearchResult("unrelated", { workspace: "/x/y/z" }),
        createSearchResult("global", { workspace: undefined }),
        createSearchResult("sibling", { workspace: "/a/b/d" }),
        createSearchResult("child", { workspace: "/a/b/c/d" }),
        createSearchResult("exact", { workspace: "/a/b/c" }),
      ],
      "/a/b/c",
    );

    expect(results.map((result) => result.id)).toEqual(["exact", "global", "sibling", "unrelated", "child"]);
  });

  it("ranks recently updated memories above older ones when other signals are equal", () => {
    const results = rerankSearchResults(
      [
        createSearchResult("old", { updatedAt: new Date("2026-03-01T00:00:00.000Z") }),
        createSearchResult("new", { updatedAt: new Date("2026-03-02T00:00:00.000Z") }),
      ],
      "/tmp/project",
    );

    expect(results[0]?.id).toBe("new");
  });
});
