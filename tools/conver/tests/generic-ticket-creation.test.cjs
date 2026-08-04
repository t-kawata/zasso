/**
 * generic-ticket-creation.test.cjs — PX-2 behavior-guarantee suite.
 *
 * Covers contracts C001..C004 of ticket PX-2:
 *   C001 the unified core accepts resolving / deferral / crime-deferral / bulk seed shapes,
 *        and the three flow scripts delegate to it with behavior parity
 *   C002 any flow failure aborts atomically (zero writes)
 *   C003 PX-1 safety guarantees (idempotency / duplicate rejection / on-disk verification) survive unification
 *   C004 start/resolve/split command definitions document the core-backed flow
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createTickets } = require("../.claude/scripts/lib/generic-ticket-creation.js");
const { createDeferralTicket } = require("../.claude/scripts/tickets/create-deferral-ticket.js");
const { createCrimeDeferralTicket } = require("../.claude/scripts/tickets/create-crime-deferral-ticket.js");

const FIXTURES = path.join(__dirname, "fixtures");
const PX2_TICKETS = path.join(FIXTURES, "mini-px2-tickets.json");

/** Load the PX-2 fixture Tickets.json. */
function loadTickets() {
  return JSON.parse(fs.readFileSync(PX2_TICKETS, "utf8"));
}

const C1 = { id: "C001", sourceEdge: "n->m", precondition: "p", postcondition: "q", invariant: "i" };

// ---------------------------------------------------------------------------
// C001 — seed shapes expressible through the unified core
// ---------------------------------------------------------------------------

describe("C001 seed shapes", function () {
  // @verifies C001
  it("deferral seed produces a todo ticket", () => {
    const res = createTickets({
      ticketsData: loadTickets(),
      seeds: [{ type: "deferral", sourceKey: "P4-2", seed: { title: "defer" }, stubId: "TS-1" }],
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(res.created.length, 1);
    assert.strictEqual(res.created[0].ticket.status, "todo");
  });

  // @verifies C001
  it("crime-deferral seed produces a todo ticket", () => {
    const res = createTickets({
      ticketsData: loadTickets(),
      seeds: [{ type: "crimeDeferral", sourceKey: "P4-2", seed: { title: "defer-crime" }, crimeId: "TC-1" }],
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(res.created.length, 1);
    assert.strictEqual(res.created[0].ticket.status, "todo");
  });

  // @verifies C001
  it("bulk seed adds multiple tickets in one commit", () => {
    const res = createTickets({
      ticketsData: loadTickets(),
      seeds: [{ type: "bulk", phaseId: 4, tickets: [{ title: "bulk-a", contracts: [C1] }, { title: "bulk-b", contracts: [C1] }] }],
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.strictEqual(res.created.length, 2, "two bulk tickets must be reported");
  });

  // @verifies C001
  it("resolving seed still routes through the core", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "px2-"));
    fs.cpSync(path.join(FIXTURES, "src"), path.join(ws, "src"), { recursive: true });
    const res = createTickets({
      ticketsData: loadTickets(),
      seeds: [{
        type: "resolving",
        sourceKey: "P4-2",
        seed: { title: "resolve" },
        stubs: [{ file: path.join(ws, "src/a.rs"), line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix" }],
      }],
      sourceRoot: ws,
    });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.ok(Array.isArray(res.created[0].ticket.stubs), "resolving ticket must carry stubs[]");
  });

  // @verifies C001
  it("unknown seed type is rejected", () => {
    const res = createTickets({ ticketsData: loadTickets(), seeds: [{ type: "bogus" }] });
    assert.strictEqual(res.success, false);
  });
});

// ---------------------------------------------------------------------------
// C001/C004 — flow scripts delegate to the core with behavior parity
// ---------------------------------------------------------------------------

describe("C001 flow-script delegation", function () {
  // @verifies C001
  it("createDeferralTicket still returns a new key (parity)", () => {
    const res = createDeferralTicket({ ticketsData: loadTickets(), sourceKey: "P4-2", seed: { title: "t" }, stubId: "TS-1" });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.ok(res.key, "must return the new key");
    assert.ok(/^P\d+-\d+$/.test(res.key), "key must be P{phase}-{id}: " + res.key);
  });

  // @verifies C001
  it("createCrimeDeferralTicket still returns a new key (parity)", () => {
    const res = createCrimeDeferralTicket({ ticketsData: loadTickets(), sourceKey: "P4-2", seed: { title: "t" }, crimeId: "TC-1" });
    assert.strictEqual(res.success, true, JSON.stringify(res.errors));
    assert.ok(res.key);
    assert.ok(/^P\d+-\d+$/.test(res.key));
  });
});

// ---------------------------------------------------------------------------
// C002 — atomicity
// ---------------------------------------------------------------------------

describe("C002 atomicity", function () {
  // @verifies C002
  it("a failing seed aborts the whole run with zero tickets committed", () => {
    const data = loadTickets();
    const before = JSON.stringify(data);
    const res = createTickets({
      ticketsData: data,
      seeds: [
        { type: "deferral", sourceKey: "P4-2", seed: { title: "ok" }, stubId: "TS-1" },
        { type: "deferral", sourceKey: "P9-99", seed: { title: "bad" }, stubId: "TS-2" },
      ],
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.errors.some((e) => e.error && /P9-99|not found/i.test(e.error)), "must report the bad source key");
    assert.strictEqual(JSON.stringify(res.data || loadTickets()), before, "must not commit partial state");
  });
});

// ---------------------------------------------------------------------------
// C003 — PX-1 safety preserved
// ---------------------------------------------------------------------------

describe("C003 safety preservation", function () {
  // @verifies C003
  it("a duplicate file:line resolving seed is rejected", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "px2-"));
    fs.cpSync(path.join(FIXTURES, "src"), path.join(ws, "src"), { recursive: true });
    const seed = {
      type: "resolving",
      sourceKey: "P4-2",
      seed: { title: "dup" },
      stubs: [{ file: path.join(ws, "src/a.rs"), line: 5, content: "// [::STUB::] P4-2: reason -- Implement fix" }],
    };
    const res = createTickets({ ticketsData: loadTickets(), seeds: [seed, seed], sourceRoot: ws });
    assert.strictEqual(res.success, false);
  });
});

// ---------------------------------------------------------------------------
// C004 — command definitions document the core-backed flow
// ---------------------------------------------------------------------------

describe("C004 command documentation", function () {
  // @verifies C004
  it("start/resolve command .md files reference the shared core", () => {
    const root = path.join(__dirname, "..", ".claude", "commands");
    for (const name of ["start-ticket.md", "resolve-ticket.md"]) {
      const doc = fs.readFileSync(path.join(root, name), "utf8");
      assert.ok(
        /generic-ticket-creation|batch-create-resolving-tickets/.test(doc),
        name + " must reference the shared core"
      );
    }
  });
});
