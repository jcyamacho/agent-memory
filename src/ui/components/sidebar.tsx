import { NO_WORKSPACE_FILTER } from "../constants.ts";

interface SidebarProps {
  workspaces: string[];
  selected: string | null;
}

export function Sidebar({ workspaces, selected }: SidebarProps) {
  return (
    <nav class="sidebar">
      <h2>Workspaces</h2>
      <a href="/" class={`sidebar-item all-item${selected === null ? " active" : ""}`}>
        All
      </a>
      <a
        href={`/?workspace=${NO_WORKSPACE_FILTER}`}
        class={`sidebar-item no-ws-item${selected === NO_WORKSPACE_FILTER ? " active" : ""}`}
      >
        No workspace
      </a>
      {workspaces.map((ws) => (
        <a
          href={`/?workspace=${encodeURIComponent(ws)}`}
          class={`sidebar-item ws-item${selected === ws ? " active" : ""}`}
          title={ws}
        >
          <span>{ws.replace(/\/$/, "")}</span>
        </a>
      ))}
    </nav>
  );
}
