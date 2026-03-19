import type { MemoryRecord } from "../../memory.ts";

interface MemoryCardProps {
  memory: MemoryRecord;
  editing: boolean;
  showWorkspace: boolean;
  returnUrl: string;
}

export function MemoryCard({ memory, editing, showWorkspace, returnUrl }: MemoryCardProps) {
  return (
    <div class="card">
      <div class="card-header">
        <div class="card-meta">
          {showWorkspace && memory.workspace && (
            <>
              <span class="badge">{memory.workspace}</span>{" "}
            </>
          )}
          {memory.updatedAt.toLocaleString()}
        </div>
      </div>
      {editing ? (
        <form method="post" action={`/memories/${encodeURIComponent(memory.id)}/update`}>
          <input type="hidden" name="returnUrl" value={returnUrl} />
          {/* biome-ignore format: whitespace inside textarea is significant */}
          <textarea name="content" required>{memory.content}</textarea>
          <div class="card-actions">
            <button type="submit" class="primary">
              Save
            </button>
            <a href={returnUrl} class="btn">
              Cancel
            </a>
          </div>
        </form>
      ) : (
        <>
          <div class="card-content">{memory.content}</div>
          <div class="card-actions">
            <a
              href={`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}edit=${encodeURIComponent(memory.id)}`}
              class="btn"
            >
              Edit
            </a>
            <form
              method="post"
              action={`/memories/${encodeURIComponent(memory.id)}/delete`}
              onsubmit="return confirm('Delete this memory?')"
            >
              <input type="hidden" name="returnUrl" value={returnUrl} />
              <button type="submit" class="danger">
                Delete
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
