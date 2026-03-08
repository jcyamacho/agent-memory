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

Recommended LLM instructions to pair with this MCP:

```text
Use `memory_recall` at task start and whenever prior preferences, project facts,
or decisions may matter.

Use `memory_remember` only for durable, reusable context: preferences,
conventions, decisions, constraints, and stable workflow habits. Store one
concise, self-contained fact per memory. Include `workspace` when available. Do
not store secrets or temporary noise.

For `memory_recall`, pass `terms` as 2-5 distinctive strings that describe what
you are looking for. Prefer names, identifiers, package names, file names, and
short phrases. Each term is matched independently — more terms cast a wider net,
and results matching multiple terms rank higher. Stemming is applied
automatically, so exact word forms are not required.

Use `workspace` to bias ranking toward the current project. Use `created_*`
only for exact scoping.
```

## What It Stores

This MCP is useful for context that should survive across turns and sessions:

- User preferences like response style, formatting, and workflow habits
- Project facts like paths, architecture choices, and conventions
- Important decisions and constraints that should not be rediscovered
- Project-scoped notes that still matter later

## Tools

### `remember`

Save durable context for later recall.

Inputs:

- `content` -> fact, preference, decision, or context to store
- `workspace` -> repository or workspace path

Output:

- `id`
- `workspace`
- `created_at`

### `recall`

Retrieve relevant memories for the current task.

Inputs:

- `terms` -> 2-5 distinctive terms or short phrases that should appear in the
  memory content; avoid full natural-language questions
- `limit` -> maximum results to return
- `workspace` -> workspace or repo path; biases ranking toward this workspace
- `created_after` -> ISO 8601 lower bound
- `created_before` -> ISO 8601 upper bound

Output:

- `results[]` with `id`, `content`, `score`, `workspace`, and `created_at`

## Setup

For normal usage:

- Node.js

For local development or running from source:

- Bun
- Node.js

### Database location

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

## Run from source

If you are developing locally instead of using the published package:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": [
        "/absolute/path/to/agent-memory/dist/index.js"
      ],
      "env": {
        "AGENT_MEMORY_DB_PATH": "/absolute/path/to/memory.db"
      }
    }
  }
}
```

Build first:

```bash
bun install
bun run build
```

## Local Development

Only needed if you want to work on the project itself.

```bash
bun install
bun lint
bun test
bun run build
```

## Notes

- `better-sqlite3` stays external in the build so its native binding loads
  correctly at runtime.
- Runtime output is Node-compatible and built to `dist/index.js`.

## License

MIT
