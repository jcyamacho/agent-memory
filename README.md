# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` gives your LLM a durable memory layer backed by SQLite. It is a
small MCP server with two focused tools:

- `remember` -> save facts, decisions, preferences, and project context
- `recall` -> retrieve the most relevant memories later

It is designed for agent workflows where context should survive across turns,
sessions, and even different clients.

## Why Use It

Most agents lose useful context between runs. This server lets them keep things
that actually matter:

- User preferences like tone, formatting, and workflow habits
- Project facts like architecture choices, paths, and constraints
- Ongoing decisions like naming, scope, and tradeoffs
- Session-specific notes that should still be discoverable later

The result is an agent that feels less stateless and less repetitive.

## Features

- SQLite-backed persistence with automatic database creation
- Full-text recall with ranking, filters, and date bounds
- Compact write acknowledgments to avoid wasting tokens
- Durable memory scoped by `source`, `workspace`, and `session`
- MCP-native tool descriptions optimized for LLM use

## Tools

### `remember`

Save durable context for later recall.

Inputs:

- `content` -> the fact, preference, decision, or context to remember
- `source` -> where the memory came from, such as a client, tool, or agent
- `workspace` -> repository or workspace path for project scoping
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

- `query` -> keywords, facts, names, or phrases to search for
- `limit` -> max results to return
- `preferred_source` -> rank memories from this source higher
- `preferred_workspace` -> rank memories from this workspace higher
- `filter_source` -> only return memories from this exact source
- `filter_workspace` -> only return memories from this exact workspace
- `created_after` -> ISO 8601 lower bound
- `created_before` -> ISO 8601 upper bound

Output:

- `results[]` with `id`, `content`, `score`, `source`, `workspace`, `session`,
  and `created_at`

## Installation

### From npm

```bash
npm install -g @jcyamacho/agent-memory
```

### From source

```bash
bun install
bun run build
```

The CLI entrypoint is:

```bash
agent-memory
```

## Requirements

- Node.js
- A normal package install with `node_modules`

Important: the build keeps `better-sqlite3` external on purpose. That is
required for its native binding to load correctly at runtime.

## Configuration

By default, the SQLite database is created at:

```text
~/.config/agent-memory/memory.db
```

Override it with:

```bash
AGENT_MEMORY_DB_PATH=/absolute/path/to/memory.db
```

Example:

```bash
AGENT_MEMORY_DB_PATH="$HOME/.local/share/agent-memory/memory.db" agent-memory
```

## Running It

### Development

```bash
bun install
bun run build
node dist/index.js
```

### Local validation

```bash
bun lint
bun test
bun run build
```

## MCP Client Configuration

Example MCP server entry:

```json
{
  "mcpServers": {
    "memory": {
      "command": "agent-memory",
      "env": {
        "AGENT_MEMORY_DB_PATH": "/absolute/path/to/memory.db"
      }
    }
  }
}
```

If you are running from source instead of a global install, use:

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

## Recommended LLM Instructions

Copy and paste this into your system prompt, `AGENTS.md`, `CLAUDE.md`, or
similar instruction file.

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

## Development Notes

- Runtime target is Node-compatible output at `dist/index.js`
- Local workflows use Bun
- Tests use `bun:test`
- Runtime code avoids Bun-only APIs

## License

MIT
