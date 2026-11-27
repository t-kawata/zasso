// @verifies C001 — PX-460 shared workspacify-order cells
// @verifies C002 — PX-460 compact token format
// @verifies C004 — PX-460 degradation on a failed model build
//
// stage-progress.test.ts — the conver bridge to the shared workspacify-order cells.
//
// The parity test reads one fixture through both paths: the shared `readPipelineCells`
// and this module. It is the test that makes "shared, not copied" falsifiable.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createOnceReporter,
  formatStageToken,
  formatStageTokens,
  readStageTokens,
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
  type StageSource,
} from "./stage-progress.js";
import { materializeOrderWorkspace } from "../../tests/workspacify-order/helpers/order-workspace.mjs";
import { loadWorkspace } from "../../.claude/scripts/workspacify-order/lib/workspace.mjs";
import { buildModel } from "../../.claude/scripts/workspacify-order/lib/levels.mjs";
import { readPipelineCells } from "../../.claude/scripts/workspacify-order/lib/pipeline-cells.mjs";
import type { PipelineCell } from "../../.claude/scripts/workspacify-order/lib/pipeline-cells.mjs";

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function cell(overrides: Partial<PipelineCell>): PipelineCell {
  return {
    key: "wtr",
    label: "WTR",
    glyph: null,
    count: null,
    present: true,
    unknownCount: false,
    ...overrides,
  };
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function stageFixture() {
  const fixture = materializeOrderWorkspace({
    packages: ["pkg-0001", "pkg-0002"],
    edges: [["pkg-0002", "pkg-0001"]],
    levels: [["pkg-0001"], ["pkg-0002"]],
    documents: { explained: ["pkg-0001"], grilled: ["pkg-0001"] },
    counters: { "pkg-0001": { grillGeneration: 2, distributionGeneration: 3 } },
    rootCounters: { educe: 4, smooth: 5 },
  });
  const source: StageSource = {
    root: fixture.root,
    packages: ["pkg-0001", "pkg-0002"].map((id) => ({ path: fixture.pathOf.get(id)! })),
  };
  return { fixture, source };
}

describe("formatStageToken", () => {
  it("C002 renders ten comma-separated tokens in FIELD_SEQUENCE order", () => {
    const cells = [
      cell({ key: "wtr", label: "WTR" }),
      cell({ key: "wal", label: "WAL" }),
      cell({ key: "edu", label: "EDU", count: 12 }),
      cell({ key: "exp", label: "EXP" }),
      cell({ key: "gri", label: "GRI", count: 2 }),
      cell({ key: "seq", label: "SEQ", count: 2 }),
      cell({ key: "smo", label: "SMO", count: 156 }),
      cell({ key: "gra", label: "GRA", count: 2 }),
      cell({ key: "bou", label: "BOU", count: 2 }),
      cell({ key: "spl", label: "SPL", count: 4 }),
    ];
    assert.deepEqual(formatStageTokens(cells), [
      "W", "W", "E12", "E", "G2", "S2", "S156", "G2", "B2", "S4",
    ]);
    assert.equal(`[${formatStageTokens(cells).join(",")}]`, "[W,W,E12,E,G2,S2,S156,G2,B2,S4]");
  });

  it("C002 boundary: an absent field is - and an unknown count is ?", () => {
    assert.equal(formatStageToken(cell({ key: "spl", label: "SPL", present: false })), "-");
    assert.equal(formatStageToken(cell({ key: "seq", label: "SEQ", unknownCount: true })), "S?");
    assert.equal(formatStageToken(cell({ key: "gra", label: "GRA", count: 12 })), "G12");
    assert.equal(formatStageToken(cell({ key: "exp", label: "EXP" })), "E");
  });
});

describe("readStageTokens", () => {
  it("C001 every token equals the shared workspacify-order cell", (t) => {
    const { fixture, source } = stageFixture();
    t.after(() => fixture.remove());

    const loaded = loadWorkspace(fixture.root);
    const model = buildModel({
      root: loaded.root,
      treeManifest: loaded.treeManifest,
      allocateManifest: loaded.allocateManifest,
    });
    const sharedCells = readPipelineCells(model, "pkg-0001");
    const tokens = readStageTokens(source);

    assert.deepEqual(tokens.get(fixture.pathOf.get("pkg-0001")!), formatStageTokens(sharedCells));
    assert.equal(tokens.get(fixture.pathOf.get("pkg-0001")!)!.length, 10);

    // The counts are the same execution counts workspacify-order prints after ":".
    const byKey = new Map(sharedCells.map((sharedCell) => [sharedCell.key, sharedCell]));
    assert.equal(byKey.get("edu")!.count, 4);
    assert.equal(byKey.get("smo")!.count, 5);
    assert.equal(byKey.get("gri")!.count, 2);
    assert.equal(byKey.get("seq")!.count, 3);
    assert.equal(byKey.get("exp")!.present, true);
  });

  it("C001 maps a package by path, not by display name", (t) => {
    const { fixture } = stageFixture();
    t.after(() => fixture.remove());
    const path = fixture.pathOf.get("pkg-0001")!;
    const anonymous: StageSource = {
      root: fixture.root,
      packages: [{ path }, { path: "crates/not-there" }],
    };
    const tokens = readStageTokens(anonymous);
    assert.ok(tokens.has(path));
    assert.equal(tokens.has("crates/not-there"), false);
  });

  it("C004 a missing model yields no tokens, one report and no throw", () => {
    const reports: string[] = [];
    const source: StageSource = { root: "/definitely/not/a/workspace", packages: [{ path: "a" }] };
    const tokens = readStageTokens(source, (message) => reports.push(message));
    assert.equal(tokens.size, 0);
    assert.equal(reports.length, 1);
  });

  it("C004 the once reporter forwards only the first failure", () => {
    const reports: string[] = [];
    const report = createOnceReporter((message) => reports.push(message));
    report("first");
    report("second");
    assert.deepEqual(reports, ["first"]);
  });
});
