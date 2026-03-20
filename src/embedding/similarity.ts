import { ValidationError } from "../errors.ts";
import type { EmbeddingVector } from "./types.ts";

export function compareVectors(left: EmbeddingVector, right: EmbeddingVector): number {
  validateVector(left, "Left vector");
  validateVector(right, "Right vector");

  if (left.length !== right.length) {
    throw new ValidationError("Vectors must have the same length.");
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (const [index, leftValue] of left.entries()) {
    const rightValue = right[index];

    if (rightValue === undefined) {
      throw new ValidationError("Vectors must have the same length.");
    }

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new ValidationError("Vectors must not have zero magnitude.");
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function validateVector(vector: EmbeddingVector, label: string): void {
  if (vector.length === 0) {
    throw new ValidationError(`${label} must not be empty.`);
  }

  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new ValidationError(`${label} must contain only finite numbers.`);
    }
  }
}
