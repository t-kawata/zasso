/**
 * run-step-3.5.js — Step 3.5 機械的フィルタリングパイプライン
 *
 * 3つの決定論スクリプトを直列実行するパイプラインエントリポイント。
 *
 * 実行順序:
 *   dedup-omissions-by-history.js (重複排除)
 *     → materiality-filter.js (Goal 阻害度スコアリング)
 *     → diminishing-returns.js (発散/収束判定)
 *
 * Usage:
 *   node run-step-3.5.js <OMISSIONS_PATH>
 */

const path = require("path");

const { dedupFile } = require("./dedup-omissions-by-history");
const { scoreAllOmissions } = require("./materiality-filter");
const { loadAndAnalyze } = require("./diminishing-returns");

/**
 * Step 3.5 パイプライン全体を実行する。
 *
 * @param {string} omissionsPath - OMISSIONS JSON ファイルのパス
 * @returns {{ success: boolean, dedupResult?: object, materialityScores?: object[], trend?: object, error?: string }}
 */
function runPipeline(omissionsPath) {
  const resolvedPath = path.resolve(omissionsPath);

  const dedupResult = dedupFile(resolvedPath);
  if (!dedupResult.success) {
    return { success: false, error: "dedup failed: " + dedupResult.error, stage: "dedup" };
  }

  const materialityResult = scoreAllOmissions(resolvedPath);
  if (!materialityResult.success) {
    return { success: false, error: "materiality-filter failed: " + materialityResult.error, stage: "materiality" };
  }

  const trendResult = loadAndAnalyze(path.dirname(resolvedPath));
  if (!trendResult.success) {
    return { success: false, error: "diminishing-returns failed: " + trendResult.error, stage: "diminishing" };
  }

  return {
    success: true,
    dedupResult: dedupResult.result,
    materialityScores: materialityResult.scores,
    trend: trendResult.trend,
  };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node run-step-3.5.js <OMISSIONS_PATH>" }));
    process.exit(1);
  }

  const output = runPipeline(filePath);
  console.log(JSON.stringify(output, null, 2));
  if (!output.success) process.exit(1);
}

if (require.main === module) main();

module.exports = { runPipeline };
