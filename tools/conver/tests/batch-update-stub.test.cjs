/**
 * batch-update-stub.test.cjs — PX-132 batch consolidation + three-point verification.
 *
 * Covers contracts C001..C006 of ticket PX-132 (see specs/PX-132.md):
 *   C001 units decision file drives every marker edit (key + [::UNIT::] tag)
 *   C002 resolve key derivation (explicit wins; otherwise from the marker)
 *   C003 atomicity — a failing edit aborts the whole run with zero writes
 *   C004 completeness (漏れ) — scanned markers not in the decision file are reported
 *   C005 debris (ゴミ) — zero [::UNIT::] tags remain, format gate passes, decision file consumed
 *   C006 manifest output matches the PX-129 grouped contract
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BATCH_SCRIPT = path.resolve(".claude/scripts/tickets/batch-update-stub.js");

const { runBatchUpdate, runRollback, validateDecisionUnits, resolveMarkerLines, prepareAllEdits } = require("../.claude/scripts/tickets/batch-update-stub.js");
const { scanTaggedMarkers, scanStubs } = require("../.claude/scripts/tickets/print-manifest-for-find-omissions.js");
const { validateStubFormat } = require("../.claude/scripts/tickets/validate-stub-format.js");

const FIXTURES = path.join(__dirname, "fixtures");

/** Build an isolated workspace with 3 markers (P4-2 x2 at a.rs:4 / b.rs:5, P3-2 at c.rs:4). */
function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bus-test-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/a.rs"),
    "// a\npub fn demo() {\n    let x = 1;\n    // [::STUB::] P4-2: codec deferred -- Implement pjsua codec enumeration\n    let _ = x;\n}\n"
  );
  fs.writeFileSync(
    path.join(dir, "src/b.rs"),
    "// b\npub fn demo2() {\n    let y = 2;\n    // [::STUB::] P4-2: codec constants -- Replace with bindgen constants\n    let _ = y;\n}\n"
  );
  fs.writeFileSync(
    path.join(dir, "src/c.rs"),
    "// c\npub fn demo3() {\n    let z = 3;\n    // [::STUB::] P3-2: audio -- Implement audio worker\n    let _ = z;\n}\n"
  );
  const ticketsPath = path.join(dir, "Tickets.json");
  fs.copyFileSync(path.join(FIXTURES, "mini-tickets.json"), ticketsPath);
  return { dir, ticketsPath, srcA: path.join(dir, "src/a.rs"), srcB: path.join(dir, "src/b.rs"), srcC: path.join(dir, "src/c.rs") };
}

function readLine(absFile, line) {
  return fs.readFileSync(absFile, "utf8").split("\n")[line - 1] || null;
}

// ---------------------------------------------------------------------------
// C001 — units decision file drives every marker edit
// ---------------------------------------------------------------------------

