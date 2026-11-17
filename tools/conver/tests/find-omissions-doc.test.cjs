// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
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
  assert.ok(!/DETECT=\$\?/.test(preflight), "the AI no longer writes the control flow");
});

test("C002: the v3 command exposes exit 0 and 10, never a project-condition stop", () => {
  assert.ok(/find-omissions-run\.js/.test(doc), "the non-interactive full flow is named");
  assert.ok(/exit 10|exit code 10|10 —/.test(doc), "the work code is documented");
  assert.ok(/exit 0|exit code 0|0 —/.test(doc), "the complete code is documented");
  assert.ok(/remainder = 0/.test(doc), "the terminal condition is the measured remainder");
  assert.ok(/no project-condition stop|never stops|no blocker-stop/i.test(doc), "a blocker is work, never a stop");
});

test("C002: the v3 command preserves existing tickets and names the repair ladder", () => {
  assert.ok(/Step 0\.1/.test(doc), "Step 0.1 inventory is documented");
  assert.ok(/Step 0\.5/.test(doc), "Step 0.5 gate is documented");
  assert.ok(/completed tickets? (?:are|is) not reopened|never reopened/i.test(doc), "completed tickets are not reopened");
  assert.ok(/repair ladder|repair ticket/i.test(doc), "blockers route to the repair ladder");
});

test("C002: the v3 command is language-neutral and carries no evidence-project names", () => {
  assert.equal(/\bgaia\b|\bcrystal\b|\bdoors\b/.test(doc), false);
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

test("C006: the command takes no graph argument and resolves the package artifact", () => {
  const frontmatter = doc.split("---")[1] ?? "";
  assert.ok(!/argument-hint/.test(frontmatter), "no argument hint is declared");
  assert.ok(!/\$ARGUMENTS/.test(doc), "the command substitutes no argument");
  assert.ok(!/--graph=/.test(doc), "no graph flag is documented");
  assert.ok(/RFC-GRAPH\.json/.test(doc), "the package artifact is named");
  assert.ok(
    /find-omissions-preflight\.sh"\s*\|\|\s*exit 2/.test(doc),
    "the wrapper runs with no positional graph",
  );
  assert.ok(
    /phasify-omissions\.js"(?![^\n]*--graph=)/.test(doc),
    "Step 9 carries no graph argument",
  );
});
