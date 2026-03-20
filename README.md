# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by SQLite. It exposes four tools:

- `remember` -> save facts, decisions, preferences, and project context
- `recall` -> retrieve the most relevant memories later
- `revise` -> update an existing memory when it becomes outdated
- `forget` -> delete a memory that is no longer relevant

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

With a custom model cache path:

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
        "AGENT_MEMORY_MODELS_CACHE_PATH": "/absolute/path/to/models"
      }
    }
  }
}
```

Optional LLM instructions to reinforce the MCP's built-in guidance:

```text
Use `recall` at conversation start and before design choices, conventions, or
edge cases. Query with 2-5 short anchor-heavy terms or exact phrases, not
questions or sentences. `recall` is lexical-first; if it misses, retry once
with overlapping alternate terms. Use `remember` for one durable fact, then
use `revise` instead of duplicates and `forget` for wrong or obsolete
memories. Always pass workspace unless the memory is truly global.
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

The web UI uses the same database as the MCP server.

## Tools

- `remember` saves durable facts, preferences, decisions, and project context.
- `recall` retrieves the most relevant saved memories.
- `revise` updates an existing memory when it becomes outdated.
- `forget` deletes a memory that is no longer relevant.

## How Ranking Works

`recall` uses a multi-signal ranking system to surface the most relevant
memories:

1. **Text relevance** is the primary signal -- memories whose content best
   matches your search terms rank highest.
2. **Embedding similarity** is the next strongest signal. Recall builds an
   embedding from your normalized search terms and boosts memories whose stored
   embeddings are most semantically similar.
3. **Workspace match** is a strong secondary signal. When you pass
   `workspace`, exact matches rank highest, sibling repositories get a small
   boost, and unrelated workspaces rank lowest.
4. **Global memories** (saved without a workspace) are treated as relevant
   everywhere. When you pass `workspace`, they rank below exact workspace
   matches and above sibling or unrelated repositories.
5. **Recency** is a minor tiebreaker -- newer memories rank slightly above older
   ones when other signals are equal.

If you omit `workspace`, recall still uses text relevance, embedding similarity,
and recency. For best results, pass `workspace` whenever you have one. Save
memories without a workspace only when they apply across all projects.

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

## Model cache location

By default, downloaded embedding model files are cached at:

```text
~/.config/agent-memory/models
```

Override it with:

```bash
AGENT_MEMORY_MODELS_CACHE_PATH=/absolute/path/to/models
```

Set `AGENT_MEMORY_MODELS_CACHE_PATH` when you want to:

- keep model artifacts out of `node_modules`
- share the model cache across reinstalls or multiple clients
- store model downloads somewhere easier to inspect or manage

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
