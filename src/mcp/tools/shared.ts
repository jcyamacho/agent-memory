import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { MemoryError } from "../../errors.ts";
import type { MemoryRecord } from "../../memory.ts";

export function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof MemoryError) {
    if (error.code === "VALIDATION_ERROR" || error.code === "NOT_FOUND") {
      return new McpError(ErrorCode.InvalidParams, error.message);
    }

    return new McpError(ErrorCode.InternalError, error.message);
  }

  const message = error instanceof Error ? error.message : "Unknown server error.";
  return new McpError(ErrorCode.InternalError, message);
}

export const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toMemoryXml(
  record: MemoryRecord,
  options?: {
    deleted?: boolean;
    skipWorkspaceIfEquals?: string;
  },
): string {
  const scopeAttribute = getMemoryScopeAttribute(record, options?.skipWorkspaceIfEquals);
  const attributes = [
    `id="${escapeXml(record.id)}"`,
    `updated_at="${record.updatedAt.toISOString()}"`,
    scopeAttribute,
    options?.deleted ? 'deleted="true"' : undefined,
  ]
    .filter((value) => value)
    .join(" ");

  return `<memory ${attributes}>\n${escapeXml(record.content)}\n</memory>`;
}

function getMemoryScopeAttribute(record: MemoryRecord, skipWorkspaceIfEquals: string | undefined): string | undefined {
  if (record.workspace === undefined) {
    return 'global="true"';
  }

  if (record.workspace === skipWorkspaceIfEquals) {
    return undefined;
  }

  return `workspace="${escapeXml(record.workspace)}"`;
}

export function parseOptionalDate(value: string | undefined, fieldName: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new MemoryError("VALIDATION_ERROR", `${fieldName} must be a valid ISO 8601 datetime.`);
  }

  return date;
}
