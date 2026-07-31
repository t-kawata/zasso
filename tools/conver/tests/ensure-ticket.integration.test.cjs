/**
 * ensure-ticket.integration.test.cjs — 結合テスト
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SCRIPT = path.resolve(__dirname, "../.claude/scripts/tickets/ensure-ticket.js");
const { resolveSpecPath, generateSlug, extractTicketId } = require("../.claude/scripts/tickets/ensure-ticket");

function createTicketsJson() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-int-"));
  const ticketsPath = path.join(dir, "Tickets.json");
  const ticketsJson = {
    title: "Test Tickets",
    round: 1,
    phases: [{ id: -1, name: "PX", ticketKeyPrefix: "PX", tickets: [] }],
    metadata: { source: "x", generatedAt: "2026-07-14" },
  };
  fs.writeFileSync(ticketsPath, JSON.stringify(ticketsJson, null, 2) + "\n");
  return { dir, ticketsPath };
}

describe("ensure-ticket — integration", function () {

  it("基本フロー: 最小限の引数", function () {
    const { dir, ticketsPath } = createTicketsJson();
    let stdout;
    try {
      stdout = execFileSync(process.execPath, [ SCRIPT,
        "--ticket-key=PX-9999", "--title=Minimal Test",
        `--tickets=${ticketsPath}`,
      ], { encoding: "utf8" });
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      assert.fail(`異常終了 (exit=${e.status}): ${e.stderr}`);
    }
    assert.ok(stdout.includes("# PX-"));
    assert.ok(stdout.includes("## Test Plan"));
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    assert.strictEqual(tickets.phases[0].tickets.length, 1);
    // specPath は保存されているが spec ファイルは作成されない
    assert.ok(typeof tickets.phases[0].tickets[0].specPath === "string", "specPath が保存されている");
    assert.ok(tickets.phases[0].tickets[0].specPath.endsWith(".md"), "specPath は .md ファイル");
    assert.ok(!fs.existsSync(tickets.phases[0].tickets[0].specPath), "spec ファイルはまだ作成されていない");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("全オプション指定: UT/IT/Exceptions が Markdown に反映", function () {
    const { dir, ticketsPath } = createTicketsJson();
    let stdout;
    try {
      stdout = execFileSync(process.execPath, [ SCRIPT,
        "--ticket-key=PX-9998",
        "--title=Full Test",
        "--background=Conversation background.",
        '--scope=["Scope A","Scope B"]',
        '--test-unit=["UT: should pass","UT: edge case"]',
        '--test-integration=["IT: module A + B integration","IT: cross-module flow"]',
        '--test-exceptions=["E2E: cannot unit test"]',
        '--default-files=["src/main.rs"]',
        "--notes=Important notes.",
        `--tickets=${ticketsPath}`,
      ], { encoding: "utf8" });
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      assert.fail(`異常終了 (exit=${e.status}): ${e.stderr}`);
    }

    // Background / Scope
    assert.ok(stdout.includes("## Background"));
    assert.ok(stdout.includes("## Scope"));
    assert.ok(stdout.includes("Scope A"));

    // Test Plan: Unit Tests
    assert.ok(stdout.includes("## Test Plan"));
    assert.ok(stdout.includes("### Unit Tests"));
    assert.ok(stdout.includes("UT: should pass"));
    assert.ok(stdout.includes("UT: edge case"));

    // Test Plan: Integration Tests
    assert.ok(stdout.includes("### Integration Tests"));
    assert.ok(stdout.includes("IT: module A + B integration"));
    assert.ok(stdout.includes("IT: cross-module flow"));

    // Test Plan: Exceptions
    assert.ok(stdout.includes("### Exceptions"));
    assert.ok(stdout.includes("E2E: cannot unit test"));

    // Other sections
    assert.ok(stdout.includes("## Implementation Target Files"));
    assert.ok(stdout.includes("src/main.rs"));
    assert.ok(stdout.includes("## Notes"));
    assert.ok(stdout.includes("Important notes."));

    // Tickets.json 検証
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    const t = tickets.phases[0].tickets[0];
    assert.strictEqual(t.background, "Conversation background.");
    assert.deepStrictEqual(t.scope, ["Scope A", "Scope B"]);
    assert.deepStrictEqual(t.testUnit, ["UT: should pass", "UT: edge case"]);
    assert.deepStrictEqual(t.testIntegration, ["IT: module A + B integration", "IT: cross-module flow"]);
    assert.deepStrictEqual(t.testExceptions, ["E2E: cannot unit test"]);
    assert.deepStrictEqual(t.default_files, ["src/main.rs"]);
    assert.strictEqual(t.notes, "Important notes.");
    // specPath は保存されているが spec ファイルは作成されない
    assert.ok(typeof t.specPath === "string", "specPath が保存されている");
    assert.ok(!fs.existsSync(t.specPath), "spec ファイルはまだ作成されていない");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("--title なし → エラー終了 (exit=1)", function () {
    const { dir, ticketsPath } = createTicketsJson();
    try {
      execFileSync(process.execPath, [ SCRIPT,
        "--ticket-key=PX-9997", `--tickets=${ticketsPath}`,
      ], { encoding: "utf8" });
      fs.rmSync(dir, { recursive: true, force: true });
      assert.fail("エラー終了しなかった");
    } catch (e) {
      assert.strictEqual(e.status, 1);
      assert.ok(e.stderr.includes("--title"));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--ticket-key なし → エラー終了 (exit=1)", function () {
    const { dir, ticketsPath } = createTicketsJson();
    try {
      execFileSync(process.execPath, [ SCRIPT,
        "--title=No Key", `--tickets=${ticketsPath}`,
      ], { encoding: "utf8" });
      fs.rmSync(dir, { recursive: true, force: true });
      assert.fail("エラー終了しなかった");
    } catch (e) {
      assert.strictEqual(e.status, 1);
      assert.ok(e.stderr.includes("--ticket-key"));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ensure-ticket — resolveSpecPath / generateSlug", function () {
  it("extractTicketId: PX-53 → 53", () => {
    assert.strictEqual(extractTicketId("PX-53"), 53);
  });
  it("extractTicketId: P0-1 → 1", () => {
    assert.strictEqual(extractTicketId("P0-1"), 1);
  });
  it("extractTicketId: no number → null", () => {
    assert.strictEqual(extractTicketId("PX-"), null);
  });
  it("generateSlug: normal title", () => {
    assert.strictEqual(generateSlug("Minimal Test"), "minimal-test");
  });
  it("generateSlug: special chars", () => {
    assert.strictEqual(generateSlug("Fix #123! @Home"), "fix-123-home");
  });
  it("resolveSpecPath: PX-9999 + 'Minimal Test'", () => {
    const p = resolveSpecPath("PX-9999", "Minimal Test");
    assert.ok(p.endsWith("9999-minimal-test.md"), `ends with 9999-minimal-test.md: ${p}`);
    assert.ok(p.includes("tickets/specs"), `includes tickets/specs: ${p}`);
  });
  it("resolveSpecPath: PX- → null", () => {
    assert.strictEqual(resolveSpecPath("PX-", "test"), null);
  });
});
