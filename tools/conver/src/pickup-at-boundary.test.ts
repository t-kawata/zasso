// pickup-at-boundary.test.ts — availability, root anchoring and fail-open contract.
//
// conver runs /pickup-conver-update-candidates at two boundaries: after the final
// split and immediately before a push. The command is an optional reflection step,
// so an unavailable command or a failed run must never stop the pipeline.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PICKUP_COMMAND,
  checkPickupAvailability,
  runPickupAtBoundary,
} from "./pickup-at-boundary.js";
import type { PickupAvailability } from "./pickup-at-boundary.js";

const AVAILABLE: PickupAvailability = { ok: true };

describe("checkPickupAvailability", () => {
  it("is unavailable when the command file is not installed", () => {
    const result = checkPickupAvailability("/ws", {
      exists: () => false,
      hasUpstream: () => true,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.match(result.reason, /command/);
  });

  it("is unavailable when the branch has no upstream", () => {
    const result = checkPickupAvailability("/ws", {
      exists: () => true,
      hasUpstream: () => false,
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) assert.match(result.reason, /upstream/);
  });

  it("is available when the command exists and the branch has an upstream", () => {
    const result = checkPickupAvailability("/ws", {
      exists: () => true,
      hasUpstream: () => true,
    });
    assert.deepStrictEqual(result, { ok: true });
  });

  it("checks the command path under the workspace .claude", () => {
    const checked: string[] = [];
    checkPickupAvailability("/ws", {
      exists: (file) => {
        checked.push(file);
        return true;
      },
      hasUpstream: () => true,
    });
    assert.deepStrictEqual(checked, [
      "/ws/.claude/commands/pickup-conver-update-candidates.md",
    ]);
  });
});

describe("runPickupAtBoundary", () => {
  it("executes the command at the workspace root", async () => {
    const calls: string[] = [];
    await runPickupAtBoundary({
      root: "/ws",
      isAvailable: () => AVAILABLE,
      execute: async (cwd) => {
        calls.push(cwd);
      },
      log: () => {},
    });
    assert.deepStrictEqual(calls, ["/ws"]);
  });

  it("skips without executing when the command is unavailable", async () => {
    const logs: string[] = [];
    let executed = false;
    await runPickupAtBoundary({
      root: "/ws",
      isAvailable: () => ({ ok: false, reason: "upstream-not-configured" }),
      execute: async () => {
        executed = true;
      },
      log: (line) => logs.push(line),
    });
    assert.strictEqual(executed, false);
    assert.ok(
      logs.some(
        (line) => line.includes("skipped") && line.includes("upstream-not-configured"),
      ),
    );
  });

  it("skips without executing when availability cannot be determined", async () => {
    const logs: string[] = [];
    let executed = false;
    await assert.doesNotReject(() =>
      runPickupAtBoundary({
        root: "/ws",
        isAvailable: () => {
          throw new Error("git missing");
        },
        execute: async () => {
          executed = true;
        },
        log: (line) => logs.push(line),
      }),
    );
    assert.strictEqual(executed, false);
    assert.ok(
      logs.some((line) => line.includes("skipped") && line.includes("git missing")),
    );
  });

  it("swallows a failure and reports it so the caller continues", async () => {
    const logs: string[] = [];
    await assert.doesNotReject(() =>
      runPickupAtBoundary({
        root: "/ws",
        isAvailable: () => AVAILABLE,
        execute: async () => {
          throw new Error("agent crashed");
        },
        log: (line) => logs.push(line),
      }),
    );
    assert.ok(
      logs.some((line) => line.includes("failed") && line.includes("agent crashed")),
    );
  });

  it("reports completion after a successful run", async () => {
    const logs: string[] = [];
    await runPickupAtBoundary({
      root: "/ws",
      isAvailable: () => AVAILABLE,
      execute: async () => {},
      log: (line) => logs.push(line),
    });
    assert.ok(logs.some((line) => line.includes("complete")));
  });

  it("names the command it runs", () => {
    assert.strictEqual(PICKUP_COMMAND, "/pickup-conver-update-candidates");
  });
});
