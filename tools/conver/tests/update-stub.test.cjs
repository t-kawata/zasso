/**
 * update-stub.test.js — PX-130 behavior-guarantee suite.
 *
 * Covers contracts C001..C010 of ticket PX-130 (see specs/PX-130.md):
 *   C001 marker edit at the file:line anchor
 *   C002 key validation (completed-key re-pointing allowed; MUST RESOLVE / PX / non-existent rejected)
 *   C003 resolve-plan validation (terminal excuses rejected)
 *   C004 surgical edit (only the target marker line changes)
 *   C005 true-duplicate removal (survivor enumerates covered lines)
 *   C006 unit key normalization (one key per unit)
 *   C007 handoff manifest emission (PX-129 grouped format)
 *   C008 no ticket creation (Tickets.json untouched)
 *   C009 post-consolidation no-excuse gate
 *   C010 idempotency
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  updateStub,
  mergeTrueDuplicates,
  normalizeUnitKey,
  emitHandoffManifest,
  parseCliArgs,
} = require("../.claude/scripts/tickets/update-stub.js");
const { classifyVerdict } = require("../.claude/scripts/tickets/validate-no-external-excuses.js");

const FIXTURES = path.join(__dirname, "fixtures");
const SRC_FIXTURES = path.join(FIXTURES, "src");
const MINI_TICKETS = path.join(FIXTURES, "mini-tickets.json");

/** Create an isolated workspace: temp dir + Tickets.json + src/ fixtures. */
function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "update-stub-test-"));
  fs.cpSync(SRC_FIXTURES, path.join(dir, "src"), { recursive: true });
  const ticketsPath = path.join(dir, "Tickets.json");
  fs.copyFileSync(MINI_TICKETS, ticketsPath);
  return { dir, ticketsPath, srcA: path.join(dir, "src/a.rs") };
}

/** Read a 1-indexed line from a file, or null when out of range. */
function readLine(absFile, line) {
  const lines = fs.readFileSync(absFile, "utf8").split("\n");
  return lines[line - 1] === undefined ? null : lines[line - 1];
}

// ---------------------------------------------------------------------------
// C001 — marker edit at the file:line anchor
// ---------------------------------------------------------------------------

// @verifies C001 (PX-130 contract)
describe("C001 marker edit at anchor", function () {
  it("rewrites the marker line at file:line to the new key/reason/plan", () => {
    const ws = makeWorkspace();
    const res = updateStub({
      file: ws.srcA,
      line: 5,
      resolveByTicket: "P4-2",
      stubReason: "reason two",
      resolvePlan: "Implement the codec",
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.error));
    assert.ok(readLine(ws.srcA, 5).includes("// [::STUB::] P4-2: reason two -- Implement the codec"));
  });
});

// ---------------------------------------------------------------------------
// C002 — key validation
// ---------------------------------------------------------------------------

