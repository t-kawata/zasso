/**
 * dedup-omissions-by-history.js — Deduplicate against past OMISSIONS
 *
 * Compares the current OMISSIONS with past OMISSIONS files and applies 3 deterministic rules.
 * This script is 100% deterministic — AI cannot override it.
 *
 * Rule 1 — Exact duplicate:
 *   same file (affectedFiles) + same section (rfcSection) + same type
 *   → added to autoSkipped (not passed to AI)
 *
 * Rule 2 — stub_remaining downgrade:
 *   severity === "low" & type === "stub_remaining"
 *   → automatically downgraded to cosmetic
 *
 * Rule 3 — repeated_area:
 *   same file targeted by omission for 3+ consecutive rounds
 *   → repeated_area tag + needsReview flag
 *
 * Usage:
 *   node dedup-omissions-by-history.js <CURRENT_OMISSIONS_PATH>
 */

const fs = require("fs");
const path = require("path");

// OMISSIONS JSON file name pattern
const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;

/**
 * Apply 3 deterministic rules to filter duplicates.
 *
 * @param {object[]} currentOmissions - current omission array
 * @param {object[]} historyOmissions - all past omissions (flattened across all OMISSIONS files)
 * @param {string[][]} historyFilesPerRound - all file paths per past round
 * @returns {{ autoSkipped: object[], downgraded: object[], repeatedAreas: object[], pendingForAI: object[] }}
 */
function filterDuplicates(currentOmissions, historyOmissions, historyFilesPerRound) {
  const autoSkipped = [];
  const downgraded = [];
  const repeatedAreas = [];
  const pendingForAI = [];

  for (const omission of currentOmissions) {
    const omissionCopy = JSON.parse(JSON.stringify(omission));

    // Rule 1: Exact duplicate check (same file + section + type)
    const isDuplicate = historyOmissions.some(function (h) {
      const filesMatch = arraysOverlap(h.affectedFiles, omission.affectedFiles);
      const sectionsMatch = h.rfcSection === omission.rfcSection;
      const typesMatch = h.type === omission.type;
      return filesMatch && sectionsMatch && typesMatch;
    });

    if (isDuplicate) {
      autoSkipped.push({
        id: omission.id,
        description: omission.description,
        reason: "完全重複: 過去の OMISSIONS と同じファイル・セクション・種別の指摘",
      });
      continue; // Rule 2, Rule 3 do not apply
    }

    // Rule 2: stub_remaining with low severity → downgrade to cosmetic
    const isStubRemainingLow = (
      omission.type === "stub_remaining" &&
      omission.severity === "low"
    );
    if (isStubRemainingLow) {
      omissionCopy.severity = "cosmetic";
      downgraded.push({
        id: omission.id,
        from: "low",
        to: "cosmetic",
        reason: "stub_remaining かつ low severity → cosmetic に格下げ",
      });
    }

    // Rule 3: Same file appears 3+ consecutive rounds as omission target
    const affectedFiles = omission.affectedFiles || [];
    const repeatedFile = findRepeatedFile(affectedFiles, historyFilesPerRound);
    if (repeatedFile) {
      omissionCopy.tags = omissionCopy.tags || [];
      if (omissionCopy.tags.indexOf("repeated_area") === -1) {
        omissionCopy.tags.push("repeated_area");
      }
      omissionCopy.needsReview = true;
      repeatedAreas.push({
        file: repeatedFile,
        consecutiveRounds: historyFilesPerRound.length + 1,
        omissionId: omission.id,
        reason: "同一ファイルが 3 回以上連続して omission 対象",
      });
    }

    pendingForAI.push(omissionCopy);
  }

  return { autoSkipped, downgraded, repeatedAreas, pendingForAI };
}

/**
 * Check if two arrays share any common element.
 */
function arraysOverlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length === 0 || b.length === 0) return false;
  return a.some(function (item) { return b.indexOf(item) !== -1; });
}

/**
 * Check if a specific file has appeared in 3+ consecutive rounds across all history.
 *
 * @param {string[]} currentFiles - affectedFiles of the current omission
 * @param {string[][]} historyFilesPerRound - file paths per past round
 * @returns {string|null} first matching file, or null
 */
function findRepeatedFile(currentFiles, historyFilesPerRound) {
  if (!Array.isArray(currentFiles) || currentFiles.length === 0) return null;

  for (const file of currentFiles) {
    let consecutiveCount = 0;
    for (let roundIndex = historyFilesPerRound.length - 1; roundIndex >= 0; roundIndex--) {
      const roundFiles = historyFilesPerRound[roundIndex];
      if (Array.isArray(roundFiles) && roundFiles.indexOf(file) !== -1) {
        consecutiveCount++;
      } else {
        break; // Streak broken
      }
    }

    // 3+ including current round
    if (consecutiveCount + 1 >= 3) {
      return file;
    }
  }

  return null;
}

/**
 * Read all past OMISSIONS files from the directory and aggregate omission arrays and file lists.
 *
 * @param {string} omissionsDir - directory where OMISSIONS JSON files are stored (absolute path recommended)
 * @param {string} currentFilePath - absolute path of the current OMISSIONS file being processed
 * @returns {{ historyOmissions: object[], historyFilesPerRound: string[][] }}
 */
function loadHistoryOmissions(omissionsDir, currentFilePath) {
  const historyOmissions = [];
  const historyFilesPerRound = [];

  const entries = fs.readdirSync(omissionsDir);
  const sorted = entries
    .filter(function (name) { return OMISSION_FILE_RE.test(name); })
    .map(function (name) { return path.join(omissionsDir, name); })
    .filter(function (absPath) { return absPath !== currentFilePath; })
    .sort();

  for (const filePath of sorted) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const omissions = data.omissions || [];
      historyOmissions.push.apply(historyOmissions, omissions);

      // Collect all affectedFiles for this round
      const roundFiles = [];
      for (const o of omissions) {
        const files = o.affectedFiles || [];
        for (const f of files) {
          if (roundFiles.indexOf(f) === -1) {
            roundFiles.push(f);
          }
        }
      }
      historyFilesPerRound.push(roundFiles);
    } catch (_) {
      // Ignore read errors (skip corrupted files)
    }
  }

  return { historyOmissions, historyFilesPerRound };
}

/**
 * Main function: read file, execute dedup, return result.
 *
 * @param {string} currentPath - path to the current OMISSIONS file
 * @returns {{ success: boolean, result?: object, error?: string }}
 */
function dedupFile(currentPath) {
  const resolvedPath = path.resolve(currentPath);

  if (!fs.existsSync(resolvedPath)) {
    return { success: false, error: "File not found: " + currentPath };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (e) {
    return { success: false, error: "Invalid JSON: " + e.message };
  }

  const omissions = data.omissions || [];
  if (omissions.length === 0) {
    return { success: true, result: { autoSkipped: [], downgraded: [], repeatedAreas: [], pendingForAI: [] } };
  }

  const omissionsDir = path.dirname(resolvedPath);
  const { historyOmissions, historyFilesPerRound } = loadHistoryOmissions(omissionsDir, resolvedPath);

  const result = filterDuplicates(omissions, historyOmissions, historyFilesPerRound);

  return { success: true, result };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log(JSON.stringify({ success: false, error: "Usage: node dedup-omissions-by-history.js <OMISSIONS_FILE_PATH>" }));
    process.exit(1);
  }

  const output = dedupFile(filePath);
  console.log(JSON.stringify(output, null, 2));
  if (!output.success) process.exit(1);
}

if (require.main === module) main();

module.exports = { filterDuplicates, findRepeatedFile, dedupFile, loadHistoryOmissions };
