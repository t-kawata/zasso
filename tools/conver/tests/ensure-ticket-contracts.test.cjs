/**
 * ensure-ticket-contracts.test.cjs — ensure-ticket.js --contracts parameter tests
 *
 * Tests: parseArgs with --contracts
 * [::TICKET::] PX-73: C002 — ensure-ticket.js --contracts → stored and validated
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const { parseArgs } = require("../.claude/scripts/tickets/ensure-ticket");

describe("ensure-ticket — parseArgs with --contracts", function () {
  it("parses valid --contracts JSON array", () => {
    const r = parseArgs([
      "--ticket-key=PX-73",
      "--title=T",
      '--contracts=[{"id":"C001","sourceEdge":"N1→N2","precondition":"pre","postcondition":"post","invariant":"inv"}]'
    ]);
    assert.ok(Array.isArray(r.contracts));
    assert.strictEqual(r.contracts.length, 1);
    assert.strictEqual(r.contracts[0].id, "C001");
    assert.strictEqual(r.contracts[0].precondition, "pre");
    assert.strictEqual(r.contracts[0].postcondition, "post");
    assert.strictEqual(r.contracts[0].invariant, "inv");
  });

  it("parses --contracts with multiple contracts", () => {
    const r = parseArgs([
      "--ticket-key=PX-73",
      "--title=T",
      '--contracts=[{"id":"C001","sourceEdge":"N1→N2","precondition":"a","postcondition":"b","invariant":"c"},{"id":"C002","sourceEdge":"N2→N3","precondition":"d","postcondition":"e","invariant":"f"}]'
    ]);
    assert.strictEqual(r.contracts.length, 2);
    assert.strictEqual(r.contracts[1].id, "C002");
  });

  it("rejects malformed --contracts JSON", () => {
    assert.throws(
      () => parseArgs(["--ticket-key=PX-73", "--title=T", "--contracts=bad"]),
      /JSON/
    );
  });

  it("omits contracts when --contracts not provided", () => {
    const r = parseArgs(["--ticket-key=PX-73", "--title=T"]);
    assert.strictEqual(r.contracts, null);
  });

  it("works with all other options simultaneously", () => {
    const r = parseArgs([
      "--ticket-key=PX-73", "--title=T", "--background=BG",
      '--scope=["s1"]', '--test-unit=["UT: test"]', '--contracts=[{"id":"C001","sourceEdge":"E1","precondition":"x","postcondition":"y","invariant":"z"}]'
    ]);
    assert.strictEqual(r.background, "BG");
    assert.strictEqual(r.contracts.length, 1);
    assert.strictEqual(r.contracts[0].id, "C001");
  });
});
