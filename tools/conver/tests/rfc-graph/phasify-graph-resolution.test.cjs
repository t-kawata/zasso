// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
/**
 * phasify-graph-resolution.test.cjs — PX-439.
 *
 * Step 9 is called without a graph argument. phasify-omissions resolves the
 * package artifact itself, and an explicit --graph keeps working for a caller
 * that still supplies one.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PHASIFY = path.resolve(
  __dirname,
  "../../.claude/scripts/rfc-graph/phasify-omissions.js",
);
const {
  resolveGraphPathArgument,
} = require("../../.claude/scripts/rfc-graph/phasify-omissions.js");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "phasify-graph-"));
}

function writeGraph(directory, name) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, JSON.stringify({ nodes: [], edges: [] }), "utf8");
  return file;
}

test("C005: an explicit --graph argument is honored", () => {
  const directory = makeDirectory();
  const explicit = writeGraph(directory, "EXPLICIT-GRAPH.json");
  writeGraph(directory, "RFC-GRAPH.json");

  const result = resolveGraphPathArgument(explicit, directory);

  assert.strictEqual(result.reason, "FOUND");
  assert.strictEqual(result.path, explicit);
});

test("C005: an omitted --graph resolves the package artifact", () => {
  const directory = makeDirectory();
  const expected = writeGraph(directory, "RFC-GRAPH.json");

  const result = resolveGraphPathArgument("", directory);

  assert.strictEqual(result.reason, "FOUND");
  assert.strictEqual(result.path, expected);
});

test("C005: an omitted --graph with no artifact is MISSING", () => {
  const directory = makeDirectory();

  const result = resolveGraphPathArgument("", directory);

  assert.strictEqual(result.reason, "MISSING");
  assert.strictEqual(result.path, null);
});

test("C005: an omitted --graph with two artifacts is AMBIGUOUS", () => {
  const directory = makeDirectory();
  writeGraph(directory, "A-GRAPH.json");
  writeGraph(directory, "B-GRAPH.json");

  const result = resolveGraphPathArgument("", directory);

  assert.strictEqual(result.reason, "AMBIGUOUS");
  assert.deepStrictEqual(result.candidates, ["A-GRAPH.json", "B-GRAPH.json"]);
});

test("C005: the CLI without --graph names the unresolved artifact", () => {
  const directory = makeDirectory();
  fs.writeFileSync(path.join(directory, "Tickets.json"), "{}", "utf8");
  fs.writeFileSync(
    path.join(directory, "OMISSIONS-20260101000000.json"),
    "[]",
    "utf8",
  );

  const result = spawnSync(process.execPath, [PHASIFY], {
    cwd: directory,
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 2);
  assert.match(result.stderr, /MISSING|AMBIGUOUS/);
  assert.doesNotMatch(result.stderr, /Missing required argument/);
});
