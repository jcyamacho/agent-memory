# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by SQLite. It exposes two tools:

- `remember` -> save facts, decisions, preferences, and project context
- `recall` -> retrieve the most relevant memories later

Use it when your agent should remember preferences, project facts, and prior
decisions across sessions.

## Quick Start

Claude CLI:

```bash
claude mcp add --scope user memory -- npx -y @jcyamacho/agent-memory
```

Codex CLI:

```bash
codex mcp add memory -- npx -y @jcyamacho/agent-memory
```

Example MCP server config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@jcyamacho/agent-memory"
      ]
    }
  }
}
```

With a custom database path:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": [
        "-y",
        "@jcyamacho/agent-memory"
      ],
      "env": {
        "AGENT_MEMORY_DB_PATH": "/absolute/path/to/memory.db"
      }
    }
  }
}
```

Optional LLM instructions to reinforce the MCP's built-in guidance:

```text
Use `recall` at the start of every conversation and again mid-task before
making design choices or picking conventions. Use `remember` when the user
corrects your approach, a key decision is established, or you learn project
context not obvious from the code. Always pass workspace.
```

## What It Stores

This MCP is useful for context that should survive across turns and sessions:

- User preferences like response style, formatting, and workflow habits
- Project facts like paths, architecture choices, and conventions
- Important decisions and constraints that should not be rediscovered
- Project-scoped notes that still matter later

## Web UI

Browse, edit, and delete memories in a local web interface:

```bash
npx -y @jcyamacho/agent-memory --ui
```

Opens at `http://localhost:6580`. Use `--port` to change:

```bash
npx -y @jcyamacho/agent-memory --ui --port 9090
```

The web UI uses the same database as the MCP server. LLM tools remain
append-only; the web UI is the only way to edit or delete memories.

## Tools

### `remember`

Save durable context for later recall.

Inputs:

- `content` -> fact, preference, decision, or context to store
- `workspace` -> repository or workspace path

Output:

- `id`

### `recall`

Retrieve relevant memories for the current task.

Inputs:

- `terms` -> 2-5 distinctive terms or short phrases that should appear in the
  memory content; avoid full natural-language questions
- `limit` -> maximum results to return
- `workspace` -> workspace or repo path; biases ranking toward this workspace
- `updated_after` -> ISO 8601 lower bound
- `updated_before` -> ISO 8601 upper bound

Output:

- `results[]` with `id`, `content`, `score`, `workspace`, and `updated_at`

## How Ranking Works

`recall` uses a multi-signal ranking system to surface the most relevant
memories:

1. **Text relevance** is the primary signal -- memories whose content best
   matches your search terms rank highest.
2. **Workspace match** is a strong secondary signal. When you pass
   `workspace`, exact matches rank highest, sibling repositories get a small
   boost, and unrelated workspaces rank lowest.
3. **Global memories** (saved without a workspace) are treated as relevant
   everywhere. When you pass `workspace`, they rank below exact workspace
   matches and above sibling or unrelated repositories.
4. **Recency** is a minor tiebreaker -- newer memories rank slightly above older
   ones when other signals are equal.

If you omit `workspace`, recall falls back to text relevance and recency only.
For best results, pass `workspace` whenever you have one. Save memories without
a workspace only when they apply across all projects.

## Database location

By default, the SQLite database is created at:

```text
~/.config/agent-memory/memory.db
```

Override it with:

```bash
AGENT_MEMORY_DB_PATH=/absolute/path/to/memory.db
```

Set `AGENT_MEMORY_DB_PATH` when you want to:

- keep memory in a project-specific location
- share a memory DB across multiple clients
- store the DB somewhere easier to back up or inspect

Beta note: schema changes are not migrated. If you are upgrading from an older
beta, delete the existing memory DB and let the server create a new one.

## Development

For working on the project itself or running from source. Requires Bun and
Node.js.

```bash
bun install
bun run build
```

To use a local build as your MCP server:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-memory/dist/index.js"
      ]
    }
  }
}
```

```bash
bun lint
bun test
```

## License

MIT
