# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by SQLite. It exposes two tools:

- `remember` -> save facts, decisions, preferences, and project context
- `recall` -> retrieve the most relevant memories later

Use it when your agent should remember preferences, project facts, and prior
decisions across sessions.

## Quick Start

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
Use `memory_recall` at the start of a task, when the user refers to previous
context, or whenever prior preferences, project facts, or decisions may help.

Use `memory_remember` to save durable context that will matter later, such as
user preferences, project conventions, architecture decisions, constraints, and
stable workflow habits.

Store concise, self-contained facts or short notes. Include `source`,
`workspace`, and `session` when available so future retrieval is better scoped.

Do not store secrets, credentials, API keys, tokens, or temporary noise.

When recalling, use short factual queries and keep `limit` small unless you
need broader recall. Use `preferred_workspace` or `preferred_source` to bias
ranking, and `filter_workspace` or `filter_source` only when exact scoping is
required.
```

## What It Stores

This MCP is useful for context that should survive across turns and sessions:

- User preferences like response style, formatting, and workflow habits
- Project facts like paths, architecture choices, and conventions
- Important decisions and constraints that should not be rediscovered
- Session-linked notes that still matter later

## Tools

### `remember`

Save durable context for later recall.

Inputs:

- `content` -> fact, preference, decision, or context to store
- `source` -> client, tool, or agent name
- `workspace` -> repository or workspace path
- `session` -> conversation or execution session identifier

Output:

- `id`
- `source`
- `workspace`
- `session`
- `created_at`

### `recall`

Retrieve relevant memories for the current task.

Inputs:

- `query` -> keywords, names, facts, or phrases to search for
- `limit` -> maximum results to return
- `preferred_source` -> ranking hint for a source
- `preferred_workspace` -> ranking hint for a workspace
- `filter_source` -> exact source filter
- `filter_workspace` -> exact workspace filter
- `created_after` -> ISO 8601 lower bound
- `created_before` -> ISO 8601 upper bound

Output:

- `results[]` with `id`, `content`, `score`, `source`, `workspace`, `session`,
  and `created_at`

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
