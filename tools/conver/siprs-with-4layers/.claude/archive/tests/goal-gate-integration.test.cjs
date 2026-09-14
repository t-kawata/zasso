/**
 * goal-gate-integration.test.cjs — Step 4 パイプライン統合テスト
 *
 * テスト対象: runPipeline（run-step-3.5.js）
 * カバレッジ: 4ケース（正常系2 / 異常系1 / 境界値1）
 *
 * pipeline-merge.test.cjs が runPipeline の内部整合性を検証するのに対し、
 * 本テストは find-omissions ワークフローの Step 4 としての統合動作を保証する。
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { runPipeline } = require("../.claude/scripts/tickets/run-step-3.5");

/**
 * テスト用 OMISSIONS JSON の本文を構築する。
 *
 * @param {object[]} omissions  omission 配列
 * @param {object} [overrides]  rfcUnderstanding の上書き
 * @returns {object} OMISSIONS JSON 本体
 */
function buildOmissionFile(omissions, overrides) {
  return {
    parentRfcPath: "/test/rfc.md",
    rfcUnderstanding: Object.assign(
      {
        purpose: "構築: 高可用性ログ収集システム",
        goals: "達成目標: uptime 99.9%\n達成目標: 低レイテンシログ収集",
        successCriteria: ["GET /apiv1/logs が 200"],
        architecture: "",
        componentRelations: "",
      },
      overrides || {}
    ),
    omissions: omissions,
  };
}

/**
 * テスト用 omission エントリを生成する。
 *
 * @param {string} id  omission ID（例: "O-001"）
 * @param {object} [overrides]  上書きプロパティ
 * @returns {object} omission エントリ
 */
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

describe("goal-gate-integration — runPipeline via find-omissions workflow", function () {
  let tmpDir;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "goal-gate-test-"));
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Case 1: 正常系 — 複数 omission 混在でパイプラインが正しく直列実行される", function () {
    const omissionsPath = path.join(tmpDir, "OMISSIONS-001.json");

    // 重複排除用の過去 OMISSIONS
    fs.writeFileSync(
      path.join(tmpDir, "OMISSIONS-000.json"),
      JSON.stringify(
        buildOmissionFile([
          createOmission("O-old-01", {
            description: "既存の重複 omission",
            severity: "high",
          }),
        ])
      )
    );

    // 現在の OMISSIONS: medium + low + stub_remaining + cosmetic 混在
    fs.writeFileSync(
      omissionsPath,
      JSON.stringify(
        buildOmissionFile([
          createOmission("O-001", {
            description: "既存の重複 omission（履歴と重複）",
            severity: "high",
          }),
          createOmission("O-002", {
            type: "stub_remaining",
            description: "スタブが残っている",
            severity: "low",
          }),
          createOmission("O-003", {
            type: "cosmetic",
            description: "コメント改善提案",
            severity: "low",
          }),
        ])
      )
    );

    const result = runPipeline(omissionsPath);
    assert.strictEqual(result.success, true);

    // dedup: O-001（重複）は autoSkipped
    const skipped = result.dedupResult.autoSkipped.map(function (s) { return s.id; });
    assert.ok(skipped.includes("O-001"), "履歴と重複する O-001 が autoSkipped される");

    // materiality: 全 omission（autoSkipped を含む）にスコアが付与されている
    assert.strictEqual(result.materialityScores.length, 3, "全3件に materiality スコアが付与される");
    for (const score of result.materialityScores) {
      assert.ok(typeof score.id === "string");
      assert.ok(typeof score.score === "number");
      assert.ok(typeof score.recommendedSeverity === "string");
    }

    // O-001（重複 autoSkipped）は materiality で cosmetic に格下げされる
    const o001Score = result.materialityScores.find(function (s) { return s.id === "O-001"; });
    assert.strictEqual(o001Score.recommendedSeverity, "cosmetic", "autoSkipped された重複 omission は cosmetic に格下げ");

    // diminishing: trend 情報が存在する
    assert.ok(typeof result.trend.isDiverging === "boolean");
    assert.ok(typeof result.trend.warning === "string");
  });

  it("Case 2: 正常系 — cosmetic のみの omission が Goal Gate を通過する", function () {
    const passPath = path.join(tmpDir, "OMISSIONS-002.json");

    fs.writeFileSync(
      passPath,
      JSON.stringify(
        buildOmissionFile([
          createOmission("O-010", {
            type: "cosmetic",
            description: "軽微なコメントミス",
            severity: "low",
          }),
          createOmission("O-011", {
            type: "cosmetic",
            description: "変数名のスタイル統一",
            severity: "low",
          }),
        ])
      )
    );

    const result = runPipeline(passPath);
    assert.strictEqual(result.success, true);

    // cosmetic のみ → 全件の recommendedSeverity が cosmetic になる
    // （trend.warning は diminishing-returns により発散傾向を示す可能性があるが、
    //   それは Goal Gate の通過可否判断ではなく、cosmetic のみなので問題ない）
    assert.strictEqual(result.materialityScores.length, 2);
    for (const score of result.materialityScores) {
      assert.strictEqual(
        score.recommendedSeverity,
        "cosmetic",
        "cosmetic omission は全て cosmetic 判定になる（score=" + score.score + "）"
      );
    }
  });

  it("Case 3: 異常系 — 空の omissions 配列でもエラーにならない", function () {
    const emptyPath = path.join(tmpDir, "OMISSIONS-003.json");

    fs.writeFileSync(emptyPath, JSON.stringify(buildOmissionFile([])));

    const result = runPipeline(emptyPath);
    assert.strictEqual(result.success, true);

    assert.ok(Array.isArray(result.dedupResult.pendingForAI));
    assert.strictEqual(result.dedupResult.pendingForAI.length, 0, "空配列 → pendingForAI 0件");

    assert.strictEqual(result.materialityScores.length, 0, "空配列 → materialityScores 0件");

    assert.strictEqual(result.trend.isDiverging, false, "空配列 → 発散なし");
  });

  it("Case 4: 境界値 — low 比率 50% 超の履歴で発散傾向を検出する", function () {
    const divPath = path.join(tmpDir, "OMISSIONS-004.json");

    // low 多数の過去 OMISSIONS（3/5 = 60% > 50%）
    fs.writeFileSync(
      path.join(tmpDir, "OMISSIONS-001.json"),
      JSON.stringify(
        buildOmissionFile([
          createOmission("O-h1", { severity: "high", type: "bug" }),
          createOmission("O-h2", { severity: "high", type: "bug" }),
          createOmission("O-l1", { severity: "low", type: "cosmetic" }),
          createOmission("O-l2", { severity: "low", type: "cosmetic" }),
          createOmission("O-l3", { severity: "low", type: "cosmetic" }),
        ])
      )
    );

    fs.writeFileSync(
      divPath,
      JSON.stringify(
        buildOmissionFile([
          createOmission("O-020", {
            type: "cosmetic",
            description: "新しい cosmetic omission",
            severity: "low",
          }),
        ])
      )
    );

    const result = runPipeline(divPath);
    assert.strictEqual(result.success, true);

    // 履歴 low 比率 60% > 50% → 発散傾向
    assert.strictEqual(
      result.trend.isDiverging,
      true,
      "low 比率 60% で発散傾向が検出されること"
    );
    assert.ok(
      result.trend.warning.length > 0,
      "発散傾向の警告メッセージが存在すること"
    );
  });
});