// @verifies C001 (PX-132 contract)
describe("C001 decision-driven edits", function () {
  it("embeds the unit tag at the intermediate edit step and re-points the marker in the final state", () => {
    const ws = makeWorkspace();
    const decision = [{
      unitId: "U1",
      resolveByTicket: "P4-2",
      reason: "codec deferred",
      plan: "Implement pjsua codec enumeration",
      markerLines: ["src/a.rs:4", "src/b.rs:4"],
    }];
    // Intermediate: the prepared edit embeds [::UNIT::U1::] (stripped later by the manifest step).
    const scanned = scanStubs(ws.dir);
    const { resolved } = resolveMarkerLines(decision, scanned, ws.dir);
    const prep = prepareAllEdits(resolved, ws.ticketsPath);
    assert.strictEqual(prep.ok, true, JSON.stringify(prep.failures));
    assert.ok(prep.edits[0].newContent.includes("[::UNIT::U1::]"), "prepared edit embeds the tag");
    // Final: the batch run re-points both listed markers to the decision key.
    const res = runBatchUpdate({ decision, dir: ws.dir, ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.ok(readLine(ws.srcA, 4).includes("[::STUB::] P4-2:"), "a.rs:4 re-pointed to P4-2");
    assert.ok(readLine(ws.srcB, 4).includes("[::STUB::] P4-2:"), "b.rs:4 re-pointed to P4-2");
  });
});

// ---------------------------------------------------------------------------
// C002 — resolve key derivation
// ---------------------------------------------------------------------------

// @verifies C002 (PX-132 contract)
describe("C002 resolve key derivation", function () {
  it("explicit resolveByTicket wins", () => {
    const ws = makeWorkspace();
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, true);
    assert.ok(readLine(ws.srcA, 4).includes("[::STUB::] P4-2:"), "explicit P4-2 applied");
  });

  it("derives the key from the marker when absent", () => {
    const ws = makeWorkspace();
    const res = runBatchUpdate({
      decision: [{ unitId: "U2", markerLines: ["src/c.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.ok(/\[::STUB::\]\s+P[A-Z0-9]+-\d+/.test(readLine(ws.srcC, 4)), "key derived from the marker");
  });
});

// ---------------------------------------------------------------------------
// C004 — completeness (漏れ)
// ---------------------------------------------------------------------------

// @verifies C004 (PX-132 contract)
describe("C004 completeness", function () {
  it("reports a scanned marker absent from the decision file as unassigned", () => {
    const ws = makeWorkspace();
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.ok(res.unassigned.some((u) => u.file.includes("src/b.rs")), "b.rs must be reported unassigned");
    assert.ok(res.unassigned.some((u) => u.file.includes("src/c.rs")), "c.rs must be reported unassigned");
  });
});

// ---------------------------------------------------------------------------
// C003 — atomicity (失敗)
// ---------------------------------------------------------------------------

// @verifies C003 (PX-132 contract)
describe("C003 atomicity", function () {
  it("a bad marker key aborts the whole run with zero writes", () => {
    const ws = makeWorkspace();
    const before = fs.readFileSync(ws.srcA, "utf8");
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "PX-999", markerLines: ["src/a.rs:4", "src/b.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(fs.readFileSync(ws.srcA, "utf8"), before, "no partial edit");
    assert.ok(res.failures.some((f) => f.file.includes("src/a.rs")), "failing file:line listed");
  });
});

// ---------------------------------------------------------------------------
// C005 — debris (ゴミ)
// ---------------------------------------------------------------------------

// @verifies C005 (PX-132 contract)
describe("C005 debris", function () {
  it("after a successful run: zero unit tags, format valid, decision file consumed", () => {
    const ws = makeWorkspace();
    const decisionPath = path.join(ws.dir, "units.json");
    fs.writeFileSync(
      decisionPath,
      JSON.stringify([{ unitId: "U1", resolveByTicket: "P4-2", reason: "codec deferred", plan: "Implement pjsua codec enumeration", markerLines: ["src/a.rs:4", "src/b.rs:4"] }])
    );
    const res = runBatchUpdate({ decisionPath, dir: ws.dir, ticketsPath: ws.ticketsPath });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.strictEqual(scanTaggedMarkers(ws.dir).length, 0, "zero unit tags remain");
    assert.ok(validateStubFormat(readLine(ws.srcA, 4)).valid, "format gate passes");
    assert.ok(!fs.existsSync(decisionPath), "decision file consumed");
  });
});

// ---------------------------------------------------------------------------
// Strict decision-file validation (schema + atomicity on malformed input)
// ---------------------------------------------------------------------------

describe("validateDecisionUnits (strict schema)", function () {
  it("rejects missing/duplicate unitId, empty markerLines, invalid refs, cross-unit duplicates, non-object entries", () => {
    const problems = validateDecisionUnits([
      { unitId: "U1", markerLines: ["src/a.rs:4"] },
      { unitId: "U1", markerLines: ["src/b.rs:4"] }, // duplicate unitId
      { unitId: "U2", markerLines: [] },             // empty markerLines
      { unitId: "U3", markerLines: ["not-a-ref"] },  // invalid ref
      { unitId: "U4", markerLines: ["src/a.rs:4"] }, // cross-unit duplicate ref
      null,                                          // non-object
      { markerLines: ["src/c.rs:4"] },               // missing unitId
    ]);
    const texts = problems.map((p) => p.problem).join(" | ");
    assert.ok(texts.includes("unitId"), "missing/duplicate unitId");
    assert.ok(texts.includes("markerLines"), "empty markerLines");
    assert.ok(texts.includes("not a valid file:line"), "invalid ref");
    assert.ok(texts.includes("more than one unit"), "cross-unit duplicate");
    assert.ok(texts.includes("not an object"), "non-object entry");
  });

  it("a malformed decision aborts with zero writes", () => {
    const ws = makeWorkspace();
    const before = fs.readFileSync(ws.srcA, "utf8");
    const res = runBatchUpdate({
      decision: [{ markerLines: ["src/a.rs:4"] }], // missing unitId
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, false);
    assert.ok(res.problems.length > 0, "problems reported");
    assert.strictEqual(fs.readFileSync(ws.srcA, "utf8"), before, "no write");
  });
});

// ---------------------------------------------------------------------------
// dry-run — verify before applying
// ---------------------------------------------------------------------------

describe("dry-run", function () {
  it("returns the edit plan without writing anything", () => {
    const ws = makeWorkspace();
    const before = fs.readFileSync(ws.srcA, "utf8");
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4", "src/b.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
      dryRun: true,
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.strictEqual(res.dryRun, true);
    assert.ok(Array.isArray(res.plan) && res.plan.length === 2, "plan lists both edits");
    assert.ok(res.plan.every((e) => e.file && e.line && e.newContent), "plan entries carry file/line/newContent");
    assert.strictEqual(fs.readFileSync(ws.srcA, "utf8"), before, "no writes in dry-run");
  });
});

// ---------------------------------------------------------------------------
// rollback — precise restoration without git
// ---------------------------------------------------------------------------

describe("rollback", function () {
  it("writes a backup on apply and restores edited markers precisely", () => {
    const ws = makeWorkspace();
    const beforeA = fs.readFileSync(ws.srcA, "utf8");
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4", "src/b.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    assert.ok(fs.existsSync(res.rollbackPath), "backup file written on apply");
    const restored = runRollback({ backupPath: res.rollbackPath });
    assert.strictEqual(restored.ok, true, JSON.stringify(restored.error));
    assert.strictEqual(fs.readFileSync(ws.srcA, "utf8"), beforeA, "a.rs restored to its pre-edit content");
  });
});

// ---------------------------------------------------------------------------
// CLI surface — no [dir] argument
// ---------------------------------------------------------------------------

describe("CLI surface", function () {
  it("rejects a [dir] argument with a kind message (the target tree is always cwd)", () => {
    const ws = makeWorkspace();
    const decisionPath = path.join(ws.dir, "units.json");
    fs.writeFileSync(decisionPath, JSON.stringify([{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4"] }]));
    let stderr = "";
    try {
      execFileSync("node", [BATCH_SCRIPT, decisionPath, "extra-dir"], { cwd: ws.dir, encoding: "utf8" });
    } catch (e) {
      stderr = e.stderr || "";
    }
    assert.ok(stderr.includes("[dir] argument is not accepted"), "must explain that [dir] is not accepted");
  });
});

// ---------------------------------------------------------------------------
// C006 — manifest output matches the PX-129 contract
// ---------------------------------------------------------------------------

// @verifies C006 (PX-132 contract)
describe("C006 manifest output", function () {
  it("emits a manifest consumable by batch-create-resolving-tickets.js", () => {
    const ws = makeWorkspace();
    const res = runBatchUpdate({
      decision: [{ unitId: "U1", resolveByTicket: "P4-2", markerLines: ["src/a.rs:4", "src/b.rs:4"] }],
      dir: ws.dir,
      ticketsPath: ws.ticketsPath,
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res.error));
    const manifest = JSON.parse(fs.readFileSync(res.manifestPath, "utf8"));
    assert.ok(manifest.every((e) => e.sourceKey && Array.isArray(e.stubs)), "PX-129 contract shape");
    assert.strictEqual(manifest.length, 1, "one unit");
  });
});
