import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { MemoryError } from "../errors.ts";

export const toMcpError = (error: unknown): McpError => {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof MemoryError) {
    if (error.code === "VALIDATION_ERROR") {
      return new McpError(ErrorCode.InvalidParams, error.message);
    }

    return new McpError(ErrorCode.InternalError, error.message);
  }

  const message = error instanceof Error ? error.message : "Unknown server error.";
  return new McpError(ErrorCode.InternalError, message);
};

export const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const parseOptionalDate = (value: string | undefined, fieldName: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new MemoryError("VALIDATION_ERROR", `${fieldName} must be a valid ISO 8601 datetime.`);
  }

  return date;
};
