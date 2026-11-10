// step-timer.test.ts — time-window delegation, deadline checks and waiting.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkStepDeadline, isWithinTimeWindow, waitForWindow } from "./step-timer.js";
import type { WatcherConfig } from "./watcher.js";

const CONFIG: WatcherConfig = {
  timezone: "UTC",
  intervalMinutes: 60,
  filters: [{ startTime: "09:00", endTime: "17:00" }],
};

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function at(iso: string): Date {
  return new Date(iso);
}

describe("isWithinTimeWindow", () => {
  it("returns true when no watcher config is present", () => {
    assert.strictEqual(isWithinTimeWindow(null), true);
    assert.strictEqual(isWithinTimeWindow(undefined), true);
  });

  it("returns true inside a matching filter", () => {
    assert.strictEqual(isWithinTimeWindow(CONFIG, () => at("2026-11-10T12:00:00Z")), true);
  });

  it("returns false outside every filter", () => {
    assert.strictEqual(isWithinTimeWindow(CONFIG, () => at("2026-11-10T20:00:00Z")), false);
  });

  it("returns true when any later filter matches", () => {
    const config: WatcherConfig = {
      ...CONFIG,
      filters: [
        { startTime: "20:00", endTime: "22:00" },
        { startTime: "09:00", endTime: "18:00" },
      ],
    };
    assert.strictEqual(isWithinTimeWindow(config, () => at("2026-11-10T12:00:00Z")), true);
  });
});

describe("checkStepDeadline", () => {
  it("passes when no watcher config is present", () => {
    assert.strictEqual(checkStepDeadline("make", null), true);
  });

  it("passes inside the window", () => {
    assert.strictEqual(
      checkStepDeadline("make", CONFIG, () => at("2026-11-10T12:00:00Z")),
      true,
    );
  });

  it("returns false and warns outside the window", () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      assert.strictEqual(
        checkStepDeadline("make", CONFIG, () => at("2026-11-10T20:00:00Z")),
        false,
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.strictEqual(warnings.length, 1);
  });
});

describe("waitForWindow", () => {
  it("returns immediately when inside the window", async () => {
    let sleeps = 0;
    await waitForWindow(
      CONFIG,
      1000,
      () => at("2026-11-10T12:00:00Z"),
      async () => {
        sleeps++;
      },
    );
    assert.strictEqual(sleeps, 0);
  });

  it("sleeps until the clock enters the window", async () => {
    const times = [
      at("2026-11-10T20:00:00Z"),
      at("2026-11-10T20:30:00Z"),
      at("2026-11-10T21:00:00Z"),
      at("2026-11-10T12:00:00Z"),
    ];
    let index = 0;
    let sleeps = 0;
    await waitForWindow(
      CONFIG,
      1000,
      () => times[Math.min(index++, times.length - 1)]!,
      async () => {
        sleeps++;
      },
    );
    assert.strictEqual(sleeps, 2);
  });

  it("is a no-op without a watcher config", async () => {
    let sleeps = 0;
    await waitForWindow(null, 1000, () => at("2026-11-10T20:00:00Z"), async () => {
      sleeps++;
    });
    assert.strictEqual(sleeps, 0);
  });
});
