/**
 * diminishing-returns.js — Time-series analysis of divergence/convergence
 *
 * Analyzes the time series of find loop iterations and omission discovery counts,
 * mechanically determining whether convergence or divergence is occurring. This script is 100% deterministic.
 *
 * Processing:
 * 1. Aggregate omission counts by type and severity across all OMISSIONS-*.json
 * 2. Calculate low / (high + medium + low) ratio trend
 * 3. Flag divergence if omission total increased vs previous round
 * 4. Warn of divergence if low ratio >= 50% and trending upward
 *
 * Usage:
 *   node diminishing-returns.js <OMISSIONS_DIR_OR_FILE>
 */

const fs = require("fs");
const path = require("path");

const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;

/**
 * Execute time-series analysis.
 *
 * @param {object[]} analysisData - analysis data array per round
 * @returns {{ isDiverging: boolean, lowRatioTrend: string, warning: string|null, details: object }}
 */
function analyzeTrend(analysisData) {
  const details = {
    rounds: analysisData,
    lowRatios: [],
    lowRatioTrend: "unknown",
    totalTrend: "stable",
    isDiverging: false,
    warning: null,
  };

  if (analysisData.length < 2) {
    return Object.assign(details, {
      lowRatioTrend: "insufficient_data",
      warning: "データ不足: 2ラウンド以上のデータが必要",
    });
  }

  // Calculate low ratio per round
  for (const round of analysisData) {
    const significantTotal = round.high + round.medium + round.low;
    details.lowRatios.push(significantTotal === 0 ? 0 : round.low / significantTotal);
  }

  // Low ratio trend (first vs last)
  const firstRatio = details.lowRatios[0];
  const lastRatio = details.lowRatios[details.lowRatios.length - 1];

  if (lastRatio > firstRatio) {
    details.lowRatioTrend = "increasing";
  } else if (lastRatio < firstRatio) {
    details.lowRatioTrend = "decreasing";
  } else {
    details.lowRatioTrend = "stable";
  }

  // Divergence flag check
  const divergingFlags = [];

  // Condition 1: total increased vs previous
  const lastRound = analysisData[analysisData.length - 1];
  const prevRound = analysisData[analysisData.length - 2];
  if (lastRound.total > prevRound.total) {
    divergingFlags.push("total_increased");
    details.totalTrend = "increasing";
  } else if (lastRound.total < prevRound.total) {
    details.totalTrend = "decreasing";
  }

  // Condition 2: low ratio >= 50% and increasing
  if (lastRatio >= 0.5 && details.lowRatioTrend === "increasing") {
    divergingFlags.push("low_ratio_high_and_increasing");
  }

  details.isDiverging = divergingFlags.length > 0;
  details.divergingFlags = divergingFlags;

  if (details.isDiverging) {
    const lowRatioPct = (lastRatio * 100).toFixed(0);
    if (divergingFlags.indexOf("low_ratio_high_and_increasing") !== -1 &&
        divergingFlags.indexOf("total_increased") !== -1) {
      details.warning = "発散傾向アリ（low 比率 " + lowRatioPct + "% かつ増加、total も増加）";
    } else if (divergingFlags.indexOf("low_ratio_high_and_increasing") !== -1) {
      details.warning = "注意: low 比率 " + lowRatioPct + "% かつ増加傾向（total は減少または横ばい）";
    } else if (divergingFlags.indexOf("total_increased") !== -1) {
      details.warning = "注意: 前回比で omission 総数が増加（low 比率は安定または減少）";
    }
  } else {
    details.warning = "収束傾向: omission 数は減少または安定、low 比率も改善";
  }

  return details;
}

/**
 * Read OMISSIONS files and generate per-round aggregation data.
 *
 * @param {string} targetPath - OMISSIONS JSON file or directory
 * @returns {{ success: boolean, analysisData?: object[], trend?: object, error?: string }}
 */
function loadAndAnalyze(targetPath) {
  const resolvedPath = path.resolve(targetPath);
  let files = [];

  try {
    if (fs.statSync(resolvedPath).isDirectory()) {
      const entries = fs.readdirSync(resolvedPath);
      files = entries
        .filter(function (name) { return OMISSION_FILE_RE.test(name); })
        .map(function (name) { return path.join(resolvedPath, name); })
        .sort();
    } else {
      files = [resolvedPath];
    }
  } catch (_) {
    return { success: false, error: "Target not found: " + targetPath };
  }

  if (files.length === 0) {
    return { success: false, error: "No OMISSIONS-XXX.json files found" };
  }

  const analysisData = [];

  for (const filePath of files) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const omissions = data.omissions || [];
      const match = path.basename(filePath).match(OMISSION_FILE_RE);
      const round = match ? parseInt(match[1], 10) : 0;

      let high = 0, medium = 0, low = 0;
      for (const o of omissions) {
        if (o.severity === "high" || o.severity === "critical") high++;
        else if (o.severity === "medium") medium++;
        else if (o.severity === "low") low++;
      }

      analysisData.push({
        round: round,
        total: omissions.length,
        high: high,
        medium: medium,
        low: low,
      });
    } catch (_) {
      // Skip corrupted files
    }
  }

  if (analysisData.length === 0) {
    return { success: false, error: "No valid OMISSIONS data found" };
  }

  const trend = analyzeTrend(analysisData);
  return { success: true, analysisData: analysisData, trend: trend };
}

function main() {
  const targetPath = process.argv[2];
  if (!targetPath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node diminishing-returns.js <OMISSIONS_DIR_OR_FILE>" }));
    process.exit(1);
  }

  const result = loadAndAnalyze(targetPath);
  if (!result.success) {
    console.log(JSON.stringify(result));
    process.exit(1);
  }

  console.log(JSON.stringify(result.trend, null, 2));
}

if (require.main === module) main();

module.exports = { analyzeTrend, loadAndAnalyze };
