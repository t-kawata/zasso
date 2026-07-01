/**
 * diminishing-returns.js — 発散/収束の時系列分析
 *
 * find のループ回数と omission 発見数の時系列を分析し、収束しているか
 * 発散しているかを機械的に判定する。このスクリプトは 100% 決定論。
 *
 * 処理:
 * 1. 全 OMISSIONS-*.json から omission 数を種別・severity 別に集計
 * 2. low / (high + medium + low) 比率の推移を計算
 * 3. 前回比で omission 総数が増加していれば発散フラグ
 * 4. low 比率が 50% 以上かつ増加傾向なら発散警告
 *
 * Usage:
 *   node diminishing-returns.js <OMISSIONS_DIR_OR_FILE>
 */

const fs = require("fs");
const path = require("path");

const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;

/**
 * 時系列分析を実行する。
 *
 * @param {object[]} analysisData - 各ラウンドの分析データ配列
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

  // 各ラウンドの low 比率を計算
  for (const round of analysisData) {
    const significantTotal = round.high + round.medium + round.low;
    details.lowRatios.push(significantTotal === 0 ? 0 : round.low / significantTotal);
  }

  // low 比率の増減傾向（初回 vs 最終）
  const firstRatio = details.lowRatios[0];
  const lastRatio = details.lowRatios[details.lowRatios.length - 1];

  if (lastRatio > firstRatio) {
    details.lowRatioTrend = "increasing";
  } else if (lastRatio < firstRatio) {
    details.lowRatioTrend = "decreasing";
  } else {
    details.lowRatioTrend = "stable";
  }

  // 発散フラグ判定
  const divergingFlags = [];

  // 条件1: 前回比で total 増加
  const lastRound = analysisData[analysisData.length - 1];
  const prevRound = analysisData[analysisData.length - 2];
  if (lastRound.total > prevRound.total) {
    divergingFlags.push("total_increased");
    details.totalTrend = "increasing";
  } else if (lastRound.total < prevRound.total) {
    details.totalTrend = "decreasing";
  }

  // 条件2: low 比率 50% 以上かつ増加傾向
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
 * OMISSIONS ファイルを読み込み、ラウンドごとの集計データを生成する。
 *
 * @param {string} targetPath - OMISSIONS JSON ファイル or ディレクトリ
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
      // 破損ファイルはスキップ
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
