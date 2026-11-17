// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
/**
 * resolve-graph-path.test.cjs — PX-439.
 *
 * The graph is a package-local artifact: RFC-GRAPH.json first, else the unique
 * *-GRAPH.json. Missing and ambiguous are different verdicts, because a caller
 * must name which one it hit and must never guess between two candidates.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveGraphPath,
} = require("../../.claude/scripts/lib/resolve-graph-path.js");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "resolve-graph-"));
}

function writeGraph(directory, name) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, JSON.stringify({ nodes: [], edges: [] }), "utf8");
  return file;
}

test("C001: a direct RFC-GRAPH.json is the resolved graph", () => {
  const directory = makeDirectory();
  const expected = writeGraph(directory, "RFC-GRAPH.json");

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "FOUND");
  assert.strictEqual(result.path, expected);
  assert.deepStrictEqual(result.candidates, ["RFC-GRAPH.json"]);
});

test("C001: the unique *-GRAPH.json is resolved when the direct name is absent", () => {
  const directory = makeDirectory();
  const expected = writeGraph(directory, "RFC-ROOT-GRAPH.json");

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "FOUND");
  assert.strictEqual(result.path, expected);
  assert.deepStrictEqual(result.candidates, ["RFC-ROOT-GRAPH.json"]);
});

test("C001: the direct name wins over a suffix sibling", () => {
  const directory = makeDirectory();
  const expected = writeGraph(directory, "RFC-GRAPH.json");
  writeGraph(directory, "RFC-ROOT-GRAPH.json");

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "FOUND");
  assert.strictEqual(result.path, expected);
});

test("C002: no graph is MISSING with no candidate", () => {
  const directory = makeDirectory();

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "MISSING");
  assert.strictEqual(result.path, null);
  assert.deepStrictEqual(result.candidates, []);
});

test("C002: two suffix graphs are AMBIGUOUS with every candidate named", () => {
  const directory = makeDirectory();
  writeGraph(directory, "B-GRAPH.json");
  writeGraph(directory, "A-GRAPH.json");

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "AMBIGUOUS");
  assert.strictEqual(result.path, null);
  assert.deepStrictEqual(result.candidates, ["A-GRAPH.json", "B-GRAPH.json"]);
});

test("C002: a directory named *-GRAPH.json is not a graph candidate", () => {
  const directory = makeDirectory();
  fs.mkdirSync(path.join(directory, "DIR-GRAPH.json"));

  const result = resolveGraphPath(directory);

  assert.strictEqual(result.reason, "MISSING");
  assert.strictEqual(result.path, null);
  assert.deepStrictEqual(result.candidates, []);
});

test("C002: an unreadable package is UNREADABLE, never clean", (t) => {
  const directory = makeDirectory();
  fs.chmodSync(directory, 0o000);
  let result;
  try {
    result = resolveGraphPath(directory);
  } finally {
    fs.chmodSync(directory, 0o755);
  }

  if (result.reason === "FOUND") {
    t.skip("the current user bypasses directory permissions");
    return;
  }
  assert.strictEqual(result.reason, "UNREADABLE");
  assert.strictEqual(result.path, null);
  assert.strictEqual(typeof result.detail, "string");
});
