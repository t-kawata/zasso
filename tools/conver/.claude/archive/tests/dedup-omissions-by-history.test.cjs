/**
 * dedup-omissions-by-history.test.cjs — 重複排除スクリプトのテスト
 *
 * テスト対象: filterDuplicates, findRepeatedFile, dedupFile
 * カバレッジ: 6ケース（正常系3 / 異常系1 / 境界値2）
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { filterDuplicates, findRepeatedFile, dedupFile } = require("../.claude/scripts/tickets/dedup-omissions-by-history");

// --- テストデータ ---

function createOmission(id, overrides) {
  return Object.assign(
    {
      id: id,
      type: "missing_implementation",
      description: "Test omission " + id,
      severity: "medium",
      rfcSection: "§5",
      suggestedResolution: "Fix it",
      affectedFiles: ["src/foo.ts"],
    },
    overrides || {}
  );
}

describe("dedup-omissions-by-history — filterDuplicates", function () {
  // --- 正常系: Case 1: 完全重複 ---
  it("Case 1: 完全重複（同一ファイル + 同一セクション + 同一种別）→ autoSkipped", function () {
    const current = [createOmission("O-003", { type: "bug", rfcSection: "§3", affectedFiles: ["src/bar.ts"] })];
    const history = [createOmission("O-001", { type: "bug", rfcSection: "§3", affectedFiles: ["src/bar.ts"] })];

    const result = filterDuplicates(current, history, []);
    assert.strictEqual(result.autoSkipped.length, 1);
    assert.strictEqual(result.autoSkipped[0].id, "O-003");
    assert.strictEqual(result.pendingForAI.length, 0);
  });

  // --- 正常系: Case 2: stub_remaining 格下げ ---
  it("Case 2: low severity の stub_remaining → cosmetic に格下げ", function () {
    const current = [
      createOmission("O-003", { type: "stub_remaining", severity: "low", affectedFiles: ["src/stub.ts"] }),
    ];

    const result = filterDuplicates(current, [], []);
    assert.strictEqual(result.autoSkipped.length, 0);
    assert.strictEqual(result.downgraded.length, 1);
    assert.strictEqual(result.downgraded[0].id, "O-003");
    assert.strictEqual(result.downgraded[0].from, "low");
    assert.strictEqual(result.downgraded[0].to, "cosmetic");
    assert.strictEqual(result.pendingForAI[0].severity, "cosmetic");
  });

  // --- 正常系: Case 3: repeated_area タグ ---
  it("Case 3: 同一ファイルで3回以上連続 omission → repeated_area タグ", function () {
    const current = [createOmission("O-004", { affectedFiles: ["src/repeat.ts"] })];
    const historyFilesPerRound = [["src/repeat.ts"], ["src/repeat.ts"]];

    const result = filterDuplicates(current, [], historyFilesPerRound);
    assert.strictEqual(result.repeatedAreas.length, 1);
    assert.strictEqual(result.repeatedAreas[0].file, "src/repeat.ts");
    assert.strictEqual(result.pendingForAI[0].needsReview, true);
    assert.strictEqual(result.pendingForAI[0].tags.indexOf("repeated_area") !== -1, true);
  });

  // --- 異常系: Case 4: 履歴空 ---
  it("Case 4: 履歴 OMISSIONS が空 → 全 omission が pendingForAI", function () {
    const current = [createOmission("O-001"), createOmission("O-002")];
    const result = filterDuplicates(current, [], []);
    assert.strictEqual(result.autoSkipped.length, 0);
    assert.strictEqual(result.downgraded.length, 0);
    assert.strictEqual(result.repeatedAreas.length, 0);
    assert.strictEqual(result.pendingForAI.length, 2);
  });

  // --- 境界値: Case 5: 2回連続 → タグなし ---
  it("Case 5: 同一ファイルでちょうど2回連続 → タグなし", function () {
    const current = [createOmission("O-003", { affectedFiles: ["src/border.ts"] })];
    const historyFilesPerRound = [["src/border.ts"]];

    const result = filterDuplicates(current, [], historyFilesPerRound);
    assert.strictEqual(result.repeatedAreas.length, 0);
    assert.strictEqual(result.pendingForAI[0].tags, undefined);
  });

  // --- 境界値: Case 6: 複合ルール適用順 ---
  it("Case 6: Rule1（重複）優先 — 重複かつ stub_remaining でも重複として処理", function () {
    const current = [
      createOmission("O-005", {
        type: "stub_remaining",
        severity: "low",
        rfcSection: "§5",
        affectedFiles: ["src/stub.ts"],
      }),
    ];
    const history = [
      createOmission("O-001", {
        type: "stub_remaining",
        severity: "low",
        rfcSection: "§5",
        affectedFiles: ["src/stub.ts"],
      }),
    ];

    const result = filterDuplicates(current, history, []);
    assert.strictEqual(result.autoSkipped.length, 1);
    assert.strictEqual(result.downgraded.length, 0);
    assert.strictEqual(result.pendingForAI.length, 0);
  });
});

describe("dedup-omissions-by-history — findRepeatedFile", function () {
  it("null を返す: currentFiles が空", function () {
    assert.strictEqual(findRepeatedFile([], [["a.ts"], ["a.ts"]]), null);
  });

  it("ファイルを検出: 3ラウンド連続", function () {
    const result = findRepeatedFile(["target.ts"], [["target.ts"], ["target.ts"]]);
    assert.strictEqual(result, "target.ts");
  });

  it("null を返す: 連続が途切れている", function () {
    const result = findRepeatedFile(["target.ts"], [["target.ts"], ["other.ts"]]);
    assert.strictEqual(result, null);
  });
});

describe("dedup-omissions-by-history — dedupFile", function () {
  let tmpDir;
  let currentPath;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dedup-test-"));
    const historyPath = path.join(tmpDir, "OMISSIONS-001.json");
    currentPath = path.join(tmpDir, "OMISSIONS-002.json");

    fs.writeFileSync(
      historyPath,
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        omissions: [
          { id: "O-001", type: "bug", description: "Old bug", severity: "medium", rfcSection: "§3", affectedFiles: ["src/foo.ts"] },
        ],
      })
    );

    fs.writeFileSync(
      currentPath,
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        omissions: [
          { id: "O-002", type: "bug", description: "New bug (duplicate)", severity: "medium", rfcSection: "§3", affectedFiles: ["src/foo.ts"] },
          { id: "O-003", type: "missing_implementation", description: "New issue", severity: "low", rfcSection: "§5", affectedFiles: ["src/bar.ts"] },
        ],
      })
    );
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ファイル不在 → error", function () {
    const r = dedupFile("/nonexistent/path.json");
    assert.strictEqual(r.success, false);
  });

  it("重複排除が正しく動作する", function () {
    const r = dedupFile(currentPath);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.result.autoSkipped.length, 1);
    assert.strictEqual(r.result.autoSkipped[0].id, "O-002");
    assert.strictEqual(r.result.pendingForAI.length, 1);
    assert.strictEqual(r.result.pendingForAI[0].id, "O-003");
  });
});