// @verifies C002 (PX-130 contract)
describe("C002 key validation", function () {
  it("accepts a COMPLETED ticket key (find-omissions handoff)", () => {
    const ws = makeWorkspace();
    const res = updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P4-2", ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.success, true, "P4-2 is reviewed (completed) and must be allowed");
  });

  it("rejects a non-existent key", () => {
    const ws = makeWorkspace();
    const res = updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P9-99", ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.success, false);
  });

  it("rejects a PX-* key", () => {
    const ws = makeWorkspace();
    const res = updateStub({ file: ws.srcA, line: 5, resolveByTicket: "PX-5", ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.success, false);
  });

  it("rejects an explicit MUST RESOLVE key", () => {
    const ws = makeWorkspace();
    const res = updateStub({ file: ws.srcA, line: 5, resolveByTicket: "MUST RESOLVE", ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.success, false);
  });
});

// ---------------------------------------------------------------------------
// C003 — resolve-plan validation
// ---------------------------------------------------------------------------

// @verifies C003 (PX-130 contract)
describe("C003 resolve-plan validation", function () {
  it("rejects a terminal-excuse plan", () => {
    const ws = makeWorkspace();
    const res = updateStub({
      file: ws.srcA,
      line: 5,
      resolveByTicket: "P4-2",
      resolvePlan: "awaiting approval",
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.success, false);
  });

  it("accepts an AI-executable work item", () => {
    const ws = makeWorkspace();
    const res = updateStub({
      file: ws.srcA,
      line: 5,
      resolveByTicket: "P4-2",
      resolvePlan: "Vendor and build PJSIP in build.rs",
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.success, true);
  });
});

// ---------------------------------------------------------------------------
// C004 — surgical edit
// ---------------------------------------------------------------------------

// @verifies C004 (PX-130 contract)
describe("C004 surgical edit", function () {
  it("changes only the target marker line; no lines added or removed", () => {
    const ws = makeWorkspace();
    const before = fs.readFileSync(ws.srcA, "utf8");
    updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P4-2", stubReason: "r", resolvePlan: "p", ticketsPath: ws.ticketsPath });
    const after = fs.readFileSync(ws.srcA, "utf8");
    assert.strictEqual(after.split("\n").length, before.split("\n").length, "line count unchanged");
    assert.strictEqual(after.split("\n")[4], "    // [::STUB::] P4-2: r -- p", "only line 5 changed");
  });

  it("refuses a line that is not a [::STUB::] marker", () => {
    const ws = makeWorkspace();
    const res = updateStub({ file: ws.srcA, line: 1, resolveByTicket: "P4-2", ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.success, false, "non-marker line must be refused");
  });
});

// ---------------------------------------------------------------------------
// C005 — true-duplicate removal
// ---------------------------------------------------------------------------

// @verifies C005 (PX-130 contract)
describe("C005 true-duplicate removal", function () {
  it("merges same-defect same-region markers; survivor enumerates covered lines", () => {
    const merged = mergeTrueDuplicates([
      { file: "build.rs", line: 8, content: "// [::STUB::] P4-2: bindgen disabled -- Enable bindgen" },
      { file: "build.rs", line: 11, content: "// [::STUB::] P4-2: bindgen disabled -- Enable pjsua-native" },
    ]);
    assert.strictEqual(merged.kept.length, 1, "same-defect pair merges to one survivor");
    assert.ok(merged.kept[0].content.includes("build.rs:8,11"), "survivor enumerates the covered lines");
    assert.strictEqual(merged.removed.length, 1);
  });

  it("never merges markers in different files or with different defects", () => {
    const distinct = mergeTrueDuplicates([
      { file: "a.rs", line: 5, content: "// [::STUB::] P4-2: one -- one" },
      { file: "b.rs", line: 9, content: "// [::STUB::] P4-2: two -- two" },
    ]);
    assert.strictEqual(distinct.kept.length, 2, "different files never merge");
    assert.strictEqual(distinct.removed.length, 0);
  });
});

// ---------------------------------------------------------------------------
// C006 — unit key normalization
// ---------------------------------------------------------------------------

// @verifies C006 (PX-130 contract)
describe("C006 unit key normalization", function () {
  it("gives every marker in a unit exactly one resolve key", () => {
    const unit = {
      markers: [
        { file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: one -- one", resolveByTicket: "P4-2" },
        { file: "src/multi.rs", line: 23, content: "// [::STUB::] P4-2: two -- two", resolveByTicket: "P3-2" },
      ],
    };
    const normalized = normalizeUnitKey(unit);
    const keys = new Set(normalized.markers.map((m) => m.resolveByTicket));
    assert.strictEqual(keys.size, 1, "one key per unit");
  });
});

// ---------------------------------------------------------------------------
// C007 — handoff manifest emission
// ---------------------------------------------------------------------------

// @verifies C007 (PX-130 contract)
describe("C007 handoff manifest", function () {
  it("emits one {sourceKey, stubs:[{file,line,content}]} entry per unit", () => {
    const units = [
      {
        markers: [
          { file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: one -- one", resolveByTicket: "P4-2" },
          { file: "src/multi.rs", line: 23, content: "// [::STUB::] P4-2: two -- two", resolveByTicket: "P4-2" },
        ],
      },
      {
        markers: [
          { file: "src/p3.rs", line: 7, content: "// [::STUB::] P3-2: three -- three", resolveByTicket: "P3-2" },
        ],
      },
    ];
    const manifest = emitHandoffManifest(units);
    assert.strictEqual(manifest.length, 2, "one entry per unit");
    for (const entry of manifest) {
      assert.ok(entry.sourceKey, "each entry has a sourceKey");
      assert.ok(Array.isArray(entry.stubs) && entry.stubs.length > 0, "each entry has stubs");
      for (const stub of entry.stubs) {
        assert.ok(stub.file && stub.line && stub.content.includes("[::STUB::]"), "stub shape is {file,line,content}");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// C008 — no ticket creation
// ---------------------------------------------------------------------------

// @verifies C008 (PX-130 contract)
describe("C008 no ticket creation", function () {
  it("updateStub never writes Tickets.json", () => {
    const ws = makeWorkspace();
    const before = fs.readFileSync(ws.ticketsPath, "utf8");
    updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P4-2", ticketsPath: ws.ticketsPath });
    const after = fs.readFileSync(ws.ticketsPath, "utf8");
    assert.strictEqual(after, before, "Tickets.json untouched");
  });
});

// ---------------------------------------------------------------------------
// C009 — post-consolidation no-excuse gate
// ---------------------------------------------------------------------------

// @verifies C009 (PX-130 contract)
describe("C009 no-excuse gate", function () {
  it("an edited marker with an executable plan has zero terminal excuses", () => {
    const ws = makeWorkspace();
    updateStub({
      file: ws.srcA,
      line: 5,
      resolveByTicket: "P4-2",
      resolvePlan: "Vendor and build PJSIP in build.rs",
      ticketsPath: ws.ticketsPath,
    });
    const verdict = classifyVerdict(readLine(ws.srcA, 5), JSON.parse(fs.readFileSync(ws.ticketsPath, "utf8")));
    const checkA = verdict.checks.find((c) => c.check === "A");
    const checkB = verdict.checks.find((c) => c.check === "B");
    assert.strictEqual(checkA.passed, true, "no terminal-excuse phrase survives");
    assert.strictEqual(checkB.passed, true, "resolution plan keeps an imperative work-item verb");
  });
});

// ---------------------------------------------------------------------------
// C001/C002 — [::UNIT::] tag embedding and preservation
// ---------------------------------------------------------------------------

// @verifies C001 (PX-131 contract)
describe("C001 unit-id embedding", function () {
  it("embeds [::UNIT::U1::] after the reason when --unit-id is provided", () => {
    const ws = makeWorkspace();
    const res = updateStub({
      file: ws.srcA,
      line: 5,
      resolveByTicket: "P4-2",
      stubReason: "codec deferred",
      resolvePlan: "Implement pjsua codec enumeration",
      unitId: "U1",
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.error));
    assert.ok(readLine(ws.srcA, 5).includes("[::UNIT::U1::]"), "unit tag embedded after the reason");
  });
});

// @verifies C002 (PX-131 contract)
describe("C002 unit tag preservation", function () {
  it("re-pointing without --unit-id preserves an existing unit tag", () => {
    const ws = makeWorkspace();
    updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P4-2", unitId: "U1", ticketsPath: ws.ticketsPath });
    updateStub({ file: ws.srcA, line: 5, resolveByTicket: "P4-2", ticketsPath: ws.ticketsPath });
    assert.ok(readLine(ws.srcA, 5).includes("[::UNIT::U1::]"), "tag survives re-point");
  });
});

// ---------------------------------------------------------------------------
// CLI surface — Tickets.json is always ./Tickets.json
// ---------------------------------------------------------------------------

describe("CLI surface", function () {
  it("parseCliArgs rejects --tickets-path (Tickets.json is always the cwd file)", () => {
    const args = parseCliArgs(["--file=a.rs", "--line=5", "--resolve-by-ticket=P4-2", "--tickets-path=Tickets.json"]);
    assert.ok(args.error, "--tickets-path must be rejected");
  });

  it("parseCliArgs accepts the supported flags", () => {
    const args = parseCliArgs(["--file=a.rs", "--line=5", "--resolve-by-ticket=P4-2", "--stub-reason=r", "--resolve-plan=p"]);
    assert.strictEqual(args.error, undefined);
    assert.strictEqual(args.file, "a.rs");
    assert.strictEqual(args.line, 5);
    assert.strictEqual(args.resolveByTicket, "P4-2");
  });
});

// ---------------------------------------------------------------------------
// C010 — idempotency
// ---------------------------------------------------------------------------

// @verifies C010 (PX-130 contract)
describe("C010 idempotency", function () {
  it("re-applying the same update produces no further change", () => {
    const ws = makeWorkspace();
    const args = { file: ws.srcA, line: 5, resolveByTicket: "P4-2", stubReason: "r", resolvePlan: "p", ticketsPath: ws.ticketsPath };
    updateStub(args);
    const before = fs.readFileSync(ws.srcA, "utf8");
    updateStub(args);
    const after = fs.readFileSync(ws.srcA, "utf8");
    assert.strictEqual(before, after, "second run makes no changes");
  });
});
