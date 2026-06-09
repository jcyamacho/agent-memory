import { parseArgs } from "node:util";
import type { MemoryApi } from "./memory.ts";
import { formatMemoriesXml } from "./memory-format.ts";

export interface CliOutput {
  write(text: string): void;
  error(text: string): void;
}

function resolveOutput(out: CliOutput | undefined): CliOutput {
  return (
    out ?? {
      write: (text) => process.stdout.write(text),
      error: (text) => process.stderr.write(text),
    }
  );
}

export async function runReviewCli(
  args: string[],
  memory: Pick<MemoryApi, "listAll">,
  options?: { cwd?: string; out?: CliOutput },
): Promise<number> {
  const out = resolveOutput(options?.out);

  try {
    const { values } = parseArgs({
      args,
      options: {
        workspace: { type: "string" },
      },
      allowPositionals: false,
    });

    const workspace = values.workspace ?? options?.cwd ?? process.cwd();
    const items = await memory.listAll({ workspace, global: true });

    out.write(`${formatMemoriesXml(workspace, items, false)}\n`);
    return 0;
  } catch (error) {
    out.error(`${error instanceof Error ? error.message : "Unknown error."}\n`);
    return 1;
  }
}

export function printCliUsage(write: (text: string) => void): void {
  write("Usage:\n");
  write("  agent-memory                              Start the MCP server\n");
  write("  agent-memory review [--workspace <path>]  Print all memories\n");
}

export async function runCli(
  args: string[],
  memory: Pick<MemoryApi, "listAll">,
  options?: { cwd?: string; out?: CliOutput },
): Promise<number> {
  const out = resolveOutput(options?.out);
  const [command, ...rest] = args;

  if (command === "review") {
    return runReviewCli(rest, memory, options);
  }

  out.error(`Unknown command: ${command}\n`);
  printCliUsage(out.error);
  return 1;
}
