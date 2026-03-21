# AGENTS.md

## Project Focus

- This project is a stdio MCP server that provides durable memory.
- The MCP tool names are `remember`, `recall`, `revise`, and `forget`.
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
  rules files like `AGENTS.md`, `CLAUDE.md`, or client-specific rules as
  important reinforcement.
- Treat README copy-paste prompts as user-controlled guidance. Use them to
  reinforce the most important memory habits, not to document every behavior.
- Scope each instruction layer tightly:
  - README optional prompt: shortest high-value habits only.
  - Server instructions: top-level policy for when to use the MCP.
  - Tool descriptions: when to use that tool instead of another one.
  - Parameter descriptions: how to fill that specific field.
- Avoid repeating the same guidance at multiple levels unless it is a critical
  safety rule.
- Keep server instructions short and policy-oriented. They should explain when
  to recall, when to save, when to revise vs forget, workspace expectations,
  and what must never be stored.
- Tool descriptions should explain what the tool does, when to use it, and the
  main boundary versus neighboring tools. Keep output-format notes brief.
- Tool descriptions should not explain internal mechanisms unless they change
  the caller-visible contract. Prefer describing what the caller should expect
  from the response rather than how the server implements it.
- Parameter descriptions should describe the expected value shape and
  constraints only. Do not restate whole-tool policy there.
- Prefer concrete, operational wording over implementation jargon. Explain user
  outcomes, not internals, unless the internal detail materially changes tool
  use.
- Tool descriptions should define the external contract, not the internal
  implementation. Keep internal details out of model-facing instructions unless
  they are required to use the tool correctly.
- Keep tools focused and atomic. If a description needs many branches or modes,
  the tool boundary is probably too broad.
- Use strong schemas and concise descriptions together. The schema should carry
  structure; the text should carry intent.
- When useful, add accurate MCP tool annotations such as `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, and `openWorldHint`, but treat them as
  supplemental hints rather than the primary guidance channel.
- Prefer stable, explicit return formats and document them briefly in the tool
  description when they help the model chain follow-up calls correctly.

## Architecture

- The repository layer handles retrieval and normalizes scores to 0..1
  (`NormalizedScore`). Ranking policy (workspace preference, recency) belongs
  in the service layer, not in SQL queries.
- MCP tool outputs should only include server-generated values. Do not echo
  input parameters back to the caller.

## Docs and UX

- Optimize `README.md` for people using the MCP more than people developing it.
- Put setup, MCP config, and copy-pasteable LLM instructions before development
  details.
- For stdio MCP docs, use `npx -y <package>` examples instead of global install
  instructions.

## Validation Before Finish

- Run `bun lint`, `bun test`, and `bun run build` before finishing.
- Write tests with `bun:test` APIs.
