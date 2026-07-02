/**
 * materiality-filter.js — Goal 阻害度スコアリング
 *
 * 各 omission を RFC の purpose / goals / successCriteria と照合し、
 * Goal 阻害度を機械的にスコアリングする。
 * このスクリプトの出力は決定論であり、AI が覆せない。
 *
 * スコアリング:
 *   purpose(3点) + goals(2点) + successCriteria(1点) の3階層
 *
 *   合計スコア → severity:
 *     0       → cosmetic（check-final通過可能）
 *     1-2     → low（優先度低）
 *     3-5     → medium
 *
 * Usage:
 *   node materiality-filter.js <OMISSIONS_PATH>
 */

const fs = require("fs");
const path = require("path");

/**
 * 目的(purpose)・目標(goals)・成功条件(successCriteria)に対して
 * omission が与える阻害度をスコアリングする。
 *
 * @param {object} omission - omission（description, affectedFiles, type, severity 等）
 * @param {string} purpose - RFC の目的文
 * @param {string} goals - RFC の目標（改行区切りテキスト）
 * @param {string[]|string} successCriteria - RFC の成功条件
 * @returns {{ score: number, breakdown: object, recommendedSeverity: string }}
 */
function scoreGoalBlocking(omission, purpose, goals, successCriteria) {
  const breakdown = { purpose: 0, goals: 0, successCriteria: 0 };
  const keywords = extractKeywords(omission);
  let score = 0;

  // purpose の阻害判定（最大3点）
  const purposeBlocked = keywordMatchScore(keywords, purpose);
  if (purposeBlocked > 0) {
    breakdown.purpose = 3;
    score += 3;
  }

  // goals の阻害判定（最大2点）
  const goalsArray = normalizeLines(goals);
  let goalsBlocked = 0;
  for (const goal of goalsArray) {
    if (keywordMatchScore(keywords, goal) > 0) {
      goalsBlocked++;
    }
  }
  if (goalsBlocked > 0) {
    const goalScore = Math.min(goalsBlocked, 2);
    breakdown.goals = goalScore;
    score += goalScore;
  }

  // successCriteria の阻害判定（最大1点）
  const criteriaArray = normalizeLines(successCriteria);
  let criteriaBlocked = 0;
  for (const criterion of criteriaArray) {
    const fileMatch = omissionAffectsFiles(omission, criterion);
    const keywordMatch = keywordMatchScore(keywords, criterion) > 0;
    if (fileMatch || keywordMatch) {
      criteriaBlocked++;
    }
  }
  if (criteriaBlocked > 0) {
    breakdown.successCriteria = 1;
    score += 1;
  }

  const recommendedSeverity = determineSeverity(score);

  return {
    score: score,
    breakdown: breakdown,
    recommendedSeverity: recommendedSeverity,
  };
}

/**
 * omission からキーワードを抽出する。
 */
function extractKeywords(omission) {
  return {
    description: (omission.description || "").toLowerCase(),
    files: omission.affectedFiles || [],
    type: omission.type || "",
  };
}

/**
 * キーワードが targetText に含まれているか判定する。
 * 日本語（単語境界なし）と英語の両方をサポートするため、
 * サブストリングマッチング（4文字以上の共通部分文字列）を基本とする。
 */
