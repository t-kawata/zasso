/**
 * diminishing-returns.test.cjs — 発散/収束時系列分析のテスト
 *
 * テスト対象: analyzeTrend, loadAndAnalyze
 * カバレッジ: 5ケース（正常系3 / 境界値2）
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { analyzeTrend, loadAndAnalyze } = require("../.claude/scripts/tickets/diminishing-returns");

describe("diminishing-returns — analyzeTrend", function () {
  // --- 正常系: Case 1: low 比率増加・発散 ---
  it("Case 1: low 比率が増加傾向（33% → 50% → 78%）→ 発散", function () {
    const data = [
      { round: 1, total: 12, high: 3, medium: 5, low: 4 },
      { round: 2, total: 8, high: 1, medium: 3, low: 4 },
      { round: 3, total: 9, high: 0, medium: 2, low: 7 },
    ];

    const result = analyzeTrend(data);
    assert.strictEqual(result.isDiverging, true);
    assert.strictEqual(result.lowRatioTrend, "increasing");
    assert.strictEqual(result.warning.indexOf("発散傾向") !== -1, true);
  });

  // --- 正常系: Case 2: low 比率減少・収束 ---
  it("Case 2: low 比率が減少傾向（60% → 40% → 20%）→ 収束", function () {
    const data = [
      { round: 1, total: 10, high: 1, medium: 3, low: 6 },
      { round: 2, total: 10, high: 2, medium: 4, low: 4 },
      { round: 3, total: 10, high: 3, medium: 5, low: 2 },
    ];

    const result = analyzeTrend(data);
    assert.strictEqual(result.isDiverging, false);
    assert.strictEqual(result.lowRatioTrend, "decreasing");
    assert.strictEqual(result.warning.indexOf("収束傾向") !== -1, true);
  });

  // --- 正常系: Case 3: 前回比で total 増加 ---
  it("Case 3: 前回比で omission 総数が増加 → total_increased フラグ", function () {
    const data = [
      { round: 1, total: 5, high: 1, medium: 2, low: 2 },
      { round: 2, total: 8, high: 2, medium: 4, low: 2 },
    ];

    const result = analyzeTrend(data);
    assert.strictEqual(result.isDiverging, true);
    assert.strictEqual(result.totalTrend, "increasing");
    assert.strictEqual(result.divergingFlags.indexOf("total_increased") !== -1, true);
  });

  // --- 境界値: Case 4: 履歴1件のみ ---
  it("Case 4: OMISSIONS 履歴が1件のみ → insufficient_data", function () {
    const data = [
      { round: 1, total: 10, high: 2, medium: 4, low: 4 },
    ];

    const result = analyzeTrend(data);
    assert.strictEqual(result.isDiverging, false);
    assert.strictEqual(result.lowRatioTrend, "insufficient_data");
    assert.strictEqual(result.warning.indexOf("データ不足") !== -1, true);
  });

  // --- 境界値: Case 5: low 比率 50% だが増加傾向でない ---
  it("Case 5: low 比率 50% だが増加傾向でない → 注意レベル", function () {
    const data = [
      { round: 1, total: 10, high: 2, medium: 3, low: 5 },
      { round: 2, total: 8, high: 1, medium: 3, low: 4 },
    ];

    const result = analyzeTrend(data);
    assert.strictEqual(result.isDiverging, false);
    assert.strictEqual(result.lowRatioTrend, "stable");
    assert.strictEqual(result.warning.indexOf("収束傾向") !== -1, true);
  });
});

describe("diminishing-returns — loadAndAnalyze", function () {
  let tmpDir;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diminishing-test-"));
    const omissionsPath = path.join(tmpDir, "OMISSIONS-001.json");

    fs.writeFileSync(
      omissionsPath,
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        omissions: [
          { id: "O-001", type: "bug", severity: "high" },
          { id: "O-002", type: "bug", severity: "medium" },
          { id: "O-003", type: "cosmetic", severity: "low" },
          { id: "O-004", type: "cosmetic", severity: "low" },
        ],
      })
    );
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("単一ファイルの分析", function () {
    const r = loadAndAnalyze(path.join(tmpDir, "OMISSIONS-001.json"));
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.analysisData.length, 1);
    assert.strictEqual(r.analysisData[0].total, 4);
    assert.strictEqual(r.analysisData[0].high, 1);
    assert.strictEqual(r.analysisData[0].medium, 1);
    assert.strictEqual(r.analysisData[0].low, 2);
  });

  it("ファイル不在 → error", function () {
    const r = loadAndAnalyze("/nonexistent");
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.error.indexOf("not found") !== -1, true);
  });
});
