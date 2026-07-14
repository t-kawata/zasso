/**
 * ensure-ticket-and-spec.integration.test.cjs — 結合テスト
 */

const assert = require("node:assert");
const { describe, it, after } = require("node:test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SPECS_DIR = path.resolve(__dirname, "../..", "tickets", "specs");
const SCRIPT = path.resolve(__dirname, "../.claude/scripts/tickets/ensure-ticket-and-spec.js");

function createTicketsJson() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-int-"));
  const ticketsPath = path.join(dir, "Tickets.json");
  const ticketsJson = {
    title: "Test Tickets",
    phases: [{ id: -1, name: "PX", ticketKeyPrefix: "PX", tickets: [] }],
    metadata: { source: "x", generatedAt: "2026-07-14" },
  };
  fs.writeFileSync(ticketsPath, JSON.stringify(ticketsJson, null, 2) + "\n");
  return { dir, ticketsPath };
}

function cleanSpecFiles() {
  if (fs.existsSync(SPECS_DIR)) {
    for (const f of fs.readdirSync(SPECS_DIR)) {
      if (f.includes("integration-test-ticket")) {
        fs.rmSync(path.join(SPECS_DIR, f), { force: true });
      }
    }
  }
}

describe("ensure-ticket-and-spec — integration", function () {
  after(function () { cleanSpecFiles(); });

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
    assert.ok(fs.existsSync(tickets.phases[0].tickets[0].specPath));
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
    assert.ok(fs.existsSync(t.specPath));

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
