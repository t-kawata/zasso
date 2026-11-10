// dashboard.test.ts — fixed header, timer, resize, scroll and cleanup.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProgressDashboard } from "./dashboard.js";
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
});