function keywordMatchScore(keywords, targetText) {
  if (!targetText) return 0;
  const lowerTarget = targetText.toLowerCase();

  // ファイル名ベースのマッチング（拡張子なし + 拡張子あり）
  for (const file of keywords.files) {
    const baseName = path.basename(file).toLowerCase();
    if (lowerTarget.indexOf(baseName) !== -1) return 1;
    const nameWithoutExt = baseName.replace(/\.\w+$/, "");
    if (nameWithoutExt.length > 1 && lowerTarget.indexOf(nameWithoutExt) !== -1) return 1;
  }

  // 省略記号や記号を除去した description から共通サブストリングを検出
  const desc = keywords.description
    .replace(/[^a-z0-9一-鿿ぁ-んァ-ヶ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (desc.length < 4) return 0;

  // 単語・連続テキスト（空白区切り）のうち、4文字以上のものを lowerTarget と照合
  // 日本語（単語境界なし）と英語の両方をサポート
  const words = desc.split(/\s+/).filter(function (w) { return w.length >= 4; });

  for (const word of words) {
    if (lowerTarget.indexOf(word) !== -1) return 1;
  }

  // 日本語の助詞を含む連続テキストのために、全サブストリングもチェック（小規模のみ効率的に）
  if (desc.length <= 100) {
    for (let start = 0; start < desc.length; start++) {
      for (let len = 4; len <= 20 && start + len <= desc.length; len++) {
        const sub = desc.substring(start, start + len);
        if (sub.indexOf(" ") !== -1) continue; // 空白を含むサブストリングはスキップ
        if (sub.length >= 4 && lowerTarget.indexOf(sub) !== -1) return 1;
      }
    }
  }

  return 0;
}

/**
 * omission が successCriteria に記述されたファイルに影響するか判定する。
 */
function omissionAffectsFiles(omission, criterion) {
  const files = omission.affectedFiles || [];
  if (files.length === 0) return false;

  const lowerCriterion = criterion.toLowerCase();
  for (const file of files) {
    const fileName = path.basename(file).toLowerCase();
    if (lowerCriterion.indexOf(fileName) !== -1) return true;
  }
  return false;
}

/**
 * スコアから推奨 severity を決定する。
 */
function determineSeverity(score) {
  if (score === 0) return "cosmetic";
  if (score <= 2) return "low";
  return "medium";
}

/**
 * テキストを行配列に正規化する。
 */
function normalizeLines(text) {
  if (Array.isArray(text)) return text;
  if (typeof text === "string") return text.split("\n").filter(function (l) { return l.trim().length > 0; });
  return [];
}

/**
 * OMISSIONS ファイルから rfcUnderstanding を読み取る。
 */
function loadRfcUnderstanding(omissionsPath) {
  const resolvedPath = path.resolve(omissionsPath);
  if (!fs.existsSync(resolvedPath)) {
    return { success: false, error: "OMISSIONS file not found: " + omissionsPath };
  }
  try {
    const data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    if (!data.rfcUnderstanding) {
      return { success: false, error: "rfcUnderstanding not found in OMISSIONS file" };
    }
    return { success: true, rfcUnderstanding: data.rfcUnderstanding };
  } catch (e) {
    return { success: false, error: "Invalid JSON: " + e.message };
  }
}

/**
 * 全 omission をスコアリングする。
 *
 * @param {string} omissionsPath
 * @returns {{ success: boolean, scores?: object[], error?: string }}
 */
function scoreAllOmissions(omissionsPath) {
  const resolvedPath = path.resolve(omissionsPath);
  if (!fs.existsSync(resolvedPath)) {
    return { success: false, error: "File not found: " + omissionsPath };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (e) {
    return { success: false, error: "Invalid JSON: " + e.message };
  }

  const understanding = data.rfcUnderstanding;
  if (!understanding) {
    return { success: false, error: "rfcUnderstanding not found" };
  }

  const purpose = understanding.purpose || "";
  const goals = understanding.goals || "";
  const successCriteria = understanding.successCriteria || [];

  const omissions = data.omissions || [];
  const scores = omissions.map(function (o) {
    const result = scoreGoalBlocking(o, purpose, goals, successCriteria);
    return {
      id: o.id,
      description: o.description,
      currentSeverity: o.severity,
      score: result.score,
      breakdown: result.breakdown,
      recommendedSeverity: result.recommendedSeverity,
    };
  });

  return { success: true, scores: scores };
}

function main() {
  const omissionsPath = process.argv[2];
  if (!omissionsPath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node materiality-filter.js <OMISSIONS_PATH>" }));
    process.exit(1);
  }

  const output = scoreAllOmissions(omissionsPath);
  console.log(JSON.stringify(output, null, 2));
  if (!output.success) process.exit(1);
}

if (require.main === module) main();

module.exports = { scoreGoalBlocking, scoreAllOmissions, determineSeverity, loadRfcUnderstanding };
