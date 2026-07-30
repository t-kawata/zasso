/**
 * materiality-filter.test.cjs — Goal 阻害度スコアリングのテスト
 *
 * テスト対象: scoreGoalBlocking, determineSeverity, scoreAllOmissions
 * カバレッジ: 5ケース（正常系3 / 境界値1 / 異常系1）
 *
 * 注意: 決定論マッチャーはサブストリングマッチング（4文字以上）を基本とする。
 * 日本語の助詞による表現揺れ（「ログを収集」vs「ログ収集」）はマッチしない。
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { scoreGoalBlocking, determineSeverity, scoreAllOmissions } = require("../.claude/scripts/tickets/materiality-filter");

// 決定論マッチャーが正しくマッチできるよう、
// 各層で使用するテキストを description に含める
const PURPOSE = "構築: 高可用性ログ収集システム";
const GOALS = [
  "達成目標: uptime 99.9%",
  "達成目標: 低レイテンシログ収集",
  "達成目標: 1日10TBデータ処理",
].join("\n");
const SUCCESS_CRITERIA = [
  "GET /api/v1/logs が 200 を返す",
  "POST /api/v1/logs が 201 を返す",
  "ログ検索が 500ms 以内で完了",
];

function createOmission(id, overrides) {
  return Object.assign(
    { id, type: "missing_implementation", description: "Test omission", severity: "medium", affectedFiles: [] },
    overrides || {}
  );
}

describe("materiality-filter — scoreGoalBlocking", function () {
  // --- 正常系: Case 1: 全阻害 ---
  it("Case 1: purpose + goals + successCriteria すべてを阻害 → score 6, medium", function () {
    const omission = createOmission("O-001", {
      description: "高可用性ログ収集システム uptime ログ収集 に障害",
      affectedFiles: ["src/logs/api.rs"],
    });

    const result = scoreGoalBlocking(omission, PURPOSE, GOALS, SUCCESS_CRITERIA);
    // purpose: "高可用性ログ収集システム" がマッチ → 3点
    // goals: "uptime"(goal1) + "ログ収集"(goal2) がマッチ → 2点（上限）
    // successCriteria: affectedFiles "api.rs" → "api" が "api/v1/logs" にマッチ → 1点
    assert.strictEqual(result.score, 6);
    assert.strictEqual(result.breakdown.purpose, 3);
    assert.strictEqual(result.breakdown.goals, 2);
    assert.strictEqual(result.breakdown.successCriteria, 1);
    assert.strictEqual(result.recommendedSeverity, "medium");
  });

  // --- 正常系: Case 2: 無阻害 ---
  it("Case 2: どの階層も阻害しない → score 0, cosmetic", function () {
    const omission = createOmission("O-002", {
      description: "コメントのインデントが不揃い",
      affectedFiles: ["src/unrelated.rs"],
    });

    const result = scoreGoalBlocking(omission, PURPOSE, GOALS, SUCCESS_CRITERIA);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.recommendedSeverity, "cosmetic");
  });

  // --- 正常系: Case 3: 一部阻害（successCriteria のみ）---
  it("Case 3: successCriteria のみ阻害 → score 1, low", function () {
    const omission = createOmission("O-003", {
      description: "apiv1logs API のレスポンスに問題",
      affectedFiles: [],
    });

    const result = scoreGoalBlocking(omission, PURPOSE, GOALS, SUCCESS_CRITERIA);
    assert.strictEqual(result.score, 1);
    assert.strictEqual(result.breakdown.successCriteria, 1);
    assert.strictEqual(result.recommendedSeverity, "low");
  });

  // --- 境界値: Case 4: goals/successCriteria が空 ---
  it("Case 4: goals と successCriteria が空 → purpose のみで評価", function () {
    const omission = createOmission("O-004", {
      description: "高可用性ログ収集システム のログ記録に問題",
      affectedFiles: [],
    });

    const result = scoreGoalBlocking(omission, PURPOSE, "", []);
    assert.strictEqual(result.score, 3);
    assert.strictEqual(result.breakdown.purpose, 3);
    assert.strictEqual(result.breakdown.goals, 0);
    assert.strictEqual(result.breakdown.successCriteria, 0);
    assert.strictEqual(result.recommendedSeverity, "medium");
  });

  // --- 異常系: Case 5: purpose が空 ---
  it("Case 5: purpose が空 → goals/successCriteria のみで評価", function () {
    const omission = createOmission("O-005", {
      description: "uptime ログ検索 に問題",
      affectedFiles: [],
    });

    const result = scoreGoalBlocking(omission, "", GOALS, SUCCESS_CRITERIA);
    assert.strictEqual(result.score, 2); // "uptime" match → goal1(2点) + "ログ検索" match → criteria(1点)
    assert.strictEqual(result.recommendedSeverity, "low");
  });
});

describe("materiality-filter — determineSeverity", function () {
  it("score 0 → cosmetic", function () { assert.strictEqual(determineSeverity(0), "cosmetic"); });
  it("score 1 → low", function () { assert.strictEqual(determineSeverity(1), "low"); });
  it("score 2 → low", function () { assert.strictEqual(determineSeverity(2), "low"); });
  it("score 3 → medium", function () { assert.strictEqual(determineSeverity(3), "medium"); });
  it("score 6 → medium", function () { assert.strictEqual(determineSeverity(6), "medium"); });
});

describe("materiality-filter — scoreAllOmissions", function () {
  let tmpDir;
  let omissionsPath;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "materiality-test-"));
    omissionsPath = path.join(tmpDir, "OMISSIONS-003.json");

    fs.writeFileSync(
      omissionsPath,
      JSON.stringify({
        parentRfcPath: "/test/rfc.md",
        rfcUnderstanding: {
          purpose: PURPOSE,
          goals: GOALS,
          successCriteria: SUCCESS_CRITERIA,
        },
        omissions: [
          createOmission("O-001", {
            description: "高可用性ログ収集システム uptime ログ収集 にバグ",
            severity: "medium",
            affectedFiles: ["src/logs/api.rs"],
          }),
          createOmission("O-002", {
            description: "コメントのインデント不揃い",
            severity: "low",
            affectedFiles: ["src/unrelated.rs"],
          }),
        ],
      })
    );
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ファイル不在 → error", function () {
    const r = scoreAllOmissions("/nonexistent/path.json");
    assert.strictEqual(r.success, false);
  });

  it("全 omission をスコアリング", function () {
    const r = scoreAllOmissions(omissionsPath);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.scores.length, 2);
    assert.strictEqual(r.scores[0].id, "O-001");
    assert.strictEqual(r.scores[0].score, 6);
    assert.strictEqual(r.scores[0].recommendedSeverity, "medium");
    assert.strictEqual(r.scores[1].id, "O-002");
    assert.strictEqual(r.scores[1].score, 0);
    assert.strictEqual(r.scores[1].recommendedSeverity, "cosmetic");
  });
});
