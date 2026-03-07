# AGENTS.md

## Runtime and Tooling

- Use Bun for local workflows: `bun install` and `bun run <script>`.
- Keep runtime code portable across Bun and Node.js.
- Do not use Bun-only runtime APIs in application code (`Bun.serve`,
  `Bun.file`, `Bun.sql`, `Bun.redis`, `bun:sqlite`, `Bun.$`).
- Build Node-compatible output with `bun run build`, which must produce
  `dist/index.js`.

## APIs and Implementation

- Prefer standards-based and Node-compatible libraries.
- Use `node:fs` or `node:fs/promises` for filesystem access.

## Validation Before Finish

- Run `bun lint`, `bun test`, and `bun run build` before finishing.
- Write tests with `bun:test` APIs.
