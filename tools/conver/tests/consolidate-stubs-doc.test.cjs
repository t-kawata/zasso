#!/usr/bin/env node
/**
 * consolidate-stubs-doc.test.cjs — PX-133 consolidate-stubs.md doc-vs-tool consistency.
 *
 * Covers contracts C001..C006 of ticket PX-133 (see specs/PX-133.md):
 *   C001 the batch-tool description no longer claims the tool runs the gates
 *   C002 every documented CLI flag is accepted by the referenced script
 *   C003 the apply ordering documents the rollback backup before the commit
 *   C004 the resolveByTicket note documents first-marker derivation + explicit-key requirement
 *   C005 the manifest handoff command targets exactly one manifest file
 *   C006 the Workflow intro no longer claims a subdirectory target
 * [::TICKET::] PX-133 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-133 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DOC_PATH = path.resolve(__dirname, "../.claude/commands/consolidate-stubs.md");
const doc = fs.readFileSync(DOC_PATH, "utf8");

const intro = doc.split("## Workflow")[1] || "";
const step3 = doc.split("### Step 3")[1] || "";
const step4 = doc.split("### Step 4")[1].split("### Step 5")[0] || "";
const step5 = doc.split("### Step 5")[1] || "";

// @verifies C001 (PX-133 contract)
test("C001: the batch-tool description no longer claims the tool runs the gates", () => {
  assert.ok(!/runs the gates/.test(step4), "batch tool does not run the gates");
  assert.ok(!/already run the gates/.test(doc), "no 'already run the gates' claim");
  assert.ok(step4.includes("merges true duplicates"), "dedup claim is kept (PX-135 makes it true)");
});

// @verifies C002 (PX-133 contract)
test("C002: documented CLI flags are accepted by the referenced scripts", () => {
  const scriptsDir = path.resolve(__dirname, "../.claude/scripts/tickets");
  const bu = fs.readFileSync(path.join(scriptsDir, "batch-update-stub.js"), "utf8");
  assert.ok(bu.includes('"--dry-run"') && bu.includes('"--rollback"'), "batch-update-stub flags");
  const vne = fs.readFileSync(path.join(scriptsDir, "validate-no-external-excuses.js"), "utf8");
  assert.ok(vne.includes("--for-consolidate") && vne.includes("--fail-on-excuse"), "validator flags");
  const bcr = fs.readFileSync(path.join(scriptsDir, "batch-create-resolving-tickets.js"), "utf8");
  assert.ok(bcr.includes('"--no-write"'), "batch-create flag");
});

// @verifies C003 (PX-133 contract)
test("C003: the apply ordering documents the rollback backup before the commit", () => {
  const rollbackIdx = step4.indexOf("rollback backup");
  const commitIdx = step4.indexOf("re-points all listed markers");
  assert.ok(rollbackIdx !== -1 && commitIdx !== -1, "both phrases are present");
  assert.ok(rollbackIdx < commitIdx, "rollback backup is written before the commit");
});

// @verifies C004 (PX-133 contract)
test("C004: resolveByTicket note documents first-marker derivation and explicit-key requirement", () => {
  assert.ok(/first marker/.test(step3), "note mentions the first marker");
  assert.ok(/MUST RESOLVE/.test(step3), "note mentions MUST RESOLVE");
  assert.ok(/PX-\*/.test(step3), "note mentions PX-*");
  const buSrc = fs.readFileSync(path.resolve(__dirname, "../.claude/scripts/tickets/batch-update-stub.js"), "utf8");
  assert.ok(/const first = unit\.markers\[0\]/.test(buSrc), "deriveResolveKey uses markers[0]");
});

// @verifies C005 (PX-133 contract)
test("C005: the manifest handoff command targets exactly one manifest file", () => {
  assert.ok(!/cat manifests\/CONSOLIDATED-MANIFEST-\*\.json/.test(step5), "no concatenating glob");
  assert.ok(/ls -t|head -1|rm .*manifest|latest|newest/.test(step5), "one manifest is pinned");
});

// @verifies C006 (PX-133 contract)
test("C006: the Workflow intro no longer claims a subdirectory target", () => {
  assert.ok(!/subdirectory passed as the argument/.test(intro), "no subdirectory claim");
  assert.ok(/current directory/.test(intro), "the target source tree is the current directory");
});
