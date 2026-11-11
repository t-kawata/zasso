// @verifies C004
// lifecycle.test.ts — flush-before-stop ordering is data, not a process detail.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DisplayLifecycle } from "./lifecycle.js";

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function recordedLifecycle(order: string[]): DisplayLifecycle {
  return new DisplayLifecycle({
    renderer: {
      flush: () => order.push("flush"),
      resize: (width) => order.push(`renderer.resize:${width}`),
    },
    dashboard: {
      stop: () => order.push("dashboard.stop"),
      handleResize: () => order.push("dashboard.handleResize"),
    },
    detachInput: () => order.push("detach"),
    terminalWidth: () => 100,
    exit: (code) => {
      order.push(`exit:${code}`);
      return undefined as never;
    },
  });
}

describe("DisplayLifecycle", () => {
  it("resizes the renderer before the dashboard", () => {
    const order: string[] = [];
    recordedLifecycle(order).resize();
    assert.deepEqual(order, ["renderer.resize:100", "dashboard.handleResize"]);
  });

  it("flushes the renderer before stopping the dashboard on shutdown", () => {
    const order: string[] = [];
    recordedLifecycle(order).shutdown(0);
    assert.deepEqual(order, [
      "flush",
      "dashboard.stop",
      "detach",
      "exit:0",
    ]);
  });

  it("does not repeat flush, stop or detach on a second shutdown", () => {
    const order: string[] = [];
    const lifecycle = recordedLifecycle(order);
    lifecycle.shutdown(0);
    lifecycle.shutdown(1);
    assert.deepEqual(order, [
      "flush",
      "dashboard.stop",
      "detach",
      "exit:0",
      "exit:1",
    ]);
  });

  it("makes stop idempotent without exiting", () => {
    const order: string[] = [];
    const lifecycle = recordedLifecycle(order);
    lifecycle.stop();
    lifecycle.stop();
    assert.deepEqual(order, ["flush", "dashboard.stop"]);
  });
});
