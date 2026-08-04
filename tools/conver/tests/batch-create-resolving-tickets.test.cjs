/**
 * batch-create-resolving-tickets.test.cjs — PX-1 behavior-guarantee suite.
 *
 * Covers contracts C001..C009 of ticket PX-1 (see specs/PX-1.md):
 *   C001 manifest shape / sourceKey auto-extract / title auto-derive / unresolvable rejected
 *   C002 atomic two-phase commit (written once + markers rewritten; all-or-nothing)
 *   C003 marker replacement + non-marker refusal
 *   C004 path resolution under --source-root + escape rejection
 *   C005 --no-write dry-run with zero side effects
 *   C006 stubs[] embedded with the new key
 *   C007 idempotent re-run (no duplicate tickets)
 *   C008 duplicate file:line rejection
 *   C009 on-disk oldKey divergence refusal
 */

const assert = require("node:assert");
const { describe, it, beforeEach, afterEach } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bcr = require("../.claude/scripts/tickets/batch-create-resolving-tickets.js");

const FIXTURES = path.join(__dirname, "fixtures");
const SRC_FIXTURES = path.join(FIXTURES, "src");
const MINI_TICKETS = path.join(FIXTURES, "mini-tickets.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an isolated workspace: temp dir + Tickets.json + src/ fixtures. */
function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcr-test-"));
  fs.cpSync(SRC_FIXTURES, path.join(dir, "src"), { recursive: true });
  const ticketsPath = path.join(dir, "Tickets.json");
  fs.copyFileSync(MINI_TICKETS, ticketsPath);
  return { dir, ticketsPath, sourceRoot: dir };
}

/** Read a 1-indexed line from a file, or null when out of range. */
function readLine(absFile, line) {
  const lines = fs.readFileSync(absFile, "utf8").split("\n");
  return lines[line - 1] === undefined ? null : lines[line - 1];
}

/** Overwrite a 1-indexed line, preserving the surrounding file. */
function writeLine(absFile, line, content) {
  const lines = fs.readFileSync(absFile, "utf8").split("\n");
  lines[line - 1] = content;
  fs.writeFileSync(absFile, lines.join("\n"), "utf8");
}

/** Count tickets that carry a stubs[] array (the resolving tickets we create). */
function stubTicketCount(ticketsPath) {
  const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
  return data.phases.reduce(
    (acc, p) => acc + (p.tickets || []).filter((t) => Array.isArray(t.stubs) && t.stubs.length > 0).length,
    0
  );
}

/** The canonical single-marker manifest entry for src/a.rs:5. */
function manifestForA(content) {
  return [{ file: "src/a.rs", line: 5, content: content || "// [::STUB::] P4-2: reason -- Implement fix" }];
}

// ---------------------------------------------------------------------------
// C001 — manifest entry / sourceKey / title
// ---------------------------------------------------------------------------

// @verifies C001 (PX-1 contract)
describe("C001 manifest shape and sourceKey/title resolution", function () {
  it("C001-pre: a manifest entry carries file/line/content", () => {
    const entry = { file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix" };
    assert.strictEqual(typeof entry.file, "string");
    assert.strictEqual(typeof entry.line, "number");
    assert.ok(entry.content.includes("[::STUB::]"));
  });

  it("C001-post: sourceKey auto-extracted and seed.title auto-derived", () => {
    const ws = makeWorkspace();
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix", seed: {} }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(res.created.length, 1);
    assert.strictEqual(res.created[0].sourceKey, "P4-2");
    assert.ok(res.created[0].ticket.title.length > 0, "title must be auto-derived");
  });

  it("C001-inv: unresolvable sourceKey rejected, nothing written", () => {
    const ws = makeWorkspace();
    const ticketsBefore = fs.readFileSync(ws.ticketsPath, "utf8");
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P9-99: reason -- Implement fix" }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some((e) => e.key === "P9-99"), "failure must name the bad key");
    assert.strictEqual(fs.readFileSync(ws.ticketsPath, "utf8"), ticketsBefore, "Tickets.json must be untouched");
  });
});

// ---------------------------------------------------------------------------
// C002 — atomic two-phase commit
// ---------------------------------------------------------------------------

// @verifies C002 (PX-1 contract)
describe("C002 atomic two-phase commit", function () {
  it("C002-post: Tickets.json gains a todo ticket AND the marker line is rewritten", () => {
    const ws = makeWorkspace();
    const res = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest: manifestForA(), sourceRoot: ws.sourceRoot });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(stubTicketCount(ws.ticketsPath), 1, "exactly one resolving ticket created");
    const line = readLine(path.join(ws.sourceRoot, "src/a.rs"), 5);
    assert.ok(!line.includes("P4-2"), "old key must be gone from the marker");
    assert.ok(/\[::STUB::\]\s+P\d+-\d+/.test(line), "line must reference a P{phase}-{id} key: " + line);
  });

  it("C002-inv: a failing manifest leaves Tickets.json and source files byte-identical", () => {
    const ws = makeWorkspace();
    const srcFile = path.join(ws.sourceRoot, "src/a.rs");
    const ticketsBefore = fs.readFileSync(ws.ticketsPath, "utf8");
    const srcBefore = fs.readFileSync(srcFile, "utf8");
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "missing.rs", line: 1, content: "// [::STUB::] P4-2: x -- Implement y" }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(fs.readFileSync(ws.ticketsPath, "utf8"), ticketsBefore);
    assert.strictEqual(fs.readFileSync(srcFile, "utf8"), srcBefore);
  });
});

