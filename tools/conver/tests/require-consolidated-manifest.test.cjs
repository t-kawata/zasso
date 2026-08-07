#!/usr/bin/env node
/**
 * require-consolidated-manifest.test.cjs — PX-148 pre-flight manifest gate.
 *
 * Covers contracts C001-C004 of ticket PX-148 (see specs/PX-148.md):
 *   C001 no CONSOLIDATED-MANIFEST-*.json + 0 stubs -> exit 0 with a skip-Step-1 stdout instruction
 *   C002 no manifest + 1+ stubs -> exit 2 with a stderr BLOCKED cause/action
 *   C003 a CONSOLIDATED-MANIFEST-*.json exists -> exit 0 (legacy unchanged)
 *   C004 a throwing stub scan is never treated as 0 stubs -> decision 'block' (exit 2)
 * [::TICKET::] PX-148 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-148 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REQUIRE = path.resolve(__dirname, "../.claude/scripts/tickets/require-consolidated-manifest.js");
const FIND_OMISSIONS = path.resolve(__dirname, "../.claude/commands/find-omissions.md");
const { findConsolidatedManifest, decideGate } = require("../.claude/scripts/tickets/require-consolidated-manifest.js");

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rcm-test-"));
}

function writeManifest(dir, name = "CONSOLIDATED-MANIFEST-20260101000000.json") {
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests", name), "[]");
}

function writeStubFile(dir) {
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a.js"), "// [::STUB::] P0-1: reason -- Implement\n");
}

function runGate(dir) {
  try {
    const stdout = execFileSync("node", [REQUIRE], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status || 1, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

function exitStatus(dir) {
  return runGate(dir).status;
}

// @verifies C003 (PX-148 contract)
test("C003: exits 0 when a consolidated manifest exists", () => {
  const dir = makeWorkspace();
  writeManifest(dir);
  assert.strictEqual(exitStatus(dir), 0, "manifest present → exit 0");
});

// @verifies C002 (PX-148 contract)
test("C002: exits 2 with a stderr cause/action when no manifest exists and stubs are present", () => {
  const dir = makeWorkspace();
  writeStubFile(dir);
  const res = runGate(dir);
  assert.strictEqual(res.status, 2, "no manifest + stub present → exit 2");
  assert.ok(res.stderr.includes("[find-omissions] BLOCKED:"), "stderr carries the BLOCKED prefix");
  assert.ok(res.stderr.includes("run /consolidate-stubs first"), "stderr carries the action directive");
});

// @verifies C002 (PX-148 contract)
test("C002: only CONSOLIDATED-MANIFEST-*.json counts — a ROLLBACK alone does not satisfy", () => {
  const dir = makeWorkspace();
  fs.mkdirSync(path.join(dir, "manifests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "manifests/ROLLBACK-20260101000000.json"), "[]");
  writeStubFile(dir);
  assert.strictEqual(exitStatus(dir), 2, "ROLLBACK alone must not satisfy the prerequisite");
});

// @verifies C001 (PX-148 contract)
test("C001: exits 0 with a skip-Step-1 stdout instruction when no manifest exists and 0 stubs are present", () => {
  const dir = makeWorkspace();
  const res = runGate(dir);
  assert.strictEqual(res.status, 0, "no manifest + 0 stubs → exit 0");
  assert.ok(res.stdout.includes("SKIP Step 1"), "stdout instructs to skip Step 1");
  assert.ok(res.stdout.includes("Proceed to Step 2"), "stdout instructs to proceed to Step 2");
});

// @verifies C004 (PX-148 contract)
test("C004: a throwing stub scan is never treated as 0 stubs — decision is 'block'", () => {
  const dir = makeWorkspace();
  const throwingScan = () => {
    throw new Error("scan failed");
  };
  assert.strictEqual(decideGate(dir, throwingScan), "block", "a failed scan never yields a 0-stub PASS");
});

// @verifies C001-C002 invariant (PX-148 contract)
test("C001/C002 invariant: the gate never exits 0 while un-consolidated stubs exist", () => {
  const dir = makeWorkspace();
  writeStubFile(dir);
  assert.strictEqual(decideGate(dir), "block", "stub present, no manifest → block");
  writeManifest(dir);
  assert.strictEqual(decideGate(dir), "pass-manifest", "manifest present → pass-manifest");
});

// @verifies C003-C004 invariant (PX-148 contract)
test("C003/C004 invariant: the gate decision is deterministic for identical tree state", () => {
  const dirA = makeWorkspace();
  const dirB = makeWorkspace();
  assert.strictEqual(decideGate(dirA), decideGate(dirB), "same empty tree → same decision");
});

// @verifies C001 (PX-148 contract)
test("C001: the pre-flight block in find-omissions.md carries both gates in order", () => {
  const doc = fs.readFileSync(FIND_OMISSIONS, "utf8");
  const preflight = doc.split("## Pre-flight")[1].split("## Overview")[0] || "";
  const gate1 = preflight.indexOf('validate-graph-arg.js "$ARGUMENTS" || exit 2');
  const gate2 = preflight.indexOf("require-consolidated-manifest.js || exit 2");
  assert.ok(gate1 !== -1, "validate-graph-arg gate present");
  assert.ok(gate2 !== -1, "require-consolidated-manifest gate present");
  assert.ok(gate1 < gate2, "validate-graph-arg runs before the manifest gate");
});

// @verifies C003 (PX-148 contract)
test("C003: findConsolidatedManifest returns the manifest path, null when absent", () => {
  const dir = makeWorkspace();
  assert.strictEqual(findConsolidatedManifest(dir), null, "no manifests/ → null");
  writeManifest(dir);
  assert.ok(
    findConsolidatedManifest(dir).endsWith("CONSOLIDATED-MANIFEST-20260101000000.json"),
    "returns the matching manifest path"
  );
});

// @verifies C003 (PX-148 contract)
test("C003: when multiple manifests exist the newest is selected", () => {
  const dir = makeWorkspace();
  writeManifest(dir, "CONSOLIDATED-MANIFEST-20260101000000.json");
  writeManifest(dir, "CONSOLIDATED-MANIFEST-20260102000000.json");
  assert.ok(
    findConsolidatedManifest(dir).endsWith("CONSOLIDATED-MANIFEST-20260102000000.json"),
    "the newest manifest is selected (matches the gate's ls -t | head -1)"
  );
});
