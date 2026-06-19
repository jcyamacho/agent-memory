import type { DeleteMemoriesResult, MemoryRecord } from "./memory.ts";

export const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatMemoriesXml(workspace: string, items: MemoryRecord[], hasMore: boolean): string {
  const escapedWorkspace = escapeXml(workspace);
  const memories = items.map((item) => toMemoryXml(item, { skipWorkspaceIfEquals: workspace })).join("\n");
  const body = memories ? `\n${memories}\n` : "";
  const effectiveHasMore = items.length > 0 && hasMore;

  return `<memories workspace="${escapedWorkspace}" has_more="${effectiveHasMore}">${body}</memories>`;
}

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

export function formatForgetResultsXml(result: DeleteMemoriesResult): string {
  const deletedCount = result.outcomes.filter((outcome) => outcome.deleted).length;
  const failedCount = result.outcomes.length - deletedCount;
  const outcomes = result.outcomes
    .map((outcome) =>
      outcome.deleted
        ? toMemoryXml(outcome.memory, { deleted: true })
        : `<failure id="${escapeXml(outcome.id)}" status="${outcome.code}" />`,
    )
    .join("\n");
  const body = outcomes ? `\n${outcomes}\n` : "";

  return `<forget_results deleted="${deletedCount}" failed="${failedCount}">${body}</forget_results>`;
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