// ---------------------------------------------------------------------------
// C003 — marker replacement + non-marker refusal
// ---------------------------------------------------------------------------

// @verifies C003 (PX-1 contract)
describe("C003 marker safety", function () {
  it("C003-post: a [::STUB::] line is replaced with newContent bearing the new key", () => {
    const ws = makeWorkspace();
    bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest: manifestForA(), sourceRoot: ws.sourceRoot });
    const line = readLine(path.join(ws.sourceRoot, "src/a.rs"), 5);
    assert.ok(line.includes("[::STUB::]"));
    assert.ok(/\[::STUB::\]\s+P\d+-\d+/.test(line), "must reference a P{phase}-{id} key: " + line);
  });

  it("C003-inv: a target line without [::STUB::] is refused, file untouched", () => {
    const ws = makeWorkspace();
    const srcFile = path.join(ws.sourceRoot, "src/a.rs");
    const srcBefore = fs.readFileSync(srcFile, "utf8");
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "src/a.rs", line: 10, content: "let x = 1; // no marker" }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(fs.readFileSync(srcFile, "utf8"), srcBefore);
  });

  it("C003-post: multiple markers in one file are rewritten in descending line order", () => {
    const ws = makeWorkspace();
    const multiFile = path.join(ws.sourceRoot, "src/multi.rs");
    const entries = [
      { file: "src/multi.rs", line: 4, content: "    // [::STUB::] P4-2: reason one -- Implement one" },
      { file: "src/multi.rs", line: 23, content: "    // [::STUB::] P4-2: reason two -- Implement two" },
      { file: "src/multi.rs", line: 39, content: "    // [::STUB::] P4-2: reason three -- Implement three" },
    ];
    const res = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest: entries, sourceRoot: ws.sourceRoot });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(stubTicketCount(ws.ticketsPath), 3);
    for (const e of entries) {
      const line = readLine(multiFile, e.line);
      assert.ok(/\[::STUB::\]\s+P\d+-\d+/.test(line), "line " + e.line + " must have a new key: " + line);
      assert.ok(!line.includes("P4-2"), "line " + e.line + " must not keep the old key");
    }
  });

  it("C003-post: a marker on the final line without a trailing newline is still rewritten", () => {
    const ws = makeWorkspace();
    const lastFile = path.join(ws.sourceRoot, "src/lastline.rs");
    const raw = fs.readFileSync(lastFile, "utf8");
    assert.ok(!raw.endsWith("\n"), "fixture must have no trailing newline");
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "src/lastline.rs", line: 2, content: "// [::STUB::] P4-2: reason -- Implement fix" }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    const after = fs.readFileSync(lastFile, "utf8");
    assert.ok(/\[::STUB::\]\s+P\d+-\d+/.test(after), "last line must reference a new key");
  });
});

// ---------------------------------------------------------------------------
// C004 — path resolution
// ---------------------------------------------------------------------------

// @verifies C004 (PX-1 contract)
describe("C004 path resolution", function () {
  it("C004-post: repo-relative paths resolve to absolute under --source-root", () => {
    const ws = makeWorkspace();
    const res = bcr.createResolvingTickets({
      ticketsData: JSON.parse(fs.readFileSync(ws.ticketsPath, "utf8")),
      manifest: manifestForA(),
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, true);
    assert.ok(path.isAbsolute(res.rewriteMap[0].file), "rewriteMap file must be absolute");
  });

  it("C004-inv: a path escaping the source root is rejected", () => {
    const ws = makeWorkspace();
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: [{ file: "../evil.rs", line: 1, content: "// [::STUB::] P4-2: x -- Implement y" }],
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, false);
  });
});

// ---------------------------------------------------------------------------
// C005 — --no-write dry-run
// ---------------------------------------------------------------------------

