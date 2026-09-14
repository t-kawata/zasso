/**
 * merge-omissions-into-root-rfc.test.cjs — helper script のテスト
 *
 * Design Contract の確認:
 *   このテストは helper script の機械的処理（バリデーション、frontmatter 操作、
 *   セクション抽出）が正しく動作することを検証する。
 *   「どの §N をどの既存セクションにマージするか」の意味的判断はテストしない。
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const script = require("../.claude/scripts/tickets/merge-omissions-into-root-rfc");

describe("merge-omissions-into-root-rfc — validateArgs", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-test-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("引数不足 → { success: false }", () => {
    const r1 = script.validateArgs();
    assert.strictEqual(r1.success, false);
    const r2 = script.validateArgs("/some/path");
    assert.strictEqual(r2.success, false);
  });

  it("ファイル不在 → { success: false }", () => {
    const r = script.validateArgs("/nonexistent/source.md", "/nonexistent/target.md");
    assert.strictEqual(r.success, false);
  });

  it("両ファイル存在 + parent-rfc 一致 → { success: true }", () => {
    const sourcePath = path.join(tmpDir, "RFC_OMISSIONS-001.md");
    const targetPath = path.join(tmpDir, "RFC_ROOT.md");
    fs.writeFileSync(targetPath, "# RFC_ROOT\n", "utf8");
    fs.writeFileSync(
      sourcePath,
      `---
parent-rfc: ${targetPath}
---

# RFC OMISSIONS-001
`,
      "utf8",
    );
    const r = script.validateArgs(sourcePath, targetPath);
    assert.strictEqual(r.success, true);
  });

  it("parent-rfc 不一致 → { success: false }", () => {
    const sourcePath = path.join(tmpDir, "RFC_OMISSIONS-002.md");
    const targetPath = path.join(tmpDir, "RFC_ROOT.md");
    fs.writeFileSync(sourcePath, "---\nparent-rfc: /different/RFC_ROOT.md\n---\n# RFC OMISSIONS-002\n", "utf8");
    const r = script.validateArgs(sourcePath, targetPath);
    assert.strictEqual(r.success, false);
    assert.ok(r.error.includes("parent-rfc"));
  });
});

describe("merge-omissions-into-root-rfc — readFrontmatter / writeFrontmatter", () => {
  let tmpFile;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-test-"));
    tmpFile = path.join(tmpDir, "test.md");
  });

  it("frontmatter なし → null", () => {
    fs.writeFileSync(tmpFile, "# No Frontmatter\n", "utf8");
    const fm = script.readFrontmatter(tmpFile);
    assert.strictEqual(fm, null);
  });

  it("frontmatter あり → 読み取り可能", () => {
    fs.writeFileSync(
      tmpFile,
      `---
title: RFC-001 conver.js
generatedAt: 2026-06-25
---

# Content
`,
      "utf8",
    );
    const fm = script.readFrontmatter(tmpFile);
    assert.notStrictEqual(fm, null);
    assert.strictEqual(fm["title"], "RFC-001 conver.js");
  });

  it("writeFrontmatter: 新規追加", () => {
    fs.writeFileSync(tmpFile, "# Just Content\n", "utf8");
    script.writeFrontmatter(tmpFile, { title: "New RFC", generatedAt: "2026-06-29" });
    const fm = script.readFrontmatter(tmpFile);
    assert.strictEqual(fm["title"], "New RFC");
    const content = fs.readFileSync(tmpFile, "utf8");
    assert.ok(content.includes("# Just Content"));
  });

  it("writeFrontmatter: 既存 frontmatter を置換", () => {
    fs.writeFileSync(
      tmpFile,
      `---
title: Old Title
---

# Content
`,
      "utf8",
    );
    script.writeFrontmatter(tmpFile, { title: "New Title" });
    const fm = script.readFrontmatter(tmpFile);
    assert.strictEqual(fm["title"], "New Title");
  });
});

describe("merge-omissions-into-root-rfc — addMergeHistory", () => {
  let targetFile;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-test-"));
    targetFile = path.join(tmpDir, "RFC_ROOT.md");
  });

  it("frontmatter なし → merge-history を新規追加", () => {
    fs.writeFileSync(targetFile, "# RFC_ROOT\n", "utf8");
    const r = script.addMergeHistory(targetFile, "RFC_OMISSIONS-001.md", ["O-001", "O-002"], "2026-06-29");
    assert.strictEqual(r.success, true);
    const fm = script.readFrontmatter(targetFile);
    assert.ok(Array.isArray(fm["merge-history"]));
    assert.strictEqual(fm["merge-history"].length, 1);
    assert.strictEqual(fm["merge-history"][0].source, "RFC_OMISSIONS-001.md");
  });

  it("既存 frontmatter → merge-history を追記", () => {
    script.addMergeHistory(targetFile, "RFC_OMISSIONS-002.md", ["O-003"], "2026-06-30");
    const fm = script.readFrontmatter(targetFile);
    assert.strictEqual(fm["merge-history"].length, 2);
  });

  it("同一 source → 重複追加しない", () => {
    const r = script.addMergeHistory(targetFile, "RFC_OMISSIONS-001.md", ["O-001"], "2026-06-29");
    assert.strictEqual(r.skipped, true);
    const fm = script.readFrontmatter(targetFile);
    assert.strictEqual(fm["merge-history"].length, 2);
  });
});

describe("merge-omissions-into-root-rfc — extractSections", () => {
  let sourceFile;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-test-"));
    sourceFile = path.join(tmpDir, "RFC_OMISSIONS-001.md");
    fs.writeFileSync(
      sourceFile,
      `---
parent-rfc: RFC_ROOT.md
---

# RFC OMISSIONS-001

## Design

### §1 起動パラメータログの完全化（O-001）

決定: key=value 形式で表示する。

### §2 ファイルパスの絶対パス変換（O-002）

決定: path.resolve() を使用する。

### §3 ラストセクション（O-003）

末尾のセクション。
`,
      "utf8",
    );
  });

  it("ファイル不在 → { success: false }", () => {
    const r = script.extractSections("/nonexistent.md");
    assert.strictEqual(r.success, false);
  });

  it("正常系: 3つの §N セクションを抽出", () => {
    const r = script.extractSections(sourceFile);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.count, 3);
    assert.strictEqual(r.sections.length, 3);
  });

  it("セクション情報が正しい", () => {
    const r = script.extractSections(sourceFile);
    const s1 = r.sections[0];
    assert.strictEqual(s1.id, "§1");
    assert.strictEqual(s1.number, 1);
    assert.strictEqual(s1.title, "起動パラメータログの完全化（O-001）");
    assert.strictEqual(s1.omissionId, "O-001");
    assert.ok(s1.content.includes("key=value"));
  });

  it("§N の omissionId が正しく抽出される", () => {
    const r = script.extractSections(sourceFile);
    assert.strictEqual(r.sections[0].omissionId, "O-001");
    assert.strictEqual(r.sections[1].omissionId, "O-002");
    assert.strictEqual(r.sections[2].omissionId, "O-003");
  });

  it("セクションの content に正しい全文が含まれる", () => {
    const r = script.extractSections(sourceFile);
    assert.ok(r.sections[0].content.includes("決定: key=value"));
    assert.ok(!r.sections[0].content.includes("§2"));
    assert.ok(r.sections[2].content.includes("末尾のセクション"));
  });
});
