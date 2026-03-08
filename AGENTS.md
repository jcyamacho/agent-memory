# AGENTS.md

## Project Focus

- This project is a stdio MCP server that provides durable memory.
- The MCP tool names are `remember` and `recall`.
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

## Docs and UX

- Optimize `README.md` for people using the MCP more than people developing it.
- Put setup, MCP config, and copy-pasteable LLM instructions before development
  details.
- For stdio MCP docs, use `npx -y <package>` examples instead of global install
  instructions.

## Validation Before Finish

- Run `bun lint`, `bun test`, and `bun run build` before finishing.
- Write tests with `bun:test` APIs.
