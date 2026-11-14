/**
 * find-omissions-preflight.test.cjs — P27-3.
 *
 * The pre-flight is one script with one verdict. These tests pin the properties
 * that matter to a caller: the exit code (0 continue / 2 stop), the MODE line,
 * and the ordering guarantee that no transient file is removed before every
 * read-only gate has passed.
 *
 * [::TICKET::] P27-3 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-3 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(
  __dirname,
  "../.claude/scripts/tickets/find-omissions-preflight.sh",
);

/** Create a package fixture and return its directory plus the graph path. */
function makePackage({ tickets, boundary, transient = [], stub = false }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "find-preflight-"));
  fs.writeFileSync(
    path.join(directory, "Tickets.json"),
    JSON.stringify(
      tickets ?? {
        phases: [
          {
            id: 0,
            tickets: [{ id: 1, phaseId: 0, status: "reviewed", title: "one" }],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  if (boundary !== undefined) {
    fs.writeFileSync(
      path.join(directory, ".conver-boundary.json"),
      JSON.stringify(boundary, null, 2),
      "utf8",
    );
  }
  const graphPath = path.join(directory, "RFC-GRAPH.json");
  fs.writeFileSync(graphPath, JSON.stringify({ nodes: [], edges: [] }), "utf8");
  for (const entry of transient) {
    fs.writeFileSync(
      path.join(directory, entry.name),
      JSON.stringify(entry.content ?? {}, null, 2),
      "utf8",
    );
  }
  if (stub) {
    fs.mkdirSync(path.join(directory, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(directory, "src", "a.js"),
      "// [::STUB::] P0-1: pending -- Implement later\n",
      "utf8",
    );
  }
  return { directory, graphPath };
}

/** Invoke the wrapper with one raw argument, from the package directory. */
function runPreflight(directory, argument) {
  return spawnSync("bash", [SCRIPT, argument], {
    cwd: directory,
    encoding: "utf8",
  });
}

const REMANDED = {
  phases: [
    {
      id: 0,
      tickets: [
        { id: 1, phaseId: 0, status: "reviewed", title: "one" },
        { id: 2, phaseId: 0, status: "remanded", title: "two" },
      ],
    },
  ],
};

test("C001: a clean package prints three gate lines and MODE CLEAN", () => {
  const { directory, graphPath } = makePackage({ boundary: { find: null } });
  const result = runPreflight(directory, graphPath);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /MODE: CLEAN/);
  assert.match(result.stdout, /graph/i);
  assert.match(result.stdout, /unfinished find/i);
  assert.match(result.stdout, /consolidated manifest/i);
  assert.match(result.stdout, /VERDICT: CONTINUE/);
});

test("C001: an unfinished run resets the named transient files and reports RESUME", () => {
  const name = "_tmp-omissions-20260101000000.json";
  const { directory, graphPath } = makePackage({
    tickets: REMANDED,
    boundary: { find: null },
    transient: [{ name, content: [] }],
  });
  const result = runPreflight(directory, graphPath);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /MODE: RESUME/);
  assert.match(result.stdout, /reset/i);
  assert.ok(result.stdout.includes(name), "the removed file is named");
  assert.ok(!fs.existsSync(path.join(directory, name)), "the file is removed");
  assert.match(result.stdout, /VERDICT: CONTINUE/);
});

test("C001: an invalid graph stops and removes nothing", () => {
  const name = "_tmp-omissions-20260101000000.json";
  const { directory } = makePackage({
    tickets: REMANDED,
    boundary: { find: null },
    transient: [{ name, content: [] }],
  });
  const result = runPreflight(directory, path.join(directory, "absent.json"));
  assert.strictEqual(result.status, 2);
  assert.match(result.stdout, /VERDICT: STOP/);
  assert.ok(fs.existsSync(path.join(directory, name)), "no reset on a stop");
});

test("C001: a manifest-blocked package stops before the reset (ordering proof)", () => {
  const name = "_tmp-omissions-20260101000000.json";
  const { directory, graphPath } = makePackage({
    tickets: REMANDED,
    boundary: { find: null },
    transient: [{ name, content: [] }],
    stub: true,
  });
  const result = runPreflight(directory, graphPath);
  assert.strictEqual(result.status, 2);
  assert.match(result.stdout, /VERDICT: STOP/);
  assert.ok(
    fs.existsSync(path.join(directory, name)),
    "a blocked run keeps the omissions recorded by the interrupted run",
  );
});

test("C001: malformed input stops and removes nothing", () => {
  const name = "_tmp-omissions-20260101000000.json";
  const { directory, graphPath } = makePackage({
    boundary: { find: null },
    transient: [{ name, content: [] }],
  });
  fs.writeFileSync(path.join(directory, "Tickets.json"), "{not json", "utf8");
  const result = runPreflight(directory, graphPath);
  assert.strictEqual(result.status, 2);
  assert.match(result.stdout, /VERDICT: STOP/);
  assert.ok(fs.existsSync(path.join(directory, name)));
});

test("C001: a multi-line graph plus directive still validates the first line", () => {
  const { directory, graphPath } = makePackage({ boundary: { find: null } });
  const argument =
    graphPath +
    "\n\nPrevious /find-omissions detected incomplete. Re-run it. " +
    "Do not ask the human; decide everything and complete.";
  const result = runPreflight(directory, argument);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /MODE: CLEAN/);
});

test("C001: the script is a bash script with a shebang", () => {
  const source = fs.readFileSync(SCRIPT, "utf8");
  assert.ok(source.startsWith("#!/usr/bin/env bash"), "bash shebang");
  assert.ok(!/\beval\b/.test(source), "no eval of the caller argument");
});
