/**
 * update-ticket.test.cjs — update-ticket.js の動作検証
 *
 * テスト対象: 通常モード（上書き）、--append モード（追記）
 * 備考: 実スクリプトを子プロセスで実行する結合テスト形式。
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SCRIPT = path.resolve(__dirname, "../.claude/scripts/tickets/update-ticket.js");
let dir, ticketsPath;

const BASE_TICKETS = {
  title: "Test Tickets",
  round: 1,
  phases: [{
    id: 0, name: "P0", ticketKeyPrefix: "P0",
    tickets: [{ id: 1, phaseId: 0, title: "Test", status: "todo",
      notes: "Original note.", scope: ["Original scope"] }],
  }],
  metadata: { source: "x", generatedAt: "2026-07-14" },
};

before(function () {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ut-"));
  ticketsPath = path.join(dir, "Tickets.json");
});

after(function () {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeTickets() {
  fs.writeFileSync(ticketsPath, JSON.stringify(BASE_TICKETS, null, 2) + "\n");
}

describe("update-ticket — normal mode", function () {
  it("文字列フィールドを上書きする", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1"], {
      input: JSON.stringify({ notes: "Replaced." }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.strictEqual(data.phases[0].tickets[0].notes, "Replaced.");
  });

  it("配列フィールドを上書きする", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1"], {
      input: JSON.stringify({ scope: ["New scope"] }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.deepStrictEqual(data.phases[0].tickets[0].scope, ["New scope"]);
  });

  it("id, phaseId は保護される", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1"], {
      input: JSON.stringify({ id: 99, phaseId: 99, title: "Hacked" }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    const t = data.phases[0].tickets[0];
    assert.strictEqual(t.id, 1);
    assert.strictEqual(t.phaseId, 0);
    assert.strictEqual(t.title, "Hacked");
  });
});

describe("update-ticket --append mode", function () {
  it("文字列に追記する（改行区切り）", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1", "--append"], {
      input: JSON.stringify({ notes: "Appended line." }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.strictEqual(data.phases[0].tickets[0].notes, "Original note.\nAppended line.");
  });

  it("配列に追記する", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1", "--append"], {
      input: JSON.stringify({ scope: ["Appended scope"] }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.deepStrictEqual(data.phases[0].tickets[0].scope, ["Original scope", "Appended scope"]);
  });

  it("未設定フィールドへの追記 → そのまま設定される", function () {
    writeTickets();
    execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1", "--append"], {
      input: JSON.stringify({ background: "New background." }),
      encoding: "utf8",
    });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.strictEqual(data.phases[0].tickets[0].background, "New background.");
  });

  it("複数回追記しても安全（冪等性はないが破壊しない）", function () {
    writeTickets();
    const run = (input) => execFileSync(process.execPath, [SCRIPT, ticketsPath, "P0-1", "--append"], {
      input: JSON.stringify(input), encoding: "utf8",
    });
    run({ notes: "Second line." });
    run({ notes: "Third line." });
    const data = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.strictEqual(data.phases[0].tickets[0].notes,
      "Original note.\nSecond line.\nThird line.");
  });
});
