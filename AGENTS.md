# agent-memory

## Project Focus

- This project is a stdio MCP server that provides durable memory.
- The MCP tool names are `remember`, `recall`, `review`, `revise`, and `forget`.
- Prioritize end-user setup and MCP configuration clarity in user-facing docs.

## Runtime and Tooling

- Use Bun for local workflows: `bun install` and `bun run <script>`.
- Keep runtime code portable across Bun and Node.js.
- Do not use Bun-only runtime APIs in application code (`Bun.serve`,
  `Bun.file`, `Bun.sql`, `Bun.redis`, `bun:sqlite`, `Bun.$`).
- Build with `bun run build`, which must produce `dist/index.js`.
- Keep `better-sqlite3` external in the build output so its native binding
  loads correctly at runtime.

## APIs and Implementation

- Prefer standards-based and Node-compatible libraries.
- Use `node:fs` or `node:fs/promises` for filesystem access.
- Keep the public MCP surface simple and descriptive for LLMs.
- Preserve the flat project structure unless a change clearly justifies more
  nesting.

## MCP Instruction Design

- Treat MCP tools as model-controlled. Server instructions and tool metadata
  should be strong enough to trigger appropriate tool use without requiring a
  copied user prompt.
- Do not assume every MCP client gives server instructions equal weight. Keep
  critical activation guidance in tool descriptions as well, and treat project
  rules files like `AGENTS.md` or client-specific rules as important
  reinforcement.
- Treat README copy-paste prompts as user-controlled guidance. Use them to
  reinforce the most important memory habits, not to document every behavior.
- Scope each instruction layer tightly and avoid repeating guidance across
  levels unless it is a critical safety rule:
  - README optional prompt: shortest high-value habits only.
  - Server instructions: top-level policy for when to use the MCP.
  - Tool descriptions: when to use that tool instead of another one.
  - Parameter descriptions: expected value shape and constraints only.
- Keep server instructions short and policy-oriented. They should explain when
  to recall, when to save, when to revise vs forget, workspace expectations,
  and what must never be stored.
- Tool descriptions should define the external contract, not the internal
  implementation. Explain what the tool does, when to use it, and the boundary
  versus neighboring tools. Prefer concrete, operational wording over
  implementation jargon.
- Use strong schemas and concise descriptions together. The schema should carry
  structure; the text should carry intent.
- Keep tools focused and atomic. If a description needs many branches or modes,
  the tool boundary is probably too broad.
- Prefer stable, explicit return formats and document them briefly in the tool
  description when they help the model chain follow-up calls correctly.
- When useful, add accurate MCP tool annotations such as `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint`, but treat them as
  supplemental hints rather than the primary guidance channel.

## Architecture

- Recall pipeline: repository (FTS query + workspace filter) -> service
  (over-fetch candidates, build query embedding in parallel, re-rank by
  retrieval score + embedding similarity + workspace match + recency, slice to
  limit) -> MCP tool (XML serialization).
- The repository layer handles retrieval, workspace filtering, and score
  normalization to 0..1 (`NormalizedScore`). Ranking policy (weights, scoring
  formula, recency) belongs in the service layer.
- `WorkspaceResolver` canonicalizes paths (e.g. git worktree -> main repo root)
  before they reach the repository or ranking layers. Do not re-normalize
  workspace paths downstream.
- MCP tool outputs should only include server-generated values. Do not echo
  input parameters back to the caller.

## Testing

- Write tests with `bun:test` APIs.
- Service and MCP tool tests use fake implementations (`FakeMemoryRepository`,
  `FakeWorkspaceResolver`, `FakeEmbeddingService`) that return preset results
  regardless of query. Only repository tests hit a real SQLite database.
- Test scenarios must reflect what the real SQL layer can return. Do not test
  ranking behavior for result sets that the repository would never produce
  (e.g. memories from unrelated workspaces when a workspace filter is active).

## Docs and UX

- Optimize `README.md` for people using the MCP more than people developing it.
- Put setup, MCP config, and copy-pasteable LLM instructions before development
  details.
- For stdio MCP docs, use `npx -y <package>` examples instead of global install
  instructions.

## Validation Before Finish

- Run `bun lint`, `bun test`, and `bun run build` before finishing.
