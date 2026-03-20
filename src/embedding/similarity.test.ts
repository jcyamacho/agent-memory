import { describe, expect, it } from "bun:test";
import { ValidationError } from "../errors.ts";
import { compareVectors } from "./similarity.ts";

describe("compareVectors", () => {
  it("compares vectors with cosine similarity", () => {
    expect(compareVectors([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(compareVectors([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(compareVectors([1, 1], [1, 0])).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it("rejects vectors with different dimensions", () => {
    expect(() => compareVectors([1, 2], [1])).toThrow(ValidationError);
    expect(() => compareVectors([1, 2], [1])).toThrow("Vectors must have the same length.");
  });
});
