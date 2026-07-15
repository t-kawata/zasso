/**
 * resolve-ticket-context.test.cjs — resolve-ticket-context.js の単体テスト
 *
 * テスト対象: parseArguments, ticketExists, generateInstruction,
 *            isValidTicketKey, parseTicketKey
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");

const {
  parseArguments,
  generateInstruction,
  isValidTicketKey,
  parseTicketKey,
  ticketExists,
} = require("../.claude/scripts/tickets/resolve-ticket-context");

// ---------------------------------------------------------------------------
// parseArguments
// ---------------------------------------------------------------------------

describe("resolve-ticket-context — parseArguments", function () {
  it("Case 1: --ticket-key のみ指定", function () {
    const r = parseArguments(["--ticket-key=P0-1"]);
    assert.strictEqual(r.ticketKey, "P0-1");
  });

  it("Case 2: --tickets + --ticket-key を指定", function () {
    const r = parseArguments([
      "--tickets=/tmp/foo/Tickets.json",
      "--ticket-key=PX-53",
    ]);
    assert.strictEqual(r.ticketKey, "PX-53");
    assert.strictEqual(r.ticketsPath, "/tmp/foo/Tickets.json");
  });

  it("Case 3: --title を渡しても無視される（auto-creation 削除）", function () {
    const r = parseArguments([
      "--ticket-key=P0-1",
      "--title=Should Be Ignored",
    ]);
    assert.strictEqual(r.ticketKey, "P0-1");
    assert.strictEqual(Object.keys(r).length, 2);
  });

  it("Case 4: 引数なし → ticketKey は空文字", function () {
    const r = parseArguments([]);
    assert.strictEqual(r.ticketKey, "");
  });
});

// ---------------------------------------------------------------------------
// isValidTicketKey / parseTicketKey
// ---------------------------------------------------------------------------

describe("resolve-ticket-context — isValidTicketKey", function () {
  it("P0-1 → true", () => assert.strictEqual(isValidTicketKey("P0-1"), true));
  it("PX-53 → true", () => assert.strictEqual(isValidTicketKey("PX-53"), true));
  it("空文字 → false", () => assert.strictEqual(isValidTicketKey(""), false));
});

describe("resolve-ticket-context — parseTicketKey", function () {
  it("P0-1 → {phaseId:0, ticketId:1}", () => assert.deepStrictEqual(parseTicketKey("P0-1"), { phaseId: 0, ticketId: 1 }));
  it("PX-53 → {phaseId:-1, ticketId:53}", () => assert.deepStrictEqual(parseTicketKey("PX-53"), { phaseId: -1, ticketId: 53 }));
  it("不正形式 → null", () => assert.strictEqual(parseTicketKey("bad"), null));
});

// ---------------------------------------------------------------------------
// ticketExists
// ---------------------------------------------------------------------------

describe("resolve-ticket-context — ticketExists", function () {
  const tickets = {
    phases: [
      { id: 0, ticketKeyPrefix: "P0", tickets: [{ id: 1 }, { id: 2 }] },
      { id: -1, ticketKeyPrefix: "PX", tickets: [{ id: 53 }] },
    ],
  };

  it("存在（P0-1）→ true", () => assert.strictEqual(ticketExists(tickets, 0, 1), true));
  it("不在（P0-999）→ false", () => assert.strictEqual(ticketExists(tickets, 0, 999), false));
  it("PX-53 → true", () => assert.strictEqual(ticketExists(tickets, -1, 53), true));
  it("存在しないフェーズ → false", () => assert.strictEqual(ticketExists(tickets, 99, 1), false));
});

// ---------------------------------------------------------------------------
// generateInstruction — 新文言の確認
// ---------------------------------------------------------------------------

describe("resolve-ticket-context — generateInstruction", function () {
  it("ticketKey 不正 → 引数エラー", function () {
    const msg = generateInstruction("", true, true, "", "", false, false, false);
    assert.ok(msg.includes("引数が指定されていないか"));
  });

  it("チケット不在 → ensure-ticket.js を参照", function () {
    const msg = generateInstruction("P0-1", false, false, "", "", false, false, false);
    assert.ok(msg.includes("ensure-ticket.js"));
    assert.ok(!msg.includes("--title を指定して再実行"));
  });

  it("spec 不在 → create-spec.js を参照", function () {
    const msg = generateInstruction("P0-1", true, false, "", "", false, false, false);
    assert.ok(msg.includes("create-spec.js"));
  });

  it("rfcPathSource=none → Step 3/Step 6 を参照", function () {
    const msg = generateInstruction("P0-1", true, true, "", "none", false, false, false);
    assert.ok(msg.includes("Step 6 はスキップ"));
    assert.ok(msg.includes("Step 3 はスポット調査"));
  });

  it("rfcPathSource=not_found → Step 6 スキップ", function () {
    const msg = generateInstruction("P0-1", true, true, "", "not_found", false, false, false);
    assert.ok(msg.includes("Step 6 はスキップ"));
  });

  it("rfcPathSource=unknown → Step 6 スキップ", function () {
    const msg = generateInstruction("P0-1", true, true, "", "unknown", false, false, false);
    assert.ok(msg.includes("Step 6 はスキップ"));
  });

  it("rfcPath 実在しない → Step 6 スキップ", function () {
    const msg = generateInstruction("P0-1", true, true, "/path/to/rfc.md", "md", false, true, true);
    assert.ok(msg.includes("Step 6 はスキップ"));
  });

  it("GRAPH/Dirs-Tree 不足 → Step 6 スキップ", function () {
    const m1 = generateInstruction("P0-1", true, true, "/path/to/rfc.md", "md", true, false, true);
    assert.ok(m1.includes("Step 6 はスキップ"));
    const m2 = generateInstruction("P0-1", true, true, "/path/to/rfc.md", "md", true, true, false);
    assert.ok(m2.includes("Step 6 はスキップ"));
  });

  it("全リソース完備 → Step 6 機械的書き込み + Step 3 グラフ調査", function () {
    const msg = generateInstruction("P0-1", true, true, "/path/to/rfc.md", "md", true, true, true);
    assert.ok(msg.includes("Step 6 で機械的書き込み"));
    assert.ok(msg.includes("Step 3 ではグラフ"));
  });
});
