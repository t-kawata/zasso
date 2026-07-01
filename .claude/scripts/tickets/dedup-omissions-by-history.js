/**
 * dedup-omissions-by-history.js — 過去 OMISSIONS との重複排除
 *
 * 現在の OMISSIONS と過去の OMISSIONS ファイル群を比較し、3つの決定論ルールを適用する。
 * このスクリプトは 100% 決定論 — AI が覆せない。
 *
 * Rule 1 — 完全重複:
 *   同一ファイル（affectedFiles） + 同一セクション（rfcSection） + 同一种別（type）
 *   → autoSkipped に追加（AI に渡さない）
 *
 * Rule 2 — stub_remaining 格下げ:
 *   severity === "low" & type === "stub_remaining"
 *   → cosmetic に自動格下げ
 *
 * Rule 3 — repeated_area:
 *   同一ファイルが 3 回以上連続して omission 対象になった
 *   → repeated_area タグ + 要確認フラグ
 *
 * Usage:
 *   node dedup-omissions-by-history.js <CURRENT_OMISSIONS_PATH>
 */

const fs = require("fs");
const path = require("path");

// OMISSIONS JSON のファイル名パターン
const OMISSION_FILE_RE = /^OMISSIONS-(\d{3})\.json$/;

/**
 * 3つの決定論ルールを適用して重複排除を実行する。
 *
 * @param {object[]} currentOmissions - 現在の omission 配列
 * @param {object[]} historyOmissions - 過去の全 omission 配列（全 OMISSIONS ファイルを flat）
 * @param {string[][]} historyFilesPerRound - 過去の各ラウンドで出現した全ファイルパス配列
 * @returns {{ autoSkipped: object[], downgraded: object[], repeatedAreas: object[], pendingForAI: object[] }}
 */
function filterDuplicates(currentOmissions, historyOmissions, historyFilesPerRound) {
  const autoSkipped = [];
  const downgraded = [];
  const repeatedAreas = [];
  const pendingForAI = [];

  for (const omission of currentOmissions) {
    const omissionCopy = JSON.parse(JSON.stringify(omission));

    // Rule 1: 完全重複チェック（同一ファイル + 同一セクション + 同一种別）
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
      continue; // Rule 2, Rule 3 は適用しない
    }

    // Rule 2: stub_remaining かつ low severity → cosmetic に格下げ
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

    // Rule 3: 同一ファイルが 3 回以上連続して omission 対象
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
 * 2つの配列に共通する要素があるか判定する。
 */
function arraysOverlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length === 0 || b.length === 0) return false;
  return a.some(function (item) { return b.indexOf(item) !== -1; });
}

/**
 * 指定ファイルが過去の全ラウンドで 3 回以上連続出現しているか判定する。
 *
 * @param {string[]} currentFiles - 現在の omission の affectedFiles
 * @param {string[][]} historyFilesPerRound - 過去各ラウンドのファイルパス配列
 * @returns {string|null} 条件を満たす最初のファイル、なければ null
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
        break; // 連続が途切れた
      }
    }

    // 現在のラウンドも含めて 3 回以上
    if (consecutiveCount + 1 >= 3) {
      return file;
    }
  }

  return null;
}

/**
 * ファイルパスから過去の全 OMISSIONS ファイルを読み取り、omission 配列とファイル一覧を集計する。
 *
 * @param {string} omissionsDir - OMISSIONS JSON が置かれているディレクトリ（絶対パス推奨）
 * @param {string} currentFilePath - 現在処理中の OMISSIONS ファイルの絶対パス
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

      // このラウンドの全 affectedFiles を収集
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
      // 読み取りエラーは無視（破損ファイルはスキップ）
    }
  }

  return { historyOmissions, historyFilesPerRound };
}

/**
 * メイン関数: ファイルを読み込み、重複排除を実行し、結果を返す。
 *
 * @param {string} currentPath - 現在の OMISSIONS ファイルのパス
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
