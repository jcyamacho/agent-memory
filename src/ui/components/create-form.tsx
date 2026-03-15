import type { FC } from "hono/jsx";
import { NO_WORKSPACE_FILTER } from "../constants.ts";

export const CreateForm: FC<{ workspace: string | null }> = ({ workspace }) => (
  <div class="form-card">
    <form method="post" action="/memories">
      <div class="field">
        <label for="new-content">Content</label>
        <textarea id="new-content" name="content" placeholder="Fact, preference, decision..." required />
      </div>
      <div class="field">
        <label for="new-workspace">Workspace (optional)</label>
        <input
          id="new-workspace"
          name="workspace"
          type="text"
          placeholder="/path/to/project"
          value={workspace && workspace !== NO_WORKSPACE_FILTER ? workspace : ""}
        />
      </div>
      <div class="form-actions">
        <button type="submit" class="primary">
          Save
        </button>
      </div>
    </form>
  </div>
);
