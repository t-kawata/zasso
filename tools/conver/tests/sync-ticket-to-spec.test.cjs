/**
 * sync-ticket-to-spec.test.cjs — sync-ticket-to-spec.js の単体テスト
 *
 * テスト対象: writeFieldsToSpec
 * appendToSpec は既存のセクション見出しをスキップする（冪等）。
 * そのためテストでは、テンプレートに存在しないセクション見出しを使用する。
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { writeFieldsToSpec } = require("../.claude/scripts/tickets/sync-ticket-to-spec");

function emptySpec() {
  return "# 0042: Test Ticket\n\n";
}

describe("sync-ticket-to-spec — writeFieldsToSpec", function () {
  let dir, specPath;

  before(function () { dir = fs.mkdtempSync(path.join(os.tmpdir(), "sts-")); });
  after(function () { fs.rmSync(dir, { recursive: true, force: true }); });

  function setupSpec(content) {
    specPath = path.join(dir, "test-spec.md");
    fs.writeFileSync(specPath, content || emptySpec(), "utf8");
  }

  it("background を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { background: "Test background." });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("## Background"));
    assert.ok(content.includes("Test background."));
  });

  it("scope を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { scope: ["Scope item 1", "Scope item 2"] });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("- Scope item 1"));
    assert.ok(content.includes("- Scope item 2"));
  });

  it("default_files を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { default_files: ["src/main.rs"] });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("## Implementation Target Files"));
    assert.ok(content.includes("src/main.rs"));
  });

  it("testUnit / testIntegration / testExceptions を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, {
      testUnit: ["UT: unit test"],
      testIntegration: ["IT: integration test"],
      testExceptions: ["Cannot test"],
    });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("### Unit Tests"));
    assert.ok(content.includes("UT: unit test"));
    assert.ok(content.includes("### Integration Tests"));
    assert.ok(content.includes("IT: integration test"));
    assert.ok(content.includes("### Exceptions"));
    assert.ok(content.includes("Cannot test"));
  });

  it("investigation を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { investigation: "src/foo.rs:42 — パースエラーを確認" });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("## Investigation"));
    assert.ok(content.includes("src/foo.rs:42"));
  });

  it("notes を転記する", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { notes: "Implementation notes." });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(content.includes("## Notes"));
    assert.ok(content.includes("Implementation notes."));
  });

  it("既存セクションはスキップされる（冪等性）", function () {
    setupSpec();
    // デフォルトファイルはテンプレートに存在しない → 1回目は書き込まれる
    writeFieldsToSpec(specPath, { default_files: ["src/main.rs"] });
    const afterFirst = fs.readFileSync(specPath, "utf8");
    assert.ok(afterFirst.includes("src/main.rs"));

    // 2回目は同一セクション見出しが存在するためスキップ
    writeFieldsToSpec(specPath, { default_files: ["src/other.rs"] });
    const afterSecond = fs.readFileSync(specPath, "utf8");
    assert.ok(afterSecond.includes("src/main.rs"), "初回の内容が維持される");
    assert.ok(!afterSecond.includes("src/other.rs"), "2回目はスキップされる");
  });

  it("空フィールドは何も書き込まない", function () {
    setupSpec();
    writeFieldsToSpec(specPath, { background: "", scope: [], testUnit: [] });
    const content = fs.readFileSync(specPath, "utf8");
    assert.ok(!content.includes("## Background"), "空の background は書き込まれない");
  });
});
