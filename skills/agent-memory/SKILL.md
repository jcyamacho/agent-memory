---
name: agent-memory
description: >-
  Create and maintain effective durable memories with the agent-memory MCP
  tools. Use when the remember, review, revise, and forget tools are available,
  when starting a task that may benefit from prior workspace context, or when
  confirmed preferences, corrections, decisions, constraints, pitfalls, and
  reusable approaches should persist across sessions. Guides atomic memory
  writing, workspace scoping, duplicate avoidance, conservative revision, and
  removal of obsolete memories.
---

# Agent Memory

Use the `agent-memory` MCP as a curated store of durable, hard-to-recover
context.
Keep memories small and trustworthy. Do not turn the store into a task log or a
copy of the repository.

## Follow the workflow

1. If workspace memories are not already present in context, call `review` with
   the absolute workspace path before acting on a task. Apply relevant memories
   as context, but verify drift-prone facts against current state.
2. If `has_more` is true, continue with the next page until all pages are
   loaded. This is retrieval, not a request to revise unrelated memories.
3. During the task, treat confirmed corrections, preferences, decisions,
   constraints, and difficult discoveries as memory candidates.
4. Before saving a candidate, apply the durability gate and compare it with
   loaded memories.
5. Use `remember`, `revise`, `forget`, or no operation according to the
   maintenance rules below.
6. Maintain only memories related to the current task. Perform a full-store
   maintenance sweep only when the user requests one.

## Apply the durability gate

Save a candidate only when every answer is yes:

1. Will it probably change or improve work in a future session?
2. Is it expected to remain true beyond the current task?
3. Would recovering it again require user correction, investigation, or
   non-obvious reasoning?
4. Is it confirmed rather than speculative?
5. Can it be expressed as one independently reusable idea?

Strong candidates include:

- Explicit user corrections and stable preferences.
- Decisions whose reasoning affects future choices.
- Non-obvious project or environment constraints.
- Confirmed debugging insights and reusable solutions.
- Recurring failure modes and how to avoid them.

Reject:

- Temporary task state, progress, plans, and reminders.
- Chronological summaries of completed work.
- Facts readily visible in current code, documentation, configuration, or git
  history.
- Generic knowledge the agent should already know.
- Guesses, unresolved possibilities, and one-off observations.
- Secrets, credentials, tokens, personal data, or sensitive content.

## Write one atomic memory

- Express one preference, decision, constraint, pitfall, or reusable approach
  in one to three sentences.
- Make it self-contained so a future agent can apply it without the original
  conversation.
- State where or when it applies if its scope is not universal.
- Include a short reason only when the reason changes future behavior.
- Split clauses that can become false or change independently into separate
  memories.

Good:

```text
Deploys must run from the release branch, not main. Releasing from main skips
the changelog check and the pipeline rejects the build.
```

Bad:

```text
We reviewed the pipeline, fixed the changelog check, updated the release docs,
ran the tests, and discussed future improvements.
```

The bad example is a task summary containing several independently recoverable
facts. Do not save it.

## Choose the maintenance operation

Two memories are duplicates when they share the same content, applicability,
and scope.

- Call `remember` when the candidate passes the gate and no duplicate exists.
- Do nothing when a duplicate already exists.
- Call `revise` when the same durable idea remains relevant but its content
  changed.
- Call `forget` when a memory is confirmed obsolete or incorrect.
- When duplicates exist, keep the clearest one and forget the redundant IDs.
- When similar memories differ in applicability or scope, keep both unless one
  is confirmed scoped incorrectly. Use the scope migration rules below.
- When a memory combines independently useful ideas, save the atomic
  replacements and then forget the compound original.
- When correctness or obsolescence is uncertain, preserve the memory and do
  nothing destructive.

When updating duplicates or compounds, complete the replacement `remember` or
`revise` calls before calling `forget`. Never delete the only durable copy
first.

Resolve contradictions conservatively. Prefer current verified evidence and
explicit user corrections. If neither version can be confirmed, keep the
existing memories and surface the uncertainty rather than choosing arbitrarily.

## Choose the scope

- Pass the absolute workspace path to `remember` for project, repository, tool,
  or environment-specific knowledge. This is the default.
- Omit the workspace only for preferences or facts that genuinely apply across
  projects.
- Promote a workspace memory with `revise` only after confirming it is
  universal.
- To replace an incorrectly global memory with a workspace memory, create the
  workspace-scoped replacement first, then forget the global memory.

Keep scope separate from applicability text. Scope controls where the memory
loads; the memory itself should still say when it applies if that boundary is
not obvious.
