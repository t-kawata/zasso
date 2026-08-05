#!/usr/bin/env node
/**
 * clean-consolidation-artifacts.test.cjs — PX-138 transient artifact cleanup.
 *
 * Covers contract C002 of ticket PX-138 (see specs/PX-138.md):
 *   C002 on FULL find-omissions success clean-consolidation-artifacts.js removes
 *       manifests/CONSOLIDATED-MANIFEST-*.json and manifests/ROLLBACK-*.json,
 *       removes manifests/ itself iff empty, is idempotent (exit 0 when nothing
 *       to remove), and never touches other files.
 * [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CLEAN = path.resolve(__dirname, "../.claude/scripts/tickets/clean-consolidation-artifacts.js");
const {
  cleanConsolidationArtifacts,
  listArtifactsToRemove,
} = require("../.claude/scripts/tickets/clean-consolidation-artifacts.js");

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cca-test-"));
}

function writeArtifacts(dir) {
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests/CONSOLIDATED-MANIFEST-20260101000000.json"), "[]");
  fs.writeFileSync(path.join(dir, "manifests/ROLLBACK-20260101000000.json"), "[]");
}

function cleanStatus(dir) {
  try {
    execFileSync("node", [CLEAN], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

// @verifies C002 (PX-138 contract)
test("C002: removes both artifact globs and the empty manifests/ dir", () => {
  const dir = makeWorkspace();
  writeArtifacts(dir);
  assert.strictEqual(cleanStatus(dir), 0, "exit 0");
  assert.ok(!fs.existsSync(path.join(dir, "manifests/CONSOLIDATED-MANIFEST-20260101000000.json")), "manifest removed");
  assert.ok(!fs.existsSync(path.join(dir, "manifests/ROLLBACK-20260101000000.json")), "rollback removed");
  assert.ok(!fs.existsSync(path.join(dir, "manifests")), "manifests/ removed when empty");
});

// @verifies C002 (PX-138 contract)
test("C002: idempotent — exit 0 when nothing to remove", () => {
  const dir = makeWorkspace();
  assert.strictEqual(cleanStatus(dir), 0, "no manifests/ → exit 0");
  writeArtifacts(dir);
  assert.strictEqual(cleanStatus(dir), 0, "first run exits 0");
  assert.strictEqual(cleanStatus(dir), 0, "second run exits 0 (idempotent)");
});

// @verifies C002 (PX-138 contract)
test("C002: leaves non-artifact files untouched and keeps the dir when non-empty", () => {
  const dir = makeWorkspace();
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests/keep.json"), "{}");
  fs.writeFileSync(path.join(dir, "manifests/CONSOLIDATED-MANIFEST-20260101000000.json"), "[]");
  assert.strictEqual(cleanStatus(dir), 0, "exit 0");
  assert.ok(fs.existsSync(path.join(dir, "manifests/keep.json")), "non-artifact file untouched");
  assert.ok(fs.existsSync(path.join(dir, "manifests")), "dir kept when non-empty");
});

// @verifies C002 (PX-138 contract)
test("C002: exact glob match — files without the -<ts> suffix are not removed", () => {
  const dir = makeWorkspace();
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests/CONSOLIDATED-MANIFEST.json"), "{}");
  fs.writeFileSync(path.join(dir, "manifests/ROLLBACK.json"), "{}");
  assert.strictEqual(cleanStatus(dir), 0, "exit 0");
  assert.ok(fs.existsSync(path.join(dir, "manifests/CONSOLIDATED-MANIFEST.json")), "no-suffix manifest kept");
  assert.ok(fs.existsSync(path.join(dir, "manifests/ROLLBACK.json")), "no-suffix rollback kept");
});

// @verifies C002 (PX-138 contract)
test("C002: listArtifactsToRemove returns only the two artifact globs", () => {
  const dir = makeWorkspace();
  writeArtifacts(dir);
  fs.writeFileSync(path.join(dir, "manifests/keep.json"), "{}");
  assert.strictEqual(listArtifactsToRemove(dir).length, 2, "only the two artifact files");
});

// @verifies C002 (PX-138 contract)
test("C002: cleanConsolidationArtifacts reports removed files and dir removal", () => {
  const dir = makeWorkspace();
  writeArtifacts(dir);
  const res = cleanConsolidationArtifacts(dir);
  assert.strictEqual(res.ok, true, JSON.stringify(res.error));
  assert.strictEqual(res.removed.length, 2, "two artifacts removed");
  assert.strictEqual(res.removedDir, true, "manifests/ removed");
});