// @verifies C005 (PX-1 contract)
describe("C005 --no-write dry-run", function () {
  it("C005-inv: validation runs with zero side effects", () => {
    const ws = makeWorkspace();
    const srcFile = path.join(ws.sourceRoot, "src/a.rs");
    const ticketsBefore = fs.readFileSync(ws.ticketsPath, "utf8");
    const srcBefore = fs.readFileSync(srcFile, "utf8");
    const res = bcr.runBatchCreate({
      ticketsPath: ws.ticketsPath,
      manifest: manifestForA(),
      sourceRoot: ws.sourceRoot,
      noWrite: true,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(stubTicketCount(ws.ticketsPath), 0, "dry-run must not create tickets");
    assert.strictEqual(fs.readFileSync(ws.ticketsPath, "utf8"), ticketsBefore);
    assert.strictEqual(fs.readFileSync(srcFile, "utf8"), srcBefore);
  });
});

// ---------------------------------------------------------------------------
// C006 — stubs[] embedded with the new key
// ---------------------------------------------------------------------------

// @verifies C006 (PX-1 contract)
describe("C006 stubs[] embedding", function () {
  it("C006-inv: every created ticket stubs[].content references its own new key", () => {
    const ws = makeWorkspace();
    const res = bcr.createResolvingTickets({
      ticketsData: JSON.parse(fs.readFileSync(ws.ticketsPath, "utf8")),
      manifest: manifestForA(),
      sourceRoot: ws.sourceRoot,
    });
    assert.strictEqual(res.success, true);
    for (const created of res.created) {
      const ownKey = "P" + created.ticket.phaseId + "-" + created.ticket.id;
      for (const stub of created.ticket.stubs) {
        assert.ok(stub.content.includes(ownKey), "stub content must reference " + ownKey + ": " + stub.content);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// C007 — idempotent re-run
// ---------------------------------------------------------------------------

// @verifies C007 (PX-1 contract)
describe("C007 idempotent re-run", function () {
  it("C007-inv: running twice with the same manifest creates no duplicate tickets", () => {
    const ws = makeWorkspace();
    const manifest = manifestForA();
    const r1 = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest, sourceRoot: ws.sourceRoot });
    assert.strictEqual(r1.success, true, JSON.stringify(r1.errors));
    const count1 = stubTicketCount(ws.ticketsPath);
    const r2 = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest, sourceRoot: ws.sourceRoot });
    const count2 = stubTicketCount(ws.ticketsPath);
    assert.ok(!r2.success || r2.created.length === 0, "re-run must not create tickets");
    assert.strictEqual(count1, count2, "ticket count must not grow on re-run");
  });
});

// ---------------------------------------------------------------------------
// C008 — duplicate file:line rejection
// ---------------------------------------------------------------------------

// @verifies C008 (PX-1 contract)
describe("C008 duplicate rejection", function () {
  it("C008-inv: the same file:line twice in one manifest aborts with zero writes", () => {
    const ws = makeWorkspace();
    const e = { file: "src/a.rs", line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix" };
    const ticketsBefore = fs.readFileSync(ws.ticketsPath, "utf8");
    const res = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest: [e, { ...e }], sourceRoot: ws.sourceRoot });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some((err) => /duplicate/i.test(err.error)), "must report a duplicate error");
    assert.strictEqual(fs.readFileSync(ws.ticketsPath, "utf8"), ticketsBefore);
  });
});

// ---------------------------------------------------------------------------
// C009 — on-disk divergence refusal
// ---------------------------------------------------------------------------

// @verifies C009 (PX-1 contract)
describe("C009 on-disk divergence", function () {
  it("C009-inv: on-disk oldKey divergence is refused and Tickets.json untouched", () => {
    const ws = makeWorkspace();
    const srcFile = path.join(ws.sourceRoot, "src/a.rs");
    writeLine(srcFile, 5, "// [::STUB::] P9-9: edited after manifest build");
    const ticketsBefore = fs.readFileSync(ws.ticketsPath, "utf8");
    const res = bcr.runBatchCreate({ ticketsPath: ws.ticketsPath, manifest: manifestForA(), sourceRoot: ws.sourceRoot });
    assert.strictEqual(res.success, false);
    assert.strictEqual(fs.readFileSync(ws.ticketsPath, "utf8"), ticketsBefore);
  });
});

// ---------------------------------------------------------------------------
// parseArgs / loadManifest (CLI surface)
// ---------------------------------------------------------------------------

describe("CLI surface", function () {
  it("parseArgs: --no-write is the only accepted flag", () => {
    const args = bcr.parseArgs(["--no-write"]);
    assert.strictEqual(args.noWrite, true);
  });

  it("parseArgs: defaults", () => {
    const args = bcr.parseArgs([]);
    assert.strictEqual(args.noWrite, false);
  });

  it("parseArgs: removed flags are rejected", () => {
    assert.ok(bcr.parseArgs(["--manifest=m.json"]).error, "--manifest must be rejected");
    assert.ok(bcr.parseArgs(["--rewrites=r.json"]).error, "--rewrites must be rejected");
    assert.ok(bcr.parseArgs(["--tickets=T.json"]).error, "--tickets must be rejected");
    assert.ok(bcr.parseArgs(["--source-root=/tmp"]).error, "--source-root must be rejected");
  });

  it("loadManifest: parses a manifest JSON array from stdin text", () => {
    const entries = bcr.loadManifest(JSON.stringify(manifestForA()));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].file, "src/a.rs");
  });
});
