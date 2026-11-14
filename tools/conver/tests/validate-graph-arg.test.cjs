/**
 * validate-graph-arg.test.cjs — P27-1.
 *
 * The tickets /find-omissions gate must read the GRAPH path from the first
 * non-empty line of $ARGUMENTS, so a resume directive can follow it. Exit-code
 * contract stays: 0 valid, 2 invalid.
 *
 * [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  validateGraphArgument,
} = require("../.claude/scripts/tickets/validate-graph-arg.js");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "graph-arg-"));
const graphPath = path.join(directory, "RFC-GRAPH.json");
fs.writeFileSync(graphPath, JSON.stringify({ nodes: [], edges: [] }), "utf8");

test("C003: a single graph path is accepted", () => {
  assert.strictEqual(validateGraphArgument([graphPath]), 0);
});

test("C003: a resume directive after the graph path does not change the verdict", () => {
  const argument =
    graphPath +
    "\n\nPrevious /find-omissions detected incomplete. Re-run it. " +
    "Do not ask the human; decide everything and complete.";
  assert.strictEqual(validateGraphArgument([argument]), 0);
});

test("C003: leading blank lines before the graph path are skipped", () => {
  assert.strictEqual(validateGraphArgument([`\n  \n${graphPath}\n\ndirective`]), 0);
});

test("C003: a directive without a graph path still fails with exit 2", () => {
  assert.strictEqual(
    validateGraphArgument(["Previous /find-omissions detected incomplete."]),
    2,
  );
});

test("C003: an empty argument still fails with exit 2", () => {
  assert.strictEqual(validateGraphArgument([]), 2);
  assert.strictEqual(validateGraphArgument([""]), 2);
});

test("C003: a missing graph file still fails with exit 2", () => {
  assert.strictEqual(validateGraphArgument([path.join(directory, "absent.json")]), 2);
});
