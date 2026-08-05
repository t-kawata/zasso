#!/usr/bin/env node
/**
 * require-consolidated-manifest.test.cjs — PX-138 pre-flight manifest gate.
 *
 * Covers contract C001 of ticket PX-138 (see specs/PX-138.md):
 *   C001 the pre-flight runs require-consolidated-manifest.js — exit 0 iff a
 *       ./manifests/CONSOLIDATED-MANIFEST-*.json exists, else exit 2 with a
 *       stderr cause/action message; both gates stay present in the doc.
 * [::TICKET::] PX-138 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-138 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REQUIRE = path.resolve(__dirname, "../.claude/scripts/tickets/require-consolidated-manifest.js");
const FIND_OMISSIONS = path.resolve(__dirname, "../.claude/commands/find-omissions.md");
const { findConsolidatedManifest } = require("../.claude/scripts/tickets/require-consolidated-manifest.js");

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rcm-test-"));
}

function writeManifest(dir, name = "CONSOLIDATED-MANIFEST-20260101000000.json") {
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests", name), "[]");
}

function exitStatus(dir) {
  try {
    execFileSync("node", [REQUIRE], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return 0;
  } catch (e) {
    return e.status || 1;
  }
}

// @verifies C001 (PX-138 contract)
test("C001: exits 0 when a consolidated manifest exists", () => {
  const dir = makeWorkspace();
  writeManifest(dir);
  assert.strictEqual(exitStatus(dir), 0, "manifest present → exit 0");
});

// @verifies C001 (PX-138 contract)
test("C001: exits 2 with a stderr cause/action when no manifest exists", () => {
  const dir = makeWorkspace();
  let stderr = "";
  try {
    execFileSync("node", [REQUIRE], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.fail("expected exit 2");
  } catch (e) {
    assert.strictEqual(e.status, 2, "missing manifest → exit 2");
    stderr = e.stderr;
  }
  assert.ok(stderr.includes("[find-omissions] BLOCKED:"), "stderr carries the BLOCKED prefix");
  assert.ok(stderr.includes("run /consolidate-stubs first"), "stderr carries the action directive");
});

// @verifies C001 (PX-138 contract)
test("C001: only CONSOLIDATED-MANIFEST-*.json counts — a ROLLBACK alone does not satisfy", () => {
  const dir = makeWorkspace();
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests/ROLLBACK-20260101000000.json"), "[]");
  assert.strictEqual(exitStatus(dir), 2, "ROLLBACK alone must not satisfy the prerequisite");
});

// @verifies C001 (PX-138 contract)
test("C001: the pre-flight block in find-omissions.md carries both gates in order", () => {
  const doc = fs.readFileSync(FIND_OMISSIONS, "utf8");
  const preflight = doc.split("## Pre-flight")[1].split("## Overview")[0] || "";
  const gate1 = preflight.indexOf('validate-graph-arg.js "$ARGUMENTS" || exit 2');
  const gate2 = preflight.indexOf("require-consolidated-manifest.js || exit 2");
  assert.ok(gate1 !== -1, "validate-graph-arg gate present");
  assert.ok(gate2 !== -1, "require-consolidated-manifest gate present");
  assert.ok(gate1 < gate2, "validate-graph-arg runs before the manifest gate");
});

// @verifies C001 (PX-138 contract)
test("C001: findConsolidatedManifest returns the manifest path, null when absent", () => {
  const dir = makeWorkspace();
  assert.strictEqual(findConsolidatedManifest(dir), null, "no manifests/ → null");
  writeManifest(dir);
  assert.ok(
    findConsolidatedManifest(dir).endsWith("CONSOLIDATED-MANIFEST-20260101000000.json"),
    "returns the matching manifest path"
  );
});

// @verifies C001 (PX-138 contract)
test("C001: when multiple manifests exist the newest is selected", () => {
  const dir = makeWorkspace();
  writeManifest(dir, "CONSOLIDATED-MANIFEST-20260101000000.json");
  writeManifest(dir, "CONSOLIDATED-MANIFEST-20260102000000.json");
  assert.ok(
    findConsolidatedManifest(dir).endsWith("CONSOLIDATED-MANIFEST-20260102000000.json"),
    "the newest manifest is selected (matches the gate's ls -t | head -1)"
  );
});
