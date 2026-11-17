// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
/**
 * validate-graph-arg.test.cjs — PX-439.
 *
 * The graph is a package-local artifact. The gate resolves it from the current
 * directory and never from the argument, so an explicit path cannot override
 * the package and a stale caller's path cannot block a resolvable package.
 * Exit-code contract stays: 0 valid, 2 unresolvable.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  validateGraphArgument,
} = require("../.claude/scripts/tickets/validate-graph-arg.js");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "graph-arg-"));
}

function writeGraph(directory, name) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, JSON.stringify({ nodes: [], edges: [] }), "utf8");
  return file;
}

/** Capture the gate's diagnostic so a failure must name its reason. */
function captureErrors(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try {
    return { status: run(), message: lines.join("\n") };
  } finally {
    console.error = original;
  }
}

test("C001: a package with RFC-GRAPH.json passes with no argument", () => {
  const directory = makeDirectory();
  writeGraph(directory, "RFC-GRAPH.json");

  assert.strictEqual(validateGraphArgument([], { cwd: directory }), 0);
});

test("C001: a package with a unique *-GRAPH.json passes with no argument", () => {
  const directory = makeDirectory();
  writeGraph(directory, "RFC-ROOT-GRAPH.json");

  assert.strictEqual(validateGraphArgument([], { cwd: directory }), 0);
});

test("C002: a package with no graph fails with exit 2 and names MISSING", () => {
  const directory = makeDirectory();

  const result = captureErrors(() =>
    validateGraphArgument([], { cwd: directory }),
  );

  assert.strictEqual(result.status, 2);
  assert.match(result.message, /MISSING/);
});

test("C002: a package with two graphs fails with exit 2 and names both", () => {
  const directory = makeDirectory();
  writeGraph(directory, "A-GRAPH.json");
  writeGraph(directory, "B-GRAPH.json");

  const result = captureErrors(() =>
    validateGraphArgument([], { cwd: directory }),
  );

  assert.strictEqual(result.status, 2);
  assert.match(result.message, /AMBIGUOUS/);
  assert.match(result.message, /A-GRAPH\.json/);
  assert.match(result.message, /B-GRAPH\.json/);
});

test("C003: an explicit path does not override a package with no graph", () => {
  const directory = makeDirectory();
  const outsideGraph = writeGraph(makeDirectory(), "RFC-GRAPH.json");

  const result = captureErrors(() =>
    validateGraphArgument([outsideGraph], { cwd: directory }),
  );

  assert.strictEqual(result.status, 2);
  assert.match(result.message, /MISSING/);
});

test("C003: an explicit path cannot block a package that resolves its own graph", () => {
  const directory = makeDirectory();
  writeGraph(directory, "RFC-GRAPH.json");

  assert.strictEqual(
    validateGraphArgument(["/definitely/absent/GRAPH.json"], { cwd: directory }),
    0,
  );
});

test("C003: a directive-only argument is harmless when the package resolves", () => {
  const directory = makeDirectory();
  writeGraph(directory, "RFC-GRAPH.json");
  const directive =
    "Previous /find-omissions detected incomplete. Re-run it. " +
    "Do not ask the human; decide everything and complete.";

  assert.strictEqual(validateGraphArgument([directive], { cwd: directory }), 0);
});

test("C002: a directory named RFC-GRAPH.json is not a graph", () => {
  const directory = makeDirectory();
  fs.mkdirSync(path.join(directory, "RFC-GRAPH.json"));

  const result = captureErrors(() =>
    validateGraphArgument([], { cwd: directory }),
  );

  assert.strictEqual(result.status, 2);
  assert.match(result.message, /MISSING/);
});
