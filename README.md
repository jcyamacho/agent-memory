# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by Markdown files on disk. It helps your agent remember preferences, project
context, and prior decisions across sessions.

It exposes four tools:

- `remember`: save facts, decisions, preferences, and project context
- `review`: load workspace and global memories sorted by most recently updated
- `revise`: update an existing memory when its content changes or when it
  should become global
- `forget`: delete up to 50 memories that are no longer relevant

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

## Load Memories at Session Start (Hooks)

Some clients defer MCP tool loading until the model decides it needs a tool.
That can prevent proactive `review` calls at session start. A session-start
hook guarantees memories are loaded before the first prompt.

The CLI prints the same `<memories>` XML as the MCP `review` tool:

```bash
npx -y @jcyamacho/agent-memory review
```

Use `--workspace <path>` to override the default workspace (`process.cwd()`).
Hook commands run with the project directory as cwd, so the default is usually
enough.

Claude Code (`~/.claude/settings.json` or `.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @jcyamacho/agent-memory review"
          }
        ]
      }
    ]
  }
}
```

Codex CLI (`~/.codex/hooks.json`, requires `features.codex_hooks = true` in
`~/.codex/config.toml`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          {
            "type": "command",
            "command": "npx -y @jcyamacho/agent-memory review"
          }
        ]
      }
    ]
  }
}
```

Notes:

- Claude Code caps hook stdout at 10,000 characters. Larger output is written
  to a file the model can read.
- `npx` cold-cache latency can delay session start. If the package is installed
  locally, call the `agent-memory` bin directly.
- Claude Code users can alternatively set `"alwaysLoad": true` on the memory
  server in `.mcp.json` (v2.1.121+) as a lighter, non-deterministic option.

## Optional LLM Instructions

Optional LLM instructions to reinforce the MCP's built-in guidance. The server
instructions and tool descriptions already cover most behavior. This prompt
targets the habits models most commonly miss:

```md
## Agent Memory

- Use the memory review MCP/tool at session start to load workspace memories
  into context before taking action
- During the session, use the memory remember, revise, and forget MCP/tools to
  keep memories accurate
- Pass `workspace` for project-scoped memory. Omit it only for facts that truly
  apply across projects. Promote project-scoped memory to global only when that
  is actually true.
- Remember durable preferences, confirmed approaches, and decisions with
  reasoning that would be hard to recover later. Revise memories when facts
  change and forget them when they are no longer relevant.
- Do not store secrets, temporary task state, or facts obvious from current
  code, files, or git history.
```

## Mutating Tool Output

`remember` and `revise` return the full affected memory as XML with `updated_at`
and scope information so clients that hide tool-call arguments can still see
what changed.

`forget` accepts an `ids` array containing 1 to 50 memory IDs. It trims IDs,
ignores duplicates, and deletes up to five memories concurrently. Deletion is
best-effort: one failure does not stop the remaining memories. The returned
`<forget_results>` preserves request order and contains each deleted memory
with `deleted="true"`, failed IDs and statuses, and summary counts.

## How Review Works

`review` requires a `workspace` and returns memories saved in that workspace
plus global memories (saved without a workspace), sorted by most recently
updated. Results are paginated. Pass `page` to load older memories.

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
