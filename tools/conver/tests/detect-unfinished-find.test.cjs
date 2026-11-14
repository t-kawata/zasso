#!/usr/bin/env node
/**
 * detect-unfinished-find.test.cjs — P27-1.
 *
 * The detector must prove, from package-local artifacts alone, that a previous
 * /find-omissions run did not finish. Every fixture here uses neutral names so
 * a passing suite cannot depend on a particular workspace.
 *
 * Contract map:
 *   C001 clean tree -> exit 0, unfinished=false
 *   C002 remanded ticket outside PX -> exit 10, evidence names the key
 *   C003 boundary find IN_PROGRESS -> exit 10
 *   C004 transient _tmp-* queue/omissions -> exit 10
 *   C005 --reset removes only transient files
 *
 * [::TICKET::] P27-1 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-1 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(
  __dirname,
  "../.claude/scripts/tickets/detect-unfinished-find.js",
);

/** Create an isolated package directory. */
function makePackage({ tickets, boundary, transient = [] }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "unfinished-find-"));
  fs.writeFileSync(
    path.join(directory, "Tickets.json"),
    JSON.stringify(
      tickets ?? {
        phases: [
          {
            id: 1,
            tickets: [
              { id: 1, phaseId: 1, status: "reviewed", title: "one" },
              { id: 2, phaseId: 1, status: "R1", title: "two" },
            ],
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
  for (const entry of transient) {
    fs.writeFileSync(
      path.join(directory, entry.name),
      JSON.stringify(entry.content ?? {}, null, 2),
      "utf8",
    );
  }
  return directory;
}

/** Run the CLI and return status and parsed JSON (when requested). */
function runCli(directory, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, `--cwd=${directory}`, "--format=json", ...extraArgs],
    { encoding: "utf8" },
  );
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    json = null;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

test("C001: a clean package reports unfinished=false and exits 0", () => {
  const directory = makePackage({
    boundary: { version: 1, find: null },
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.json.unfinished, false);
  assert.deepStrictEqual(result.json.evidence, []);
});

test("C002: a remanded ticket outside PX is evidence and exits 10", () => {
  const directory = makePackage({
    tickets: {
      phases: [
        {
          id: 1,
          tickets: [
            { id: 1, phaseId: 1, status: "reviewed", title: "one" },
            { id: 2, phaseId: 1, status: "remanded", title: "two" },
          ],
        },
      ],
    },
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 10, result.stderr);
  assert.strictEqual(result.json.unfinished, true);
  const remanded = result.json.evidence.find((entry) => entry.kind === "remanded");
  assert.ok(remanded, "remanded evidence exists");
  assert.deepStrictEqual(remanded.tickets.map((ticket) => ticket.key), ["P1-2"]);
});

test("C002: a remanded ticket in the PX phase is not evidence", () => {
  const directory = makePackage({
    tickets: {
      phases: [
        {
          id: -1,
          tickets: [{ id: 9, phaseId: -1, status: "remanded", title: "px" }],
        },
        {
          id: 1,
          tickets: [{ id: 1, phaseId: 1, status: "R1", title: "one" }],
        },
      ],
    },
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.json.unfinished, false);
});

test("C003: a boundary find record IN_PROGRESS is evidence even when tickets are terminal", () => {
  const directory = makePackage({
    boundary: {
      version: 1,
      find: { status: "IN_PROGRESS", startedAt: "2026-01-01T00:00:00.000Z" },
    },
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 10, result.stderr);
  assert.ok(result.json.evidence.some((entry) => entry.kind === "boundary"));
});

test("C004: a transient command queue is evidence and names the file", () => {
  const name = "_tmp-check-target-tickets-cmds-20260101000000.json";
  const directory = makePackage({
    transient: [
      {
        name,
        content: [{ done: false, cmd: "node show-ticket-context.js --ticket-key=P1-1" }],
      },
    ],
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 10, result.stderr);
  const queue = result.json.evidence.find((entry) => entry.kind === "queue");
  assert.ok(queue, "queue evidence exists");
  assert.ok(queue.files.includes(name), "the file is named");
  assert.strictEqual(queue.pendingEntries, 1);
});

test("C004: a transient omissions file is evidence", () => {
  const name = "_tmp-omissions-20260101000000.json";
  const directory = makePackage({
    transient: [{ name, content: [] }],
  });
  const result = runCli(directory);
  assert.strictEqual(result.status, 10, result.stderr);
  assert.ok(result.json.evidence.some((entry) => entry.kind === "omissions"));
});

test("C005: --reset removes transient files and leaves tickets and boundary byte-identical", () => {
  const queueName = "_tmp-check-target-tickets-cmds-20260101000000.json";
  const omissionsName = "_tmp-omissions-20260101000000.json";
  const directory = makePackage({
    boundary: { version: 1, find: null },
    transient: [
      { name: queueName, content: [{ done: false, cmd: "x" }] },
      { name: omissionsName, content: [] },
    ],
  });
  const ticketsBefore = fs.readFileSync(path.join(directory, "Tickets.json"), "utf8");
  const boundaryBefore = fs.readFileSync(
    path.join(directory, ".conver-boundary.json"),
    "utf8",
  );

  const result = runCli(directory, ["--reset"]);
  assert.strictEqual(result.status, 10, result.stderr);
  assert.ok(result.json.reset, "reset result is reported");
  assert.deepStrictEqual(result.json.reset.removed.sort(), [omissionsName, queueName].sort());
  assert.ok(!fs.existsSync(path.join(directory, queueName)));
  assert.ok(!fs.existsSync(path.join(directory, omissionsName)));
  assert.strictEqual(
    fs.readFileSync(path.join(directory, "Tickets.json"), "utf8"),
    ticketsBefore,
    "Tickets.json is untouched",
  );
  assert.strictEqual(
    fs.readFileSync(path.join(directory, ".conver-boundary.json"), "utf8"),
    boundaryBefore,
    "boundary record is untouched",
  );
});

test("C005: --reset on a clean package removes nothing", () => {
  const directory = makePackage({ boundary: { version: 1, find: null } });
  const result = runCli(directory, ["--reset"]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(result.json.reset.removed, []);
});

test("UT-E2: a malformed Tickets.json exits 20, never 10", () => {
  const directory = makePackage({ boundary: { version: 1, find: null } });
  fs.writeFileSync(path.join(directory, "Tickets.json"), "{not json", "utf8");
  const result = runCli(directory);
  assert.strictEqual(result.status, 20);
  assert.ok(/Tickets\.json/.test(result.stderr), "the error names the file");
});

test("UT-8: Markdown is the default output and JSON is opt-in", () => {
  const directory = makePackage({ boundary: { version: 1, find: null } });
  const markdown = spawnSync(process.execPath, [SCRIPT, `--cwd=${directory}`], {
    encoding: "utf8",
  });
  assert.strictEqual(markdown.status, 0);
  assert.ok(/unfinished/i.test(markdown.stdout));
  assert.throws(() => JSON.parse(markdown.stdout), "default output is not JSON");
});
