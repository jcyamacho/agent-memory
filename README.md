# agent-memory

Persistent memory for MCP-powered coding agents.

`agent-memory` is a stdio MCP server that gives your LLM durable memory backed
by SQLite. It helps your agent remember preferences, project context, and prior
decisions across sessions.

It exposes five tools:

- `remember` -> save facts, decisions, preferences, and project context
- `recall` -> retrieve the most relevant memories later
- `review` -> browse workspace and global memories
- `revise` -> update an existing memory when it becomes outdated
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

Optional LLM instructions to reinforce the MCP's built-in guidance:

```md
## Agent Memory

- Use `memory_recall` at conversation start and before design choices,
  conventions, edge cases, or saving memory.
- Query `memory_recall` with 2-5 short anchor-heavy terms or exact phrases,
  not full questions or sentences.
- Use `memory_review` to browse workspace and global memories before bulk review
  or cleanup.
- Pass `workspace` for project-scoped memory. Omit it only for facts that
  apply across projects.
- Use `memory_remember` to save one durable fact when the user states a stable
  preference, correction, or reusable project decision.
- If the fact already exists, use `memory_revise` instead of creating a duplicate.
- Use `memory_forget` to remove a wrong or obsolete memory.
- Do not store secrets or temporary task state in memory.
```

## Web UI

Browse, edit, and delete memories in a local web interface:

```bash
npx -y @jcyamacho/agent-memory@latest --ui
```

Opens at `http://localhost:6580`. Use `--port` to change:

```bash
npx -y @jcyamacho/agent-memory@latest --ui --port 9090
```

The web UI uses the same database as the MCP server.

## How Recall Finds Memories

`recall` uses a multi-signal ranking system to surface the most relevant
memories:

1. **Text relevance** is the primary signal -- memories whose content best
   matches your search terms rank highest.
2. **Workspace match** is the next strongest signal. When you pass
   `workspace`, exact matches rank highest and all other scoped workspaces rank
   below exact matches.
3. **Embedding similarity** is a secondary signal. Recall builds an embedding
   from your normalized search terms and boosts memories whose stored
   embeddings are most semantically similar.
4. **Global memories** (saved without a workspace) are treated as relevant
   everywhere. When you pass `workspace`, they rank below exact workspace
   matches and above memories from other workspaces.
5. **Recency** is a minor tiebreaker -- newer memories rank slightly above older
   ones when other signals are equal.

If you omit `workspace`, recall still uses text relevance, embedding similarity,
and recency. For best results, pass `workspace` whenever you have one. Save
memories without a workspace only when they apply across all projects.

When you save a memory from a git worktree, `agent-memory` stores the main repo
root as the workspace. `recall` applies the same normalization to incoming
workspace queries so linked worktrees still match repo-scoped memories exactly.
When that happens, recall returns the queried workspace value so callers can
treat the match as belonging to their current worktree context.

## Configuration

### Database Location

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

### Model Cache Location

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

Schema changes are migrated automatically, including workspace normalization for
existing git worktree memories when the original path can still be resolved.

## License

MIT
