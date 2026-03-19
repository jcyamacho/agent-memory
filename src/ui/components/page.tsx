import type { MemoryRecord } from "../../memory.ts";
// @ts-expect-error -- Bun bundles .css as text via import attributes
import css from "../styles.css" with { type: "text" };
import { CreateForm } from "./create-form.tsx";
import { MemoryCard } from "./memory-card.tsx";
import { Sidebar } from "./sidebar.tsx";

export interface PageProps {
  memories: MemoryRecord[];
  workspaces: string[];
  selectedWorkspace: string | null;
  editingId: string | null;
  currentPage: number;
  hasMore: boolean;
  showCreate: boolean;
}

function buildUrl(base: string, overrides: Record<string, string>): string {
  const url = new URL(base, "http://localhost");
  for (const [key, value] of Object.entries(overrides)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function Page({
  memories,
  workspaces,
  selectedWorkspace,
  editingId,
  currentPage,
  hasMore,
  showCreate,
}: PageProps) {
  const params = new URLSearchParams();
  if (selectedWorkspace) params.set("workspace", selectedWorkspace);
  if (currentPage > 1) params.set("page", String(currentPage));
  const baseUrl = params.size > 0 ? `/?${params.toString()}` : "/";
  const showGroupHeaders = selectedWorkspace === null && new Set(memories.map((m) => m.workspace ?? null)).size > 1;

  const grouped: Array<{ key: string; items: MemoryRecord[] }> = [];
  for (const m of memories) {
    const key = m.workspace ?? "(no workspace)";
    const last = grouped[grouped.length - 1];
    if (last && last.key === key) {
      last.items.push(m);
    } else {
      grouped.push({ key, items: [m] });
    }
  }

  const hasPrev = currentPage > 1;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>agent-memory</title>
        <style>{css}</style>
      </head>
      <body>
        <div class="layout">
          <Sidebar workspaces={workspaces} selected={selectedWorkspace} />
          <div class="main">
            <header>
              <h1>agent-memory</h1>
              {showCreate ? (
                <a href={baseUrl} class="btn">
                  Cancel
                </a>
              ) : (
                <a href={buildUrl(baseUrl, { create: "1" })} class="btn primary">
                  New Memory
                </a>
              )}
            </header>
            {showCreate && <CreateForm workspace={selectedWorkspace} />}
            {memories.length === 0 && !hasPrev ? (
              <div class="empty">No memories found.</div>
            ) : (
              <>
                {grouped.map(({ key, items }) => (
                  <>
                    {showGroupHeaders && <div class="ws-group-header">{key}</div>}
                    {items.map((m) => (
                      <MemoryCard
                        memory={m}
                        editing={editingId === m.id}
                        showWorkspace={selectedWorkspace === null}
                        returnUrl={baseUrl}
                      />
                    ))}
                  </>
                ))}
                {(hasPrev || hasMore) && (
                  <div class="pagination">
                    {hasPrev ? (
                      <a href={buildUrl(baseUrl, { page: String(currentPage - 1) })} class="btn">
                        Previous
                      </a>
                    ) : (
                      <span />
                    )}
                    <span class="page-info">Page {currentPage}</span>
                    {hasMore ? (
                      <a href={buildUrl(baseUrl, { page: String(currentPage + 1) })} class="btn">
                        Next
                      </a>
                    ) : (
                      <span />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
