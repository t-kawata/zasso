// layout.test.ts — aligned header lines, phase columns and floor percent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import chalk from "chalk";
import { renderHeader } from "./layout.js";
import type { ProgressSnapshot } from "./model.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function snapshot(): ProgressSnapshot {
  return {
    packages: [
      {
        name: "pjsip-prebuilt",
        path: "crates/pjsip-prebuilt",
        phases: [{ id: 0, tickets: [
          { id: 1, status: "reviewed" },
          { id: 2, status: "reviewed" },
          { id: 3, status: "todo" },
        ] }],
      },
      {
        name: "doors-core",
        path: "crates/doors-core",
        phases: [{ id: 0, tickets: [
          { id: 1, status: "reviewed" },
          { id: 2, status: "made" },
        ] }],
      },
    ],
  };
}

describe("renderHeader", () => {
  it("C003 renders symbols, floor percent and aligned percent columns", () => {
    const lines = renderHeader(snapshot(), { terminalWidth: 80, color: false });
    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0]?.includes("pjsip-prebuilt"));
    assert.ok(lines[0]?.includes("P0 [ x x 3 ]"));
    assert.ok(lines[0]?.includes("66%"));
    assert.ok(lines[1]?.includes("doors-core"));
    assert.ok(lines[1]?.includes("P0 [ x _ ]"));
    assert.ok(lines[1]?.includes("50%"));
    assert.strictEqual(lines[0]?.indexOf("%"), lines[1]?.indexOf("%"));
    assert.ok(lines.every((line) => line.length <= 80));
  });

  it("keeps one fixed column per phase id across packages", () => {
    const lines = renderHeader(
      {
        packages: [
          {
            name: "a",
            path: "a",
            phases: [
              { id: 0, tickets: [{ id: 1, status: "reviewed" }] },
              { id: 1, tickets: [{ id: 1, status: "todo" }, { id: 2, status: "todo" }] },
            ],
          },
          {
            name: "b",
            path: "b",
            phases: [{ id: 0, tickets: [{ id: 1, status: "todo" }, { id: 2, status: "todo" }, { id: 3, status: "todo" }] }],
          },
        ],
      },
      { terminalWidth: 100, color: false },
    );
    const firstP1 = lines[0]?.indexOf("P1") ?? -1;
    assert.ok(firstP1 > 0);
    assert.strictEqual(lines[1]?.indexOf("P1"), -1);
    assert.strictEqual(lines[0]?.indexOf("%"), lines[1]?.indexOf("%"));
  });

  it("C004 color mode adds ANSI but strips to the same text", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const plain = renderHeader(snapshot(), { terminalWidth: 80, color: false });
      const colored = renderHeader(snapshot(), { terminalWidth: 80, color: true });
      assert.ok(colored[0]?.includes("\x1b["));
      assert.deepStrictEqual(colored.map((line) => stripAnsi(line).trimEnd()), plain.map((line) => line.trimEnd()));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("returns zero percent for a package with no tickets", () => {
    const lines = renderHeader(
      { packages: [{ name: "empty", path: ".", phases: [] }] },
      { terminalWidth: 40, color: false },
    );
    assert.ok(lines[0]?.includes("0%"));
  });

  it("truncates to the terminal width without throwing", () => {
    const lines = renderHeader(snapshot(), { terminalWidth: 20, color: false });
    assert.ok(lines.every((line) => line.length <= 20));
  });
});
