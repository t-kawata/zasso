// package-selection.test.ts — unique partial package names and order-crossing safety.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PackageSelectionError,
  resolvePackageSelection,
} from "./package-selection.js";
import type { WorkspacePackage } from "./workspace.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function pkg(name: string, pending: boolean): WorkspacePackage {
  return {
    id: `pkg-${name}`,
    name,
    path: `crates/${name}`,
    directory: `/ws/crates/${name}`,
    ticketsPath: `/ws/crates/${name}/Tickets.json`,
    pending,
  } as WorkspacePackage & { pending: boolean };
}

const packages = [
  pkg("doors-core", false),
  pkg("doors-operation", true),
  pkg("doors-cli", true),
  pkg("pjsip-prebuilt", true),
];

const selectionPackages = [
  pkg("doors-core", false),
  pkg("doors-operation", false),
  pkg("doors-cli", false),
  pkg("pjsip-prebuilt", true),
];

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function hasPending(packageEntry: WorkspacePackage): boolean {
  return (packageEntry as WorkspacePackage & { pending: boolean }).pending;
}

describe("resolvePackageSelection", () => {
  it("returns every package in implementation order when no selection is given", () => {
    const selected = resolvePackageSelection({ packages: selectionPackages, requested: [], hasPending });
    assert.deepStrictEqual(selected.map((entry) => entry.name), packages.map((entry) => entry.name));
  });

  it("prefers an exact match over a substring", () => {
    const selected = resolvePackageSelection({
      packages: selectionPackages,
      requested: ["doors-cli"],
      hasPending,
    });
    assert.deepStrictEqual(selected.map((entry) => entry.name), ["doors-cli"]);
  });

  it("resolves a unique substring", () => {
    const selected = resolvePackageSelection({
      packages: selectionPackages,
      requested: ["prebuilt"],
      hasPending,
    });
    assert.deepStrictEqual(selected.map((entry) => entry.name), ["pjsip-prebuilt"]);
  });

  it("deduplicates repeated selections and keeps implementation order", () => {
    const selected = resolvePackageSelection({
      packages: selectionPackages,
      requested: ["doors-cli", "doors-operation", "doors-cli"],
      hasPending,
    });
    assert.deepStrictEqual(selected.map((entry) => entry.name), ["doors-operation", "doors-cli"]);
  });

  it("rejects an ambiguous substring with candidates", () => {
    assert.throws(
      () => resolvePackageSelection({ packages, requested: ["doors"], hasPending }),
      (error: unknown) =>
        error instanceof PackageSelectionError &&
        error.code === "AMBIGUOUS" &&
        error.candidates.length === 3,
    );
  });

  it("rejects an unknown name", () => {
    assert.throws(
      () => resolvePackageSelection({ packages, requested: ["missing"], hasPending }),
      (error: unknown) => error instanceof PackageSelectionError && error.code === "UNKNOWN",
    );
  });

  it("rejects a selection that skips an earlier pending package", () => {
    assert.throws(
      () => resolvePackageSelection({ packages, requested: ["pjsip-prebuilt"], hasPending }),
      (error: unknown) =>
        error instanceof PackageSelectionError && error.code === "ORDER_CROSSING",
    );
  });

  it("allows skipping an earlier package when it has no pending tickets", () => {
    const selected = resolvePackageSelection({
      packages: selectionPackages,
      requested: ["doors-operation"],
      hasPending,
    });
    assert.deepStrictEqual(selected.map((entry) => entry.name), ["doors-operation"]);
  });
});
