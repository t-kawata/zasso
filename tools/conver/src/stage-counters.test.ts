// stage-counters.test.ts — the typed adapter over the shared pipeline counters.
//
// The adapter must not own a second reading of the artifact status files. These
// tests read the same fixtures through the adapter and through the shared module
// and require the same answer, so a divergence is a defect rather than a fashion.
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { decideStageRun, readStageExecutionCount } from "./stage-counters.js";
import { readGraphRuns } from "../.claude/scripts/workspacify-order/lib/counters.mjs";

const createdRoots: string[] = [];

after(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "px455-counters-"));
  createdRoots.push(root);
  return root;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value), "utf8");
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createPackage(root: string, name: string): string {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  return directory;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createStageStatus(directory: string, stem: string, suffix: string, runs: number): void {
  writeJson(join(directory, `${stem}${suffix}`), { runs });
}

describe("readStageExecutionCount", () => {
  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C002: reads the workspacify completion from both manifest statuses", () => {
    const root = createRoot();
    assert.equal(readStageExecutionCount("workspacify", { root }), 0);
    writeJson(join(root, "WORKSPACIFY-TREE-MANIFEST.json"), { status: "COMPLETE" });
    writeJson(join(root, "WORKSPACIFY-ALLOCATE-MANIFEST.json"), { status: "COMPLETE" });
    assert.equal(readStageExecutionCount("workspacify", { root }), 1);

    writeJson(join(root, "WORKSPACIFY-TREE-MANIFEST.json"), { status: "INCOMPLETE" });
    assert.equal(readStageExecutionCount("workspacify", { root }), 0);

    writeFileSync(join(root, "WORKSPACIFY-TREE-MANIFEST.json"), "{not json", "utf8");
    assert.equal(readStageExecutionCount("workspacify", { root }), 0);
  });

  it("reads the root generations for educe and smooth", () => {
    const root = createRoot();
    mkdirSync(join(root, "educe-sequences"));
    mkdirSync(join(root, "smooth-sequences"));
    writeJson(join(root, "educe-sequences", "status.json"), { generation: 2 });
    writeJson(join(root, "smooth-sequences", "status.json"), { generation: 1 });
    assert.equal(readStageExecutionCount("educe", { root }), 2);
    assert.equal(readStageExecutionCount("smooth", { root }), 1);
  });

  it("returns null when a generation is absent", () => {
    const root = createRoot();
    assert.equal(readStageExecutionCount("educe", { root }), null);
    assert.equal(readStageExecutionCount("smooth", { root }), null);
  });

  it("reads the explain presence from EXPLAIN-RFC-SEED.md", () => {
    const root = createRoot();
    const directory = createPackage(root, "pkg-a");
    assert.equal(readStageExecutionCount("explain", { root, packagePath: "pkg-a", directory }), 0);
    writeFileSync(join(directory, "EXPLAIN-RFC-SEED.md"), "# explained\n", "utf8");
    assert.equal(readStageExecutionCount("explain", { root, packagePath: "pkg-a", directory }), 1);
  });

  it("reads the grill generation and falls back to completed sessions", () => {
    const root = createRoot();
    const directory = createPackage(root, "pkg-a");
    assert.equal(readStageExecutionCount("grill", { root, packagePath: "pkg-a", directory }), null);
    writeJson(join(directory, "Status.json"), { completedSessions: 2 });
    assert.equal(readStageExecutionCount("grill", { root, packagePath: "pkg-a", directory }), 2);
    writeJson(join(directory, "Status.json"), { grillGeneration: 3 });
    assert.equal(readStageExecutionCount("grill", { root, packagePath: "pkg-a", directory }), 3);
  });

  it("reads the graphify, boundify and split runs from the stem status files", () => {
    const root = createRoot();
    const directory = createPackage(root, "pkg-a");
    writeFileSync(join(directory, "RFC.md"), "# rfc\n", "utf8");
    writeJson(join(directory, "RFC-GRAPH.json"), {});
    createStageStatus(directory, "RFC", "-GRAPHIFY-Status.json", 2);
    createStageStatus(directory, "RFC", "-BOUNDIFY-Status.json", 1);
    createStageStatus(directory, "RFC", "-SPLIT-Status.json", 4);
    const target = { root, packagePath: "pkg-a", directory };
    assert.equal(readStageExecutionCount("graphify", target), 2);
    assert.equal(readStageExecutionCount("boundify", target), 1);
    assert.equal(readStageExecutionCount("split", target), 4);
  });

  it("returns null for a downstream stage without an artifact stem", () => {
    const root = createRoot();
    const directory = createPackage(root, "pkg-a");
    assert.equal(
      readStageExecutionCount("graphify", { root, packagePath: "pkg-a", directory }),
      null,
    );
  });

  it("reads each package independently", () => {
    const root = createRoot();
    const first = createPackage(root, "pkg-a");
    const second = createPackage(root, "pkg-b");
    writeFileSync(join(first, "RFC.md"), "# rfc\n", "utf8");
    writeFileSync(join(second, "RFC.md"), "# rfc\n", "utf8");
    writeJson(join(first, "RFC-GRAPH.json"), {});
    writeJson(join(second, "RFC-GRAPH.json"), {});
    createStageStatus(first, "RFC", "-SPLIT-Status.json", 5);
    createStageStatus(second, "RFC", "-SPLIT-Status.json", 1);
    assert.equal(readStageExecutionCount("split", { root, packagePath: "pkg-a", directory: first }), 5);
    assert.equal(readStageExecutionCount("split", { root, packagePath: "pkg-b", directory: second }), 1);
  });

  it("agrees with the shared module on the same fixture", () => {
    const root = createRoot();
    const directory = createPackage(root, "pkg-a");
    writeFileSync(join(directory, "RFC.md"), "# rfc\n", "utf8");
    writeJson(join(directory, "RFC-GRAPH.json"), {});
    createStageStatus(directory, "RFC", "-GRAPHIFY-Status.json", 7);
    assert.equal(
      readStageExecutionCount("graphify", { root, packagePath: "pkg-a", directory }),
      readGraphRuns(directory, "RFC"),
    );
  });
});

describe("decideStageRun", () => {
  it("skips at the target and runs below it", () => {
    assert.equal(decideStageRun({ count: 2, target: 2 }), "skip");
    assert.equal(decideStageRun({ count: 3, target: 2 }), "skip");
    assert.equal(decideStageRun({ count: 1, target: 2 }), "run");
  });

  it("runs when the count cannot be proved", () => {
    assert.equal(decideStageRun({ count: null, target: 1 }), "run");
  });
});
