import type { EmbeddingVector } from "../embedding/types.ts";

const FLOAT32_BYTE_WIDTH = 4;

export function encodeEmbedding(vector: EmbeddingVector): Uint8Array {
  const typedArray = Float32Array.from(vector);
  return new Uint8Array(typedArray.buffer.slice(0));
}

export function decodeEmbedding(value: unknown): EmbeddingVector {
  const bytes = toUint8Array(value);

  if (bytes.byteLength === 0) {
    throw new Error("Embedding blob is empty.");
  }

  if (bytes.byteLength % FLOAT32_BYTE_WIDTH !== 0) {
    throw new Error("Embedding blob length is not a multiple of 4.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector: number[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += FLOAT32_BYTE_WIDTH) {
    vector.push(view.getFloat32(offset, true));
  }

  return vector;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  throw new Error("Expected embedding blob as Uint8Array or ArrayBuffer.");
}
