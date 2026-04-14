# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by Markdown files on disk. It helps your agent remember preferences, project
context, and prior decisions across sessions.

It exposes four tools:

- `remember` -> save facts, decisions, preferences, and project context
- `review` -> load workspace and global memories sorted by most recently updated
- `revise` -> update an existing memory when its content changes or when it
  should become global
- `forget` -> delete a memory that is no longer relevant

## Quick Start

Claude CLI:

```bash
claude mcp add --scope user memory -- npx -y @jcyamacho/agent-memory
```

Codex CLI:

```bash
codex mcp add memory -- npx -y @jcyamacho/agent-memory
```

OpenCode:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@jcyamacho/agent-memory"]
    }
  }
}
```

## Optional LLM Instructions

Optional LLM instructions to reinforce the MCP's built-in guidance. The server
instructions and tool descriptions already cover most behavior -- this prompt
targets the habits models most commonly miss:

```md
## Agent Memory

- Use `memory_review` at conversation start to load workspace memories into
  context. During the session, use `memory_remember`, `memory_revise`, and
  `memory_forget` to keep memories accurate.
- Pass `workspace` on `memory_remember` for project-scoped memory. Omit it
  only for facts that apply across projects.
- Remember preferences, confirmed approaches, and decisions with reasoning
  that would be lost after the session.
- Revise content when a fact changes, promote a project-scoped memory to
  global only when it truly applies across projects, and forget it when it is
  no longer relevant.
- Do not store secrets, temporary task state, or facts obvious from current
  code or git history.
```

## Mutating Tool Output

`remember`, `revise`, and `forget` return the full affected memory
as XML with `updated_at` and scope information so clients that hide tool-call
arguments can still see what changed.
`forget` includes `deleted="true"` on the returned `<memory>` element.

## How Review Works

`review` requires a `workspace` and returns memories saved in that workspace
plus global memories (saved without a workspace), sorted by most recently
updated. Results are paginated -- pass `page` to load older memories.

When you save a memory from a git worktree, `agent-memory` stores the main repo
root as the workspace. `review` applies the same normalization to incoming
workspace queries so linked worktrees still match repo-scoped memories exactly.

## Configuration

### Store Location

By default, memories are stored under:

```text
~/.config/agent-memory/
```

Override it with:

```bash
AGENT_MEMORY_STORE_PATH=/absolute/path/to/agent-memory
```

The store layout is:

```text
<store>/
  globals/<memory-id>.md
  workspaces/<encoded-workspace>/<memory-id>.md
```

Set `AGENT_MEMORY_STORE_PATH` when you want to:

- keep memory in a project-specific location
- share a memory store across multiple clients
- keep the Markdown files somewhere easier to back up or inspect

## License

MIT
