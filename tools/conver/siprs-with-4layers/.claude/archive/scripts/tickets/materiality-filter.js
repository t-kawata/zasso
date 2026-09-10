/**
 * materiality-filter.js — Goal blocking degree scoring
 *
 * Matches each omission against RFC purpose / goals / successCriteria,
 * and mechanically scores the degree of goal blocking.
 * This script's output is deterministic and cannot be overridden by AI.
 *
 * Scoring:
 *   Three-tier: purpose (3 pts) + goals (2 pts) + successCriteria (1 pt)
 *
 *   Total score -> severity:
 *     0       -> cosmetic (can pass check-final)
 *     1-2     -> low
 *     3-5     -> medium
 *
 * Usage:
 *   node materiality-filter.js <OMISSIONS_PATH>
 */

const fs = require("fs");
const path = require("path");

/**
 * Score how much an omission blocks the purpose, goals, and successCriteria of the RFC.
 *
 * @param {object} omission - omission (description, affectedFiles, type, severity, etc.)
 * @param {string} purpose - RFC purpose statement
 * @param {string} goals - RFC goals (newline-separated text)
 * @param {string[]|string} successCriteria - RFC success criteria
 * @returns {{ score: number, breakdown: object, recommendedSeverity: string }}
 */
function scoreGoalBlocking(omission, purpose, goals, successCriteria) {
  const breakdown = { purpose: 0, goals: 0, successCriteria: 0 };
  const keywords = extractKeywords(omission);
  let score = 0;

  // Purpose blocking check (max 3 pts)
  const purposeBlocked = keywordMatchScore(keywords, purpose);
  if (purposeBlocked > 0) {
    breakdown.purpose = 3;
    score += 3;
  }

  // Goals blocking check (max 2 pts)
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

  // SuccessCriteria blocking check (max 1 pt)
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
 * Extract keywords from an omission.
 */
function extractKeywords(omission) {
  return {
    description: (omission.description || "").toLowerCase(),
    files: omission.affectedFiles || [],
    type: omission.type || "",
  };
}

/**
 * Determine whether keywords are contained in targetText.
 * Supports both Japanese (no word boundaries) and English, so uses
 * substring matching (common substrings of 4+ characters) as the basis.
 */
function keywordMatchScore(keywords, targetText) {
  if (!targetText) return 0;
  const lowerTarget = targetText.toLowerCase();

  // File name-based matching (with and without extension)
  for (const file of keywords.files) {
    const baseName = path.basename(file).toLowerCase();
    if (lowerTarget.indexOf(baseName) !== -1) return 1;
    const nameWithoutExt = baseName.replace(/\.\w+$/, "");
    if (nameWithoutExt.length > 1 && lowerTarget.indexOf(nameWithoutExt) !== -1) return 1;
  }

  // Detect common substrings from description with punctuation/symbols removed
  const desc = keywords.description
    .replace(/[^a-z0-9一-鿿ぁ-んァ-ヶ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (desc.length < 4) return 0;

  // Match words/contiguous text (space-separated) of 4+ characters against lowerTarget
  // Supports both Japanese (no word boundaries) and English
  const words = desc.split(/\s+/).filter(function (w) { return w.length >= 4; });

  for (const word of words) {
    if (lowerTarget.indexOf(word) !== -1) return 1;
  }

  // Also check all substrings for texts with Japanese particles (efficient for small strings only)
  if (desc.length <= 100) {
    for (let start = 0; start < desc.length; start++) {
      for (let len = 4; len <= 20 && start + len <= desc.length; len++) {
        const sub = desc.substring(start, start + len);
        if (sub.indexOf(" ") !== -1) continue; // Skip substrings containing spaces
        if (sub.length >= 4 && lowerTarget.indexOf(sub) !== -1) return 1;
      }
    }
  }

  return 0;
}

/**
 * Determine whether the omission affects files described in successCriteria.
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
 * Determine recommended severity from score.
 */
function determineSeverity(score) {
  if (score === 0) return "cosmetic";
  if (score <= 2) return "low";
  return "medium";
}

/**
 * Normalize text into an array of lines.
 */
function normalizeLines(text) {
  if (Array.isArray(text)) return text;
  if (typeof text === "string") return text.split("\n").filter(function (l) { return l.trim().length > 0; });
  return [];
}

/**
 * Load rfcUnderstanding from an OMISSIONS file.
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
 * Score all omissions.
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
