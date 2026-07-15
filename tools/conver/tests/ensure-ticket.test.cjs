/**
 * ensure-ticket.test.cjs — ensure-ticket.js の単体テスト
 *
 * テスト対象: parseArgs
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const { parseArgs } = require("../.claude/scripts/tickets/ensure-ticket");

describe("ensure-ticket — parseArgs", function () {
  it("必須: --ticket-key + --title + --tickets", () => {
    const r = parseArgs(["--ticket-key=PX-53", "--title=T", "--tickets=/tmp/Tickets.json"]);
    assert.strictEqual(r.ticketKey, "PX-53");
    assert.strictEqual(r.title, "T");
  });

  it("--tickets 省略 → CWD の Tickets.json", () => {
    const r = parseArgs(["--ticket-key=PX-1", "--title=Hello"]);
    assert(r.ticketsPath.endsWith("Tickets.json"));
  });

  it("--background: 文字列", () => {
    const r = parseArgs(["--ticket-key=PX-1", "--title=T", "--background=BG"]);
    assert.strictEqual(r.background, "BG");
  });

  it("--scope: JSON 配列", () => {
    assert.deepStrictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", '--scope=["a","b"]']).scope, ["a", "b"]);
  });

  it("--test-unit: JSON 配列", () => {
    assert.deepStrictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", '--test-unit=["UT: test"]']).testUnit, ["UT: test"]);
  });

  it("--test-integration: JSON 配列", () => {
    assert.deepStrictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", '--test-integration=["IT: integration"]']).testIntegration, ["IT: integration"]);
  });

  it("--test-exceptions: JSON 配列", () => {
    assert.deepStrictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", '--test-exceptions=["cannot test"]']).testExceptions, ["cannot test"]);
  });

  it("--default-files: JSON 配列", () => {
    assert.deepStrictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", '--default-files=["src/main.rs"]']).default_files, ["src/main.rs"]);
  });

  it("--notes: 文字列", () => {
    assert.strictEqual(parseArgs(["--ticket-key=PX-1", "--title=T", "--notes=Notes"]).notes, "Notes");
  });

  it("全オプション同時指定", () => {
    const r = parseArgs(["--ticket-key=PX-1", "--title=T", "--background=BG",
      '--scope=["s1"]', '--test-unit=["tv1"]', '--test-integration=["ti1"]',
      '--test-exceptions=["te1"]', '--default-files=["f1"]', "--notes=N1"]);
    assert.strictEqual(r.background, "BG");
    assert.strictEqual(r.notes, "N1");
    assert.deepStrictEqual(r.scope, ["s1"]);
    assert.deepStrictEqual(r.testUnit, ["tv1"]);
    assert.deepStrictEqual(r.testIntegration, ["ti1"]);
    assert.deepStrictEqual(r.testExceptions, ["te1"]);
    assert.deepStrictEqual(r.default_files, ["f1"]);
  });

  it("引数なし → 各フィールドは空/デフォルト", () => {
    const r = parseArgs([]);
    assert.strictEqual(r.ticketKey, "");
    assert.strictEqual(r.title, "");
    assert.strictEqual(r.background, "");
    assert.strictEqual(r.scope, null);
    assert.strictEqual(r.testUnit, null);
    assert.strictEqual(r.testIntegration, null);
    assert.strictEqual(r.testExceptions, null);
    assert.strictEqual(r.default_files, null);
    assert.strictEqual(r.notes, "");
  });

  it("--ticket-key のみ → --title は空文字", () => {
    assert.strictEqual(parseArgs(["--ticket-key=PX-1"]).title, "");
  });

  it("不明なフラグは無視", () => {
    const r = parseArgs(["--unknown=foo", "--ticket-key=PX-99", "--title=T"]);
    assert.strictEqual(r.ticketKey, "PX-99");
    assert.strictEqual(r.title, "T");
  });

  it("不正 JSON → JSON.parse エラーが伝播する", () => {
    assert.throws(() => parseArgs(["--ticket-key=PX-1", "--title=T", "--scope=bad"]), /JSON/);
    assert.throws(() => parseArgs(["--ticket-key=PX-1", "--title=T", "--test-unit=bad"]), /JSON/);
    assert.throws(() => parseArgs(["--ticket-key=PX-1", "--title=T", "--test-integration=bad"]), /JSON/);
    assert.throws(() => parseArgs(["--ticket-key=PX-1", "--title=T", "--test-exceptions=bad"]), /JSON/);
  });
});
