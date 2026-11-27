// @verifies C001 — PX-449 NOW line format
// @verifies C004 — PX-449 one-line safety
// @verifies C005
// layout.test.ts — aligned header lines, phase columns, floor percent and the NOW line.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import chalk from "chalk";
import { renderActivityLine, renderHeader, visibleColumns } from "./layout.js";
import type { CurrentActivity, ProgressSnapshot } from "./model.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function todoTickets(count: number): Array<{ id: number; status: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    status: "todo",
  }));
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
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
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

  it("keeps the percent column aligned while each package shows its own phases", () => {
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

  it("paints only the -P target package name in bold yellow", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderHeader(snapshot(), {
        terminalWidth: 80,
        color: true,
        highlightNames: ["doors-core"],
      });
      assert.ok(lines[1]?.includes(chalk.bold.yellow("doors-core")));
      assert.ok(!lines[0]?.includes(chalk.bold.yellow("pjsip-prebuilt")));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("matches a partial -P name to the package it selects", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderHeader(snapshot(), {
        terminalWidth: 80,
        color: true,
        highlightNames: ["doors"],
      });
      assert.ok(lines[1]?.includes(chalk.bold.yellow("doors-core")));
      assert.ok(!lines[0]?.includes(chalk.bold.yellow("pjsip-prebuilt")));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("keeps the percent column aligned when a name is highlighted", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderHeader(snapshot(), {
        terminalWidth: 80,
        color: true,
        highlightNames: ["doors-core"],
      });
      assert.ok(lines[1]?.includes(chalk.bold.yellow("doors-core")));
      const stripped = lines.map(stripAnsi);
      assert.strictEqual(stripped[0]?.indexOf("%"), stripped[1]?.indexOf("%"));
      assert.strictEqual(visibleColumns(lines[0] ?? ""), visibleColumns(lines[1] ?? ""));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("truncates a highlighted name without dropping the width or percent column", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderHeader(snapshot(), {
        terminalWidth: 20,
        color: true,
        highlightNames: ["pjsip-prebuilt"],
      });
      assert.ok(lines[0]?.includes(chalk.bold.yellow("pjsip-prebuilt")));
      for (const line of lines) {
        assert.ok(visibleColumns(line) <= 20);
        assert.ok(stripAnsi(line).endsWith("%"));
      }
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("ignores an empty -P entry instead of highlighting every package", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderHeader(snapshot(), {
        terminalWidth: 80,
        color: true,
        highlightNames: [""],
      });
      for (const line of lines) {
        assert.ok(!line.includes(chalk.bold.yellow("pjsip-prebuilt")));
        assert.ok(!line.includes(chalk.bold.yellow("doors-core")));
      }
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

  it("separates phase blocks of one package with exactly one space", () => {
    const lines = renderHeader(
      {
        packages: [
          {
            name: "operation",
            path: ".",
            phases: [
              { id: 0, tickets: todoTickets(4) },
              { id: 1, tickets: todoTickets(3) },
              { id: 2, tickets: todoTickets(3) },
            ],
          },
          {
            name: "civic",
            path: ".",
            phases: [{ id: 0, tickets: todoTickets(17) }],
          },
        ],
      },
      { terminalWidth: 200, color: false },
    );
    assert.match(lines[0] ?? "", /P0 \[ 1 2 3 4 \] P1 \[ 1 2 3 \] P2 \[ 1 2 3 \]/);
    assert.doesNotMatch(lines[0] ?? "", /\] {2,}P1/);
  });

  it("does not pad a phase block to the widest sibling package", () => {
    const lines = renderHeader(
      {
        packages: [
          {
            name: "a",
            path: ".",
            phases: [
              { id: 0, tickets: todoTickets(1) },
              { id: 1, tickets: todoTickets(1) },
            ],
          },
          {
            name: "b",
            path: ".",
            phases: [{ id: 0, tickets: todoTickets(17) }],
          },
        ],
      },
      { terminalWidth: 200, color: false },
    );
    assert.ok(lines[0]?.includes("P0 [ 1 ] P1 [ 1 ]"));
  });

  it("renders a package's phases in ascending id order", () => {
    const lines = renderHeader(
      {
        packages: [
          {
            name: "p",
            path: ".",
            phases: [
              { id: 2, tickets: todoTickets(1) },
              { id: 0, tickets: todoTickets(1) },
              { id: 1, tickets: todoTickets(1) },
            ],
          },
        ],
      },
      { terminalWidth: 100, color: false },
    );
    assert.match(lines[0] ?? "", /P0 .* P1 .* P2/);
  });

  it("keeps the percent column when the phase blocks overflow", () => {
    const lines = renderHeader(
      {
        packages: [{ name: "p", path: ".", phases: [{ id: 0, tickets: todoTickets(20) }] }],
      },
      { terminalWidth: 40, color: false },
    );
    assert.strictEqual(lines[0]?.length, 40);
    assert.ok(lines[0]?.includes("…"));
    assert.ok(lines[0]?.endsWith("0%"));
  });

  it("attaches the omission marker rather than dropping a visible phase", () => {
    const lines = renderHeader(
      {
        packages: [
          {
            name: "p",
            path: ".",
            phases: [
              { id: 0, tickets: todoTickets(11) },
              { id: 1, tickets: todoTickets(1) },
            ],
          },
        ],
      },
      { terminalWidth: 40, color: false },
    );
    assert.strictEqual(lines[0]?.length, 40);
    assert.ok(lines[0]?.includes("P0 [ 1 2 3 4 5 6 7 8 9 10 11 ]…"));
    assert.ok(lines[0]?.endsWith("0%"));
  });

  it("keeps phase colors when the row is truncated", () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const lines = renderHeader(
        {
          packages: [
            {
              name: "p",
              path: ".",
              phases: [
                { id: 0, tickets: [{ id: 1, status: "made" }] },
                { id: 1, tickets: todoTickets(20) },
              ],
            },
          ],
        },
        { terminalWidth: 40, color: true },
      );
      const line = lines[0] ?? "";
      assert.ok(line.includes("\x1b[38;2;245;230;168m"));
      assert.ok(line.includes("\x1b[38;2;211;47;47m"));
      const plain = stripAnsi(line);
      assert.ok(plain.includes("P0 [ _ ]"));
      assert.ok(plain.includes("…"));
      assert.ok(plain.endsWith("0%"));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("colors _ | / x with the dark red while numbers stay white and ? stays cyan", () => {
    const snapshotWithStatuses: ProgressSnapshot = {
      packages: [
        {
          name: "p",
          path: ".",
          phases: [
            {
              id: 0,
              tickets: [
                { id: 1, status: "made" },
                { id: 2, status: "planned" },
                { id: 3, status: "done" },
                { id: 4, status: "reviewed" },
                { id: 5, status: "todo" },
                { id: 6, status: "unknown" },
              ],
            },
          ],
        },
      ],
    };
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const colored = renderHeader(snapshotWithStatuses, {
        terminalWidth: 120,
        color: true,
      }).join("\n");
      for (const symbol of ["_", "|", "/", "x"]) {
        assert.ok(
          colored.includes(`\x1b[38;2;211;47;47m${symbol}\x1b[39m`),
          symbol,
        );
      }
      assert.ok(colored.includes("\x1b[37m5\x1b[39m"));
      assert.ok(colored.includes("\x1b[36m?\x1b[39m"));
      const plain = renderHeader(snapshotWithStatuses, {
        terminalWidth: 120,
        color: false,
      }).join("\n");
      assert.strictEqual(stripAnsi(colored).trimEnd(), plain.trimEnd());
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("keeps colors when the line exactly fills the terminal", () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const lines = renderHeader(
        { packages: [{ name: "p", path: ".", phases: [{ id: 0, tickets: todoTickets(1) }] }] },
        { terminalWidth: 17, color: true },
      );
      assert.ok((lines[0] ?? "").includes("\x1b[38;2;245;230;168m"));
    } finally {
      chalk.level = previousLevel;
    }
  });
});

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
describe("renderActivityLine", () => {
  const startActivity: CurrentActivity = {
    packageName: "crystal-core",
    command: "/start-ticket",
    ticketKey: "P1-9",
  };

  it("C001 renders the running package, command and ticket on exactly one row", () => {
    const plain = renderActivityLine(startActivity, {
      terminalWidth: 60,
      color: false,
      shortPackageName: "core",
    });
    assert.strictEqual(plain, "NOW: [core] /start-ticket P1-9".padEnd(60));
    assert.strictEqual(visibleColumns(plain), 60);
    assert.strictEqual(plain.split("\n").length, 1);
  });

  it("C001 colors the NOW row dark green with white text without changing the text", () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const plain = renderActivityLine(startActivity, {
        terminalWidth: 60,
        color: false,
        shortPackageName: "core",
      });
      const colored = renderActivityLine(startActivity, {
        terminalWidth: 60,
        color: true,
        shortPackageName: "core",
      });
      assert.ok(colored.startsWith("\x1b[48;2;20;83;45m"), "dark-green background");
      assert.ok(colored.includes("\x1b[37m") || colored.includes("\x1b[97m"), "white foreground");
      assert.strictEqual(stripAnsi(colored), plain);
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("C001 renders a boundary command without a ticket and idle activity as one row", () => {
    const boundary = renderActivityLine(
      { packageName: "crystal-core", command: "/consolidate-stubs", ticketKey: null },
      { terminalWidth: 60, color: false, shortPackageName: "core" },
    );
    assert.strictEqual(boundary.trimEnd(), "NOW: [core] /consolidate-stubs");
    const idle = renderActivityLine(null, { terminalWidth: 20, color: false });
    assert.strictEqual(idle, "NOW: idle".padEnd(20));
    assert.strictEqual(idle.split("\n").length, 1);
  });

  it("C004 sanitizes control sequences and keeps exactly one row", () => {
    const previousLevel = chalk.level;
    chalk.level = 3;
    try {
      const hostile: CurrentActivity = {
        packageName: "core\x1b[2J\x07\nsuffix\u009b2J",
        command: "/start-ticket\x1b]0;title\x07",
        ticketKey: "P1-9",
      };
      const line = renderActivityLine(hostile, { terminalWidth: 80, color: true });
      assert.strictEqual(line.split("\n").length, 1);
      assert.strictEqual(visibleColumns(line), 80);
      assert.ok(!line.includes("\x1b[2J"), "CSI must be removed");
      assert.ok(!line.includes("\x1b]0;"), "OSC must be removed");
      assert.ok(!line.includes("\u009b"), "C1 CSI must be removed");
      // Only the SGR wrappers this function adds may remain.
      assert.ok(!line.replace(/\x1b\[[0-9;]*m/g, "").includes("\x1b"));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("C004 truncates to the terminal width and never splits a surrogate pair", () => {
    const narrow = renderActivityLine(startActivity, {
      terminalWidth: 10,
      color: false,
      shortPackageName: "core",
    });
    assert.strictEqual(visibleColumns(narrow), 10);
    assert.ok(narrow.endsWith("…"));

    const emoji = renderActivityLine(
      { packageName: "crystal-🚀core", command: "/start-ticket", ticketKey: "P1-9" },
      { terminalWidth: 19, color: false },
    );
    assert.strictEqual(visibleColumns(emoji), 19);
    const withoutPairs = emoji.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
    assert.ok(!/[\uD800-\uDFFF]/.test(withoutPairs), "no lone surrogate");
  });

  it("C001 pads with spaces so the background covers the whole row", () => {
    const line = renderActivityLine(null, { terminalWidth: 15, color: false });
    assert.strictEqual(line.length, 15);
    assert.ok(line.startsWith("NOW: idle"));
  });
});

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
describe("renderHeader short names", () => {
  it("C001 uses the full-workspace names supplied by the dashboard", () => {
    const lines = renderHeader(
      {
        packages: [
          { name: "crystal-core", path: "a", phases: [{ id: 0, tickets: todoTickets(1) }] },
          { name: "crystal-adapter-clock", path: "b", phases: [{ id: 0, tickets: todoTickets(1) }] },
        ],
      },
      { terminalWidth: 80, color: false, shortNames: ["core", "clock"] },
    );
    assert.ok(lines[0]?.startsWith("core "));
    assert.ok(lines[1]?.startsWith("clock "));
  });

  it("C001 falls back to slice derivation when the supplied names do not match", () => {
    const lines = renderHeader(
      { packages: [{ name: "crystal-core", path: "a", phases: [{ id: 0, tickets: todoTickets(1) }] }] },
      { terminalWidth: 80, color: false, shortNames: ["core", "extra"] },
    );
    assert.ok(lines[0]?.startsWith("crystal-core "));
  });
});

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
describe("renderHeader stage bracket", () => {
  const FULL = "[W,W,E12,E,G2,S2,S156,G2,B2,S4]";
  const SPARSE = "[W,W,-,-,-,-,-,-,-,-]";

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  function stagedSnapshot(): ProgressSnapshot {
    const base = snapshot();
    return {
      packages: [
        { ...base.packages[0]!, stages: ["W", "W", "E12", "E", "G2", "S2", "S156", "G2", "B2", "S4"] },
        { ...base.packages[1]!, stages: ["W", "W", "-", "-", "-", "-", "-", "-", "-", "-"] },
      ],
    };
  }

  it("C003 draws the bracket before the PX/P phase blocks", () => {
    const lines = renderHeader(stagedSnapshot(), { terminalWidth: 120, color: false });
    assert.ok(lines[0]?.includes(`${FULL} P0 [`), lines[0]);
    assert.ok(lines[1]?.includes(`${SPARSE} P0 [`), lines[1]);
  });

  it("C003 shows exactly ten comma-separated tokens", () => {
    const lines = renderHeader(stagedSnapshot(), { terminalWidth: 120, color: false });
    const bracket = /\[([^\]]+)\]/.exec(lines[0] ?? "")?.[1] ?? "";
    assert.equal(bracket.split(",").length, 10);
  });

  it("C003 keeps the percent column aligned and the row inside the terminal", () => {
    for (const terminalWidth of [120, 80, 56, 40, 20]) {
      const lines = renderHeader(stagedSnapshot(), { terminalWidth, color: false });
      assert.equal(lines[0]?.indexOf("%"), lines[1]?.indexOf("%"), `width ${terminalWidth}`);
      for (const line of lines) {
        assert.ok(line.length <= terminalWidth, `width ${terminalWidth}: ${line.length}`);
        assert.ok(line.trimEnd().endsWith("%"), `width ${terminalWidth}: ${line}`);
      }
    }
  });

  it("C003 drops phase blocks before the bracket", () => {
    const lines = renderHeader(stagedSnapshot(), { terminalWidth: 56, color: false });
    assert.ok(lines[0]?.includes(FULL), lines[0]);
    assert.ok(lines[0]?.includes("…"), lines[0]);
    assert.ok(!lines[0]?.includes("P0 ["), lines[0]);
  });

  it("C003 color mode adds ANSI but strips to the same text", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const plain = renderHeader(stagedSnapshot(), { terminalWidth: 120, color: false });
      const colored = renderHeader(stagedSnapshot(), { terminalWidth: 120, color: true });
      assert.deepStrictEqual(
        colored.map((line) => stripAnsi(line).trimEnd()),
        plain.map((line) => line.trimEnd()),
      );
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("C003 leaves a row without stages unchanged", () => {
    const lines = renderHeader(snapshot(), { terminalWidth: 80, color: false });
    assert.doesNotMatch(lines[0] ?? "", /\[W,W/);
  });
});
