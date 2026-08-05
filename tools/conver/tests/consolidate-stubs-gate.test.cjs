#!/usr/bin/env node
/**
 * consolidate-stubs-gate.test.cjs — PX-136 single-script blocking gate for Step 5.
 *
 * Covers contracts C001..C004 of ticket PX-136 (see specs/PX-136.md):
 *   C001 the doc Step 5 gate block shows exactly one invocation, no internal commands
 *   C002 the gate exits 0 on a valid tree and 1 on a malformed marker / missing manifest
 *   C003 when more than one manifest exists the newest is validated
 *   C004 the doc description is operator-level (names failure modes, not wiring)
 * [::TICKET::] PX-136 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-136 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const GATE = path.resolve(__dirname, "../.claude/scripts/tickets/consolidate-stubs-gate.sh");
const DOC_PATH = path.resolve(__dirname, "../.claude/commands/consolidate-stubs.md");
const FIXTURES = path.resolve(__dirname, "fixtures/mini-tickets.json");

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/a.rs"),
    "// a\npub fn demo() {\n    let x = 1;\n    // [::STUB::] P4-2: codec deferred -- Implement pjsua codec enumeration\n    let _ = x;\n}\n"
  );
  fs.copyFileSync(FIXTURES, path.join(dir, "Tickets.json"));
  return dir;
}

function writeValidManifest(dir, name) {
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifests", name),
    JSON.stringify([
      { sourceKey: "P4-2", stubs: [{ file: "src/a.rs", line: 4, content: "// [::STUB::] P4-2: codec deferred -- Implement pjsua codec enumeration" }] },
    ])
  );
}

function gateStatus(dir) {
  try {
    execFileSync("bash", [GATE], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

// @verifies C001 (PX-136 contract)
test("C001: doc Step 5 shows exactly one gate invocation and leaks no internal commands", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const step5 = doc.split("### Step 5")[1] || "";
  assert.ok(step5.includes("bash .claude/scripts/tickets/consolidate-stubs-gate.sh"), "doc invokes the gate with bash");
  assert.ok(!/node .*consolidate-stubs-gate\.sh/.test(step5), "doc does not run a bash script with node");
  assert.ok(!/--for-consolidate|--no-write|validate-no-external-excuses|batch-create-resolving-tickets/.test(step5), "no internal scripts or flags in the doc");
});

// @verifies C002 (PX-136 contract)
test("C002: the gate exits 0 on a valid tree", () => {
  const ws = makeWorkspace();
  writeValidManifest(ws, "CONSOLIDATED-MANIFEST-20260101000000.json");
  const status = gateStatus(ws);
  assert.strictEqual(status, 0, "valid tree + valid manifest must pass");
});

// @verifies C002 (PX-136 contract)
test("C002: the gate exits 1 when a malformed marker exists", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(path.join(ws, "src/a.rs"), "// a\nfn a() {}\n// [::STUB::] broken\n");
  const status = gateStatus(ws);
  assert.strictEqual(status, 1, "malformed marker blocks the gate");
});

// @verifies C002 (PX-136 contract)
test("C002: the gate exits non-zero when no manifest exists", () => {
  const ws = makeWorkspace();
  const status = gateStatus(ws);
  assert.notStrictEqual(status, 0, "missing manifest blocks the gate");
});

function setMtime(file, date) {
  fs.utimesSync(file, date, date);
}

// @verifies C003 (PX-136 contract)
test("C003: when more than one manifest exists the newest is validated (no concatenated-JSON parse error)", () => {
  const ws = makeWorkspace();
  writeValidManifest(ws, "CONSOLIDATED-MANIFEST-20260101000000.json");
  writeValidManifest(ws, "CONSOLIDATED-MANIFEST-20260102000000.json");
  // Pin both mtimes so ls -t deterministically picks the filename-newest one.
  setMtime(path.join(ws, "manifests/CONSOLIDATED-MANIFEST-20260101000000.json"), new Date(2026, 0, 1));
  setMtime(path.join(ws, "manifests/CONSOLIDATED-MANIFEST-20260102000000.json"), new Date(2026, 0, 2));
  const status = gateStatus(ws);
  assert.strictEqual(status, 0, "the newest manifest is validated");
});

// @verifies C003 (PX-136 contract)
test("C003: the gate fails when the newest manifest is invalid (older valid one is not picked)", () => {
  const ws = makeWorkspace();
  writeValidManifest(ws, "CONSOLIDATED-MANIFEST-20260101000000.json"); // valid, older
  fs.mkdirSync(path.join(ws, "manifests"), { recursive: true });
  fs.writeFileSync(
    path.join(ws, "manifests/CONSOLIDATED-MANIFEST-20260102000000.json"),
    JSON.stringify([{ sourceKey: "PX-999", stubs: [] }]) // invalid, newest
  );
  setMtime(path.join(ws, "manifests/CONSOLIDATED-MANIFEST-20260101000000.json"), new Date(2026, 0, 1));
  setMtime(path.join(ws, "manifests/CONSOLIDATED-MANIFEST-20260102000000.json"), new Date(2026, 0, 2));
  const status = gateStatus(ws);
  assert.strictEqual(status, 1, "an invalid newest manifest must block the gate");
});

// @verifies C004 (PX-136 contract)
test("C004: the doc description names the failure modes at the operator level", () => {
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const step5 = doc.split("### Step 5")[1] || "";
  assert.ok(/terminal-excuse|malformed marker|non-existent key/.test(step5), "doc names what the gate fails on");
});
