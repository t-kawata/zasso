/**
 * pipeline-merge.test.cjs — Step 3.5 パイプライン結合テスト
 *
 * テスト対象: runPipeline
 * カバレッジ: 2ケース（データ一貫性 / 全スクリプト直列実行）
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { runPipeline } = require("../.claude/scripts/tickets/run-step-3.5");

describe("run-step-3.5 — runPipeline", function () {
  let tmpDir;
  let omissionsPath;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
    omissionsPath = path.join(tmpDir, "OMISSIONS-003.json");

    // 過去 OMISSIONS
    fs.writeFileSync(
      path.join(tmpDir, "OMISSIONS-001.json"),
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        rfcUnderstanding: {
          purpose: "構築: 高可用性ログ収集システム",
          goals: "達成目標: uptime 99.9%\n達成目標: 低レイテンシログ収集",
          successCriteria: ["GET /apiv1/logs が 200"],
        },
        omissions: [
          { id: "O-001", type: "bug", description: "Old bug", severity: "high", rfcSection: "§3", affectedFiles: ["src/foo.ts"] },
        ],
      })
    );

    // 現在の OMISSIONS
    fs.writeFileSync(
      omissionsPath,
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        rfcUnderstanding: {
          purpose: "構築: 高可用性ログ収集システム",
          goals: "達成目標: uptime 99.9%\n達成目標: 低レイテンシログ収集",
          successCriteria: ["GET /apiv1/logs が 200"],
        },
        omissions: [
          { id: "O-002", type: "bug", description: "高可用性ログ収集 uptime にバグ", severity: "high", rfcSection: "§3", affectedFiles: ["src/foo.ts"] },
          { id: "O-003", type: "stub_remaining", description: "Stub exists", severity: "low", rfcSection: "§5", affectedFiles: ["src/stub.ts"] },
          { id: "O-004", type: "cosmetic", description: "コメント", severity: "low", rfcSection: "§7", affectedFiles: ["src/comment.ts"] },
        ],
      })
    );
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Case 1: データ形式の一貫性 — 各ステージの出力が正しい形状", function () {
    const result = runPipeline(omissionsPath);
    assert.strictEqual(result.success, true);

    assert.ok(Array.isArray(result.dedupResult.autoSkipped));
    assert.ok(Array.isArray(result.dedupResult.downgraded));
    assert.ok(Array.isArray(result.dedupResult.repeatedAreas));
    assert.ok(Array.isArray(result.dedupResult.pendingForAI));

    assert.ok(Array.isArray(result.materialityScores));
    for (const score of result.materialityScores) {
      assert.ok(typeof score.id === "string");
      assert.ok(typeof score.score === "number");
      assert.ok(typeof score.breakdown === "object");
      assert.ok(typeof score.recommendedSeverity === "string");
    }

    assert.ok(typeof result.trend.isDiverging === "boolean");
    assert.ok(typeof result.trend.warning === "string");
  });

  it("Case 2: 全3スクリプト直列実行 — 処理結果の検証", function () {
    const result = runPipeline(omissionsPath);
    assert.strictEqual(result.success, true);

    const hasSkip = result.dedupResult.autoSkipped.some(function (s) { return s.id === "O-002"; });
    assert.strictEqual(hasSkip, true);

    const hasDowngrade = result.dedupResult.downgraded.some(function (d) { return d.id === "O-003"; });
    assert.strictEqual(hasDowngrade, true);

    assert.strictEqual(result.dedupResult.pendingForAI.length, 2);
    var pendingIds = result.dedupResult.pendingForAI.map(function (p) { return p.id; }).sort();
    assert.strictEqual(pendingIds[0], "O-003");
    assert.strictEqual(pendingIds[1], "O-004");

    assert.strictEqual(result.materialityScores.length, 3);
    assert.ok(result.trend.lowRatioTrend !== "insufficient_data");
  });
});
