import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("build output", () => {
  it("keeps better-sqlite3 external for Node runtime", () => {
    execFileSync("bun", ["run", "build"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    const builtFile = readFileSync(join(process.cwd(), "dist", "index.js"), "utf8");

    expect(builtFile).toContain('from "better-sqlite3"');
    expect(builtFile).not.toContain("node_modules/better-sqlite3/lib/index.js");
  });
});
