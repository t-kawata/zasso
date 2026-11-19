// @verifies C002 — PX-449 fixed-row budget
// @verifies C003 — PX-449 immediate activity repaint
// @verifies C005 — PX-449 non-TTY no-op
// dashboard.test.ts — fixed header, NOW row, timer, resize, scroll and cleanup.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import chalk from "chalk";
import stringWidth from "string-width";
import { computeFixedBudget, ProgressDashboard } from "./dashboard.js";
import type { ProgressSnapshot } from "./model.js";
import type { WorkspaceModel } from "../workspace.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function workspace(count: number): WorkspaceModel {
  return {
    root: "/ws",
    name: "ws",
    packages: Array.from({ length: count }, (_, index) => ({
      id: `pkg-${index}`,
      name: `pkg-${index}`,
      path: `crates/pkg-${index}`,
      directory: `/ws/crates/pkg-${index}`,
      ticketsPath: `/ws/crates/pkg-${index}/Tickets.json`,
    })),
  };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function snapshot(count: number): ProgressSnapshot {
  return {
    packages: Array.from({ length: count }, (_, index) => ({
      name: `pkg-${index}`,
      path: `crates/pkg-${index}`,
      phases: [{ id: 0, tickets: [{ id: 1, status: "todo" }] }],
    })),
  };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
interface Timer {
  callback: (() => void) | null;
  cleared: boolean;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function fakeTimer(): Timer {
  const timer: Timer = {
    callback: null,
    cleared: false,
    setInterval: ((callback: () => void) => {
      timer.callback = callback;
      return 1 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setInterval,
    clearInterval: (() => {
      timer.cleared = true;
    }) as unknown as typeof clearInterval,
  };
  return timer;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function build(options: {
  isTty: boolean;
  timer: Timer;
  writes: string[];
  readSnapshot?: () => ProgressSnapshot;
  activeIndex?: number;
  rows?: number;
  columns?: number;
}) {
  const dashboard = new ProgressDashboard({
    workspace: workspace(10),
    intervalMs: 5000,
    isTty: options.isTty,
    write: (chunk) => options.writes.push(chunk),
    readSnapshot: options.readSnapshot ?? (() => snapshot(10)),
    terminalSize: () => ({ columns: options.columns ?? 80, rows: options.rows ?? 24 }),
    now: () => 0,
    setInterval: options.timer.setInterval,
    clearInterval: options.timer.clearInterval,
    setRawMode: (enabled) => {
      rawMode = enabled;
    },
  });
  if (options.activeIndex !== undefined) {
    dashboard.follow(`pkg-${options.activeIndex}`);
  }
  return dashboard;
}

let rawMode = false;

// A dashboard whose terminal geometry can change between redraws. The header
// paint is width- and row-sensitive, so the tests need to resize the same
// instance instead of rebuilding it.
function buildDynamic(options: {
  timer: Timer;
  writes: string[];
  count: number;
  size: { columns: number; rows: number };
}) {
  return new ProgressDashboard({
    workspace: workspace(options.count),
    intervalMs: 5000,
    isTty: true,
    write: (chunk) => options.writes.push(chunk),
    readSnapshot: () => snapshot(options.count),
    terminalSize: () => ({ ...options.size }),
    now: () => 0,
    setInterval: options.timer.setInterval,
    clearInterval: options.timer.clearInterval,
    setRawMode: () => {},
  });
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function crystalWorkspace(): WorkspaceModel {
  const names = ["crystal-core", "crystal-adapter-clock", "crystal-protocol-types"];
  return {
    root: "/ws",
    name: "crystal",
    packages: names.map((name) => ({
      id: name,
      name,
      path: `crates/${name}`,
      directory: `/ws/crates/${name}`,
      ticketsPath: `/ws/crates/${name}/Tickets.json`,
    })),
  };
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function crystalSnapshot(): ProgressSnapshot {
  return {
    packages: ["crystal-core", "crystal-adapter-clock", "crystal-protocol-types"].map((name) => ({
      name,
      path: `crates/${name}`,
      phases: [{ id: 0, tickets: [{ id: 1, status: "todo" }] }],
    })),
  };
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
function buildCrystal(options: {
  timer: Timer;
  writes: string[];
  size: { columns: number; rows: number };
  isTty?: boolean;
}) {
  return new ProgressDashboard({
    workspace: crystalWorkspace(),
    intervalMs: 5000,
    isTty: options.isTty ?? true,
    write: (chunk) => options.writes.push(chunk),
    readSnapshot: () => crystalSnapshot(),
    terminalSize: () => ({ ...options.size }),
    now: () => 0,
    setInterval: options.timer.setInterval,
    clearInterval: options.timer.clearInterval,
    setRawMode: () => {},
  });
}

describe("ProgressDashboard", () => {
  it("C004 writes nothing when stdout is not a TTY", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({ isTty: false, timer, writes });
    dashboard.start();
    assert.strictEqual(timer.callback, null);
    dashboard.stop();
    assert.ok(writes.every((chunk) => !chunk.includes("\x1b[")));
    assert.deepStrictEqual(writes, []);
  });

  it("C005 starts, redraws, clears the timer and resets the scroll region", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    rawMode = false;
    const dashboard = build({ isTty: true, timer, writes });
    dashboard.start();
    assert.strictEqual(rawMode, true);
    assert.ok(timer.callback !== null);
    writes.length = 0;
    timer.callback?.();
    assert.ok(writes.join("").includes("\x1b["));
    dashboard.stop();
    assert.strictEqual(timer.cleared, true);
    assert.ok(writes.join("").includes("\x1b[r"));
    assert.strictEqual(rawMode, false);
  });

  it("paints the -P target package name bold yellow in the header", () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const timer = fakeTimer();
      const writes: string[] = [];
      const dashboard = new ProgressDashboard({
        workspace: crystalWorkspace(),
        intervalMs: 5000,
        isTty: true,
        write: (chunk) => writes.push(chunk),
        readSnapshot: () => crystalSnapshot(),
        terminalSize: () => ({ columns: 120, rows: 30 }),
        now: () => 0,
        setInterval: timer.setInterval,
        clearInterval: timer.clearInterval,
        setRawMode: () => {},
        highlightPackages: ["crystal-core"],
      });
      dashboard.start();
      dashboard.stop();
      const output = writes.join("");
      assert.ok(output.includes(chalk.bold.yellow("core")));
      assert.ok(!output.includes(chalk.bold.yellow("adapter-clock")));
    } finally {
      chalk.level = previousLevel;
    }
  });

  it("preserves the cursor across the scroll-region reset on stop", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({ isTty: true, timer, writes });
    dashboard.start();
    writes.length = 0;
    dashboard.stop();
    // DECSTBM reset homes the cursor. Saving before the reset and restoring
    // after it keeps the shell prompt where the last log line ended instead of
    // at the top-left corner (and keeps a late write off the header rows).
    assert.strictEqual(writes.join(""), "\x1b7\x1b[r\x1b8\x1b[?25h");
  });

  it("keeps the previous snapshot when the reader throws", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({
      isTty: true,
      timer,
      writes,
      readSnapshot: () => {
        throw new Error("bad json");
      },
    });
    dashboard.start();
    assert.doesNotThrow(() => timer.callback?.());
    assert.doesNotThrow(() => dashboard.stop());
    assert.ok(writes.length > 0);
  });

  it("recomputes on resize without throwing", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({ isTty: true, timer, writes });
    dashboard.start();
    assert.doesNotThrow(() => dashboard.handleResize());
    assert.ok(writes.length > 0);
  });

  it("shows more indicators when packages exceed the header window", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({
      isTty: true,
      timer,
      writes,
      activeIndex: 5,
      rows: 10,
    });
    dashboard.start();
    const output = writes.join("");
    assert.ok(output.includes("more") || output.includes("↑") || output.includes("↓"));
    dashboard.stop();
  });

  it("manual scroll moves the window and follow returns to the active package", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({ isTty: true, timer, writes, activeIndex: 5, rows: 10 });
    dashboard.start();
    writes.length = 0;
    dashboard.handleKeypress("down", false);
    assert.ok(writes.length > 0);
    writes.length = 0;
    dashboard.handleKeypress("f", false);
    assert.ok(writes.length > 0);
    dashboard.stop();
  });

  it("clears the inherited screen before the first header paint", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildDynamic({ timer, writes, count: 10, size: { columns: 80, rows: 40 } });
    dashboard.start();
    const output = writes.join("");
    const clearIndex = output.indexOf("\x1b[2J");
    const headerIndex = output.indexOf("P0 [");
    assert.ok(clearIndex >= 0, "the first redraw must clear the inherited screen");
    assert.ok(headerIndex > clearIndex, "the clear must precede the first header line");
    dashboard.stop();
  });

  it("erases every header row before writing it", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildDynamic({ timer, writes, count: 10, size: { columns: 80, rows: 40 } });
    dashboard.start();
    const output = writes.join("");
    for (let row = 1; row <= 11; row += 1) {
      assert.ok(
        output.includes(`\x1b[${row};1H\x1b[2K`),
        `row ${row} must be erased before its content is painted`,
      );
    }
    dashboard.stop();
  });

  it("reissues the scroll region when the height changes without changing the row count", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const size = { columns: 80, rows: 40 };
    const dashboard = buildDynamic({ timer, writes, count: 10, size });
    dashboard.start();
    assert.ok(writes.join("").includes("\x1b[12;40r"));
    writes.length = 0;
    size.rows = 34;
    dashboard.handleResize();
    assert.ok(
      writes.join("").includes("\x1b[12;34r"),
      "a height change must reissue DECSTBM even when the header line count is stable",
    );
    dashboard.stop();
  });

  it("leaves the cursor at the top of the log region after a redraw", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildDynamic({ timer, writes, count: 10, size: { columns: 80, rows: 40 } });
    dashboard.start();
    const output = writes.join("");
    // Header lines = 11 (NOW + 10 packages), so the log region starts at row 12.
    // The save must happen there and the restore must return there.
    assert.ok(output.includes("\x1b[12;1H\x1b7"));
    assert.ok(output.endsWith("\x1b8"));
    dashboard.stop();
  });

  it("erases rows that leave the header when the window shrinks", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const size = { columns: 80, rows: 40 };
    const dashboard = buildDynamic({ timer, writes, count: 29, size });
    dashboard.start();
    assert.strictEqual(size.rows, 40);
    writes.length = 0;
    size.rows = 24;
    dashboard.handleResize();
    const output = writes.join("");
    // 29 header rows fit at 40 rows; at 24 rows only 20 header lines remain.
    // Rows 21..24 were header and must be erased before they receive logs.
    for (let row = 21; row <= 24; row += 1) {
      assert.ok(
        output.includes(`\x1b[${row};1H\x1b[2K`),
        `stale header row ${row} must be erased`,
      );
    }
    dashboard.stop();
  });
});

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
describe("computeFixedBudget", () => {
  it("C002 keeps four log rows and clamps indicator and package rows", () => {
    assert.deepStrictEqual(computeFixedBudget(4, 10), { packageRows: 0, indicatorRows: 0, fixedRows: 0 });
    assert.deepStrictEqual(computeFixedBudget(5, 10), { packageRows: 0, indicatorRows: 0, fixedRows: 1 });
    assert.deepStrictEqual(computeFixedBudget(6, 10), { packageRows: 1, indicatorRows: 0, fixedRows: 2 });
    assert.deepStrictEqual(computeFixedBudget(8, 10), { packageRows: 1, indicatorRows: 2, fixedRows: 4 });
    assert.deepStrictEqual(computeFixedBudget(8, 3), { packageRows: 3, indicatorRows: 0, fixedRows: 4 });
    for (let rows = 5; rows <= 40; rows += 1) {
      assert.ok(computeFixedBudget(rows, 29).fixedRows <= rows - 4, `rows=${rows}`);
    }
  });
});

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
describe("ProgressDashboard NOW row", () => {
  it("C001 paints idle NOW on row 1 and packages from row 2", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildDynamic({ timer, writes, count: 10, size: { columns: 80, rows: 24 } });
    dashboard.start();
    const output = writes.join("");
    const nowIndex = output.indexOf("NOW: idle");
    const firstPackageIndex = output.indexOf("P0 [");
    assert.ok(nowIndex >= 0);
    assert.ok(firstPackageIndex > nowIndex);
    assert.ok(output.includes("\x1b[1;1H\x1b[2K"));
    assert.ok(output.includes("\x1b[2;1H\x1b[2K"));
    assert.ok(output.includes("\x1b[12;24r"));
    dashboard.stop();
  });

  it("C003 repaints row 1 immediately when a command starts and ends", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildCrystal({ timer, writes, size: { columns: 80, rows: 24 } });
    dashboard.start();
    assert.ok(writes.join("").includes("\x1b[5;24r"));
    writes.length = 0;
    dashboard.setActivity({ packageName: "crystal-core", command: "/start-ticket", ticketKey: "P1-9" });
    const running = writes.join("");
    assert.ok(running.includes("NOW: [core] /start-ticket P1-9"));
    assert.ok(running.includes("\x1b[1;1H"));
    assert.ok(running.includes("\x1b[2;1H"));
    writes.length = 0;
    dashboard.setActivity(null);
    assert.ok(writes.join("").includes("NOW: idle"));
    dashboard.stop();
  });

  it("C002 leaves four log rows on a five-row terminal and draws only NOW", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildDynamic({ timer, writes, count: 10, size: { columns: 80, rows: 5 } });
    dashboard.start();
    const output = writes.join("");
    assert.ok(output.includes("NOW: idle"));
    assert.ok(output.includes("\x1b[2;5r"));
    assert.ok(!output.includes("P0 ["));
    dashboard.stop();
  });

  it("C002 recomputes the fixed budget after a resize", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const size = { columns: 80, rows: 24 };
    const dashboard = buildDynamic({ timer, writes, count: 10, size });
    dashboard.start();
    writes.length = 0;
    size.rows = 7;
    dashboard.handleResize();
    assert.ok(writes.join("").includes("\x1b[4;7r"), "three fixed rows start the log at row 4");
    dashboard.stop();
  });

  it("C002 releases the scroll region when the terminal becomes too short", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const size = { columns: 80, rows: 40 };
    const dashboard = buildDynamic({ timer, writes, count: 10, size });
    dashboard.start();
    writes.length = 0;
    size.rows = 4;
    dashboard.handleResize();
    assert.strictEqual(writes.join(""), "\x1b7\x1b[r\x1b8\x1b[?25h");
    writes.length = 0;
    size.rows = 24;
    dashboard.handleResize();
    assert.ok(writes.join("").includes("\x1b[2J"), "growing back clears the inherited screen");
    assert.ok(writes.join("").includes("\x1b[12;24r"));
    dashboard.stop();
  });

  it("C002 keeps the fixed height when only one indicator side is used", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = build({ isTty: true, timer, writes, rows: 8, activeIndex: 0 });
    dashboard.start();
    const output = writes.join("");
    assert.ok(output.includes("\x1b[5;8r"), "four fixed rows start the log at row 5");
    assert.ok(output.includes("\x1b[2;1H\x1b[2K"), "the unused top indicator row is still painted");
    assert.ok(output.includes("\x1b[3;1H\x1b[2K"), "the package row follows the reserved indicator row");
    dashboard.stop();
  });

  it("C003 keeps the running activity across a timer refresh", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildCrystal({ timer, writes, size: { columns: 80, rows: 24 } });
    dashboard.start();
    dashboard.setActivity({ packageName: "crystal-core", command: "/start-ticket", ticketKey: "P1-9" });
    writes.length = 0;
    timer.callback?.();
    assert.ok(writes.join("").includes("NOW: [core] /start-ticket P1-9"));
    dashboard.stop();
  });

  it("C004 pads a wide-character NOW row to exactly the terminal width", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildCrystal({ timer, writes, size: { columns: 20, rows: 24 } });
    dashboard.start();
    writes.length = 0;
    dashboard.setActivity({
      packageName: "crystal-部署core",
      command: "/start-ticket",
      ticketKey: "P1-9",
    });
    const output = writes.join("");
    const rowStart = output.indexOf("\x1b[1;1H\x1b[2K") + "\x1b[1;1H\x1b[2K".length;
    const rowEnd = output.indexOf("\x1b[2;1H");
    const painted = output.slice(rowStart, rowEnd).replace(/\x1b\[[0-9;]*m/g, "");
    assert.strictEqual(stringWidth(painted), 20);
    dashboard.stop();
  });

  it("C005 writes nothing, including NOW, when stdout is not a TTY", () => {
    const timer = fakeTimer();
    const writes: string[] = [];
    const dashboard = buildCrystal({
      timer,
      writes,
      size: { columns: 80, rows: 24 },
      isTty: false,
    });
    dashboard.start();
    dashboard.setActivity({ packageName: "crystal-core", command: "/start-ticket", ticketKey: "P1-9" });
    assert.deepStrictEqual(writes, []);
    assert.strictEqual(timer.callback, null);
  });
});
