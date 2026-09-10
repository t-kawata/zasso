/**
 * run-step-3.5.js — Step 3.5 mechanical filtering pipeline
 *
 * Pipeline entry point that executes three deterministic scripts serially.
 *
 * Execution order:
 *   dedup-omissions-by-history.js (deduplication)
 *     → materiality-filter.js (Goal hindrance severity scoring)
 *     → diminishing-returns.js (divergence/convergence detection)
 *
 * Usage:
 *   node run-step-3.5.js <OMISSIONS_PATH>
 */

const path = require("path");

const { dedupFile } = require("./dedup-omissions-by-history");
const { scoreAllOmissions } = require("./materiality-filter");
const { loadAndAnalyze } = require("./diminishing-returns");

/**
 * Runs the entire Step 3.5 pipeline.
 *
 * @param {string} omissionsPath - path to the OMISSIONS JSON file
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
