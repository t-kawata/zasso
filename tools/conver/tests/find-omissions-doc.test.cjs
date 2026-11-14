/**
 * find-omissions-doc.test.cjs — P27-1.
 *
 * The command document is the AI's only procedure. These assertions keep it
 * consuming the mechanical detector instead of re-deriving "incomplete" by
 * judgment, and keep the documented flags accepted by the script.
 *
 * [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DOC_PATH = path.resolve(__dirname, "../.claude/commands/find-omissions.md");
const SCRIPT_PATH = path.resolve(
  __dirname,
  "../.claude/scripts/tickets/detect-unfinished-find.js",
);
const doc = fs.readFileSync(DOC_PATH, "utf8");
const script = fs.readFileSync(SCRIPT_PATH, "utf8");

const preflight = doc.split("## Pre-flight")[1]?.split("## Overview")[0] ?? "";

test("C002: pre-flight is one wrapper invocation with a MODE verdict", () => {
  assert.ok(
    preflight.includes("find-omissions-preflight.sh"),
    "the one-shot wrapper is the gate",
  );
  assert.ok(/MODE: RESUME/.test(doc), "RESUME mode is named");
  assert.ok(/MODE: CLEAN/.test(doc), "CLEAN mode is named");
  assert.ok(/exit2|exit 2/.test(doc), "the stop code is documented");
  assert.ok(!/DETECT=\$\?/.test(preflight), "the AI no longer writes the control flow");
});

test("C002: pre-flight runs the unfinished-find detector inside the wrapper", () => {
  assert.ok(
    preflight.includes("detect-unfinished-find.js"),
    "the detector is explained as part of the wrapper",
  );
});

test("C002: resume mode resets the stale queue and forbids asking the human", () => {
  assert.ok(/--reset/.test(doc), "the reset flag is documented");
  assert.ok(
    /Do not ask the human|never ask|without asking/i.test(doc),
    "the procedure forbids delegating the decision",
  );
});

test("C002: the documented flags exist in the detector", () => {
  assert.ok(script.includes("--reset"), "--reset is accepted");
  assert.ok(script.includes("--format"), "--format is accepted");
});

test("C003: the argument note names the first non-empty line as the graph path", () => {
  assert.ok(
    /first non-empty line/i.test(doc),
    "a resume directive after the graph path is explained",
  );
});
