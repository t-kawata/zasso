#!/usr/bin/env node

/**
 * test-query-all.js — Batch resolution verification for all headingRefs
 *
 * Verifies that all headingRefs for all nodes in the graph are resolvable
 * against the source file. When unresolvable references are found,
 * exits with code 1 and writes diagnostic info to _fix_graph_hints.json.
 *
 * CLI: test-query-all.js --graph=<path> --source=<path>
 *
 * Exit codes:
 *   0  All headingRefs resolved successfully
 *   1  One or more headingRefs could not be resolved
 *
 * Exported functions: validateAllHeadingRefs, diagnoseBrokenRef, loadGraphAndSource
 */

const fs = require('fs');
const path = require('path');

const { resolveByHeading } = require('./resolve-by-heading.js');

// ============================================================
// Constants
// ============================================================

/** Maximum entries to display in detail */
const MAX_DETAIL_ENTRIES = 25;

/** Diagnostic score thresholds (percent) */
const SCORE_THRESHOLDS = {
  ZERO: 0,
  ONE_TOKEN_MAX: 25,
  HALF_MAX: 49,
  MAJORITY_MAX: 74,
  NEARLY_ALL_MAX: 99,
  PERFECT: 100,
};

/** Diagnosis label definitions */
const DIAGNOSIS_LABELS = {
  M0: 'M0',
  M1: 'M1',
  M2: 'M2',
  M3: 'M3',
  M4: 'M4',
  M5: 'M5',
  M6: 'M6',
  M7: 'M7',
  M8: 'M8',
  M9: 'M9',
  M10: 'M10',
};

/** Maximum heading level */
const MAX_HEADING_LEVEL = 6;

/** Input line count (including blank lines) */
const SOURCE_LINE_LIMIT_WARN = 10000;

/** Output hints file name */
const HINTS_OUTPUT_FILENAME = '_fix_graph_hints.json';

// ============================================================
// Public functions
// ============================================================

/**
 * Parse CLI arguments
 *
 * @param {string[]} argv — Equivalent to process.argv
 * @returns {{ graphPath: string, sourcePath: string }}
 * @throws {Error} If required arguments are missing
 */
function parseArguments(argv) {
  const args = argv.slice(2);
  const result = {};

  for (const arg of args) {
    if (arg.startsWith('--graph=')) result.graphPath = arg.slice('--graph='.length);
    else if (arg.startsWith('--source=')) result.sourcePath = arg.slice('--source='.length);
    else if (arg === '--help' || arg === '-h') result.help = true;
  }

  if (result.help) return result;
  if (!result.graphPath) throw new Error('--graph=<path> が必要です。');
  if (!result.sourcePath) throw new Error('--source=<path> が必要です。');
  return result;
}

/**
 * Load graph and source files
 *
 * @param {string} graphPath — Path to the graph JSON file
 * @param {string} sourcePath — Path to the source Markdown file
 * @returns {{ graph: Object, sourceLines: string[] }}
 */
function loadGraphAndSource(graphPath, sourcePath) {
  const graphJson = fs.readFileSync(graphPath, 'utf8');
  const graph = JSON.parse(graphJson);

  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const sourceLines = sourceText.split('\n');

  return { graph, sourceLines };
}

/**
 * Validate all headingRefs
 *
 * Deduplicates by nodeId + refId combination and returns
 * unresolvable references array and count of successful resolutions.
 *
 * @param {Object} graph — Graph data
 * @param {string[]} sourceLines — Array of source file lines
 * @returns {{ broken: Array, totalRefs: number, seen: Set<string> }}
 */
function validateAllHeadingRefs(graph, sourceLines) {
  const broken = [];
  const seen = new Set();
  let totalRefs = 0;

  for (const node of graph.nodes) {
    const nodeHeadingRefs = node.headingRefs || [];
    for (const ref of nodeHeadingRefs) {
      totalRefs++;
      const dedupKey = `${node.id}:${ref.refId}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const resolved = resolveByHeading(sourceLines, ref.heading, ref.texts);
      const resolvedLineText = resolved ? sourceLines[resolved.line - 1] : "";
      const allTokensMatch =
        resolved !== null &&
        ref.texts.every((t) => resolvedLineText.includes(t));

      if (!allTokensMatch) {
        const diagnosis = diagnoseBrokenRef(sourceLines, ref);
        broken.push({
          nodeId: node.id,
          nodeTitle: node.title,
          refId: ref.refId,
          heading: ref.heading,
          texts: ref.texts,
          resolutionLine: resolved ? resolved.line : null,
          resolvedText: resolved ? resolvedLineText : null,
          allTokensMatched: false,
          ...diagnosis,
        });
      }
    }
  }

  return { broken, totalRefs, seen };
}

/**
 * Diagnose an unresolvable headingRef (M0 through M10)
 *
 * @param {string[]} sourceLines — Array of source file lines
 * @param {{ heading: number, texts: string[] }} ref — headingRef object
 * @returns {{ diagnosis: string, score: number, details: Object, summary: string, remedyHint: string, remedyCommand: string }}
 */
function diagnoseBrokenRef(sourceLines, ref) {
  const { heading, texts } = ref;

  // Collect lines at the specified heading level
  const headingLines = collectHeadingLines(sourceLines, heading);
  const totalTokens = texts.length;

  // M0: No lines found at the specified heading level
  if (headingLines.length === 0) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M0, 0, texts, [], [],
      '指定された見出しレベルが見つかりません。',
      '見出しレベルが誤っているか、該当セクションが削除された可能性があります。',
      'crud.js update --graph=<g> --source=<s> --id=<nodeId> --updateHeadingRefs');
  }

  // Calculate scores for each heading line
  const lineScores = headingLines.map(line => ({
    line: line.line,
    text: line.text,
    score: computeTokenMatchScore(texts, line.text),
    matchedTokens: texts.filter(t => line.text.includes(t)),
    unmatchedTokens: texts.filter(t => !line.text.includes(t)),
  }));

  // Identify the highest scoring line
  lineScores.sort((a, b) => b.score - a.score);
  const bestScore = lineScores[0].score;
  const bestLines = lineScores.filter(l => l.score === bestScore);

  // M9: Each token matches only different lines (mutually exclusive)
  if (isMutuallyExclusive(texts, headingLines)) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M9, bestScore, texts, lineScores[0],
      lineScores.slice(0, 3),
      'トークンが複数の見出しに分散しており、1行で全てを満たせません。',
      'headingRefs の texts が複数のセクションにまたがっています。分割を検討してください。',
      'crud.js update --graph=<g> --source=<s> --id=<nodeId> --updateHeadingRefs');
  }

  // M8: Another heading level scores higher
  const bestOtherLevel = checkOtherHeadingLevels(sourceLines, heading, texts);
  if (bestOtherLevel && bestOtherLevel.score > bestScore) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M8, bestScore, texts, lineScores[0],
      lineScores.slice(0, 3),
      `別の見出しレベル (h${bestOtherLevel.level}) の方が高スコア (${bestOtherLevel.score}%) です。`,
      `見出しレベルが誤っています。h${bestOtherLevel.level} が正しい可能性があります。`,
      `crud.js update --graph=<g> --source=<s> --id=<nodeId> --heading=${bestOtherLevel.level}`);
  }

  // Score-based diagnosis (M1 through M7)
  const percentage = bestScore;

  let diagnosis;
  if (percentage === SCORE_THRESHOLDS.ZERO) {
    diagnosis = DIAGNOSIS_LABELS.M1;
  } else if (percentage <= SCORE_THRESHOLDS.ONE_TOKEN_MAX) {
    diagnosis = DIAGNOSIS_LABELS.M2;
  } else if (percentage <= SCORE_THRESHOLDS.HALF_MAX) {
    diagnosis = DIAGNOSIS_LABELS.M3;
  } else if (percentage <= SCORE_THRESHOLDS.MAJORITY_MAX) {
    diagnosis = DIAGNOSIS_LABELS.M4;
  } else if (percentage <= SCORE_THRESHOLDS.NEARLY_ALL_MAX) {
    diagnosis = DIAGNOSIS_LABELS.M5;
  } else if (percentage === SCORE_THRESHOLDS.PERFECT && bestLines.length > 1) {
    diagnosis = DIAGNOSIS_LABELS.M6;
  } else if (percentage === SCORE_THRESHOLDS.PERFECT && bestLines.length === 1) {
    diagnosis = DIAGNOSIS_LABELS.M7;
  } else {
    diagnosis = DIAGNOSIS_LABELS.M10;
  }

  return buildDiagnosisResult(diagnosis, bestScore, texts, lineScores[0],
    lineScores.slice(0, 3),
    generateSummary(diagnosis, texts, bestScore),
    generateSuggestion(diagnosis, texts, bestScore),
    generateRemedyCommand(diagnosis));
}

// ============================================================
// Diagnostic helper functions
// ============================================================

/**
 * Collect lines at the specified heading level
 *
 * @param {string[]} sourceLines — Array of source lines
 * @param {number} heading — Heading level (0 through 6)
 * @returns {Array<{ line: number, text: string }>}
 */
function collectHeadingLines(sourceLines, heading) {
  const pattern = heading === 0
    ? /^/
    : new RegExp(`^#{${heading}}\\s+`);

  const result = [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    if (heading > 0 && pattern.test(line)) {
      result.push({ line: i + 1, text: line });
    } else if (heading === 0 && (i <= 5 || line.trim() !== '')) {
      result.push({ line: i + 1, text: line });
    }
  }
  return result;
}

/**
 * Compute token match score (percentage)
 *
 * @param {string[]} texts — Token array
 * @param {string} line — Heading line
 * @returns {number} Percentage value from 0 to 100
 */
function computeTokenMatchScore(texts, line) {
  const matched = texts.filter(t => line.includes(t)).length;
  if (texts.length === 0) return 0;
  return Math.round((matched / texts.length) * 100);
}

/**
 * Determine whether tokens are spread across multiple lines (mutually exclusive)
 *
 * @param {string[]} texts — Token array
 * @param {Array<{ line: number, text: string }>} headingLines — Array of heading lines
 * @returns {boolean}
 */
function isMutuallyExclusive(texts, headingLines) {
  let allTokensCovered = 0;
  for (const line of headingLines) {
    const matched = texts.filter(t => line.text.includes(t)).length;
    allTokensCovered += matched;
  }
  // Exclusive if each token matches only once total and texts has 2+ entries
  if (texts.length < 2) return false;

  // Count how many lines each token matches
  for (const token of texts) {
    let matchCount = 0;
    for (const line of headingLines) {
      if (line.text.includes(token)) matchCount++;
    }
    if (matchCount === 0) return false; // Token with zero matches is not M9
  }

  // Check if every token matches exactly one line, and those lines differ
  const tokenLineMap = new Map();
  for (const token of texts) {
    const matches = headingLines.filter(l => l.text.includes(token));
    if (matches.length !== 1) return false;
    tokenLineMap.set(token, matches[0].line);
  }

  const uniqueLines = new Set(tokenLineMap.values());
  return uniqueLines.size > 1;
}

/**
 * Check other heading levels and return if a higher-scoring level exists
 *
 * @param {string[]} sourceLines — Array of source lines
 * @param {number} originalHeading — Original heading level
 * @param {string[]} texts — Token array
 * @returns {{ level: number, score: number } | null}
 */
function checkOtherHeadingLevels(sourceLines, originalHeading, texts) {
  let best = null;
  let bestScore = -1;

  // heading=0 is special (matches all lines), so exclude it from comparison
  for (let level = 1; level <= MAX_HEADING_LEVEL; level++) {
    if (level === originalHeading) continue;
    const lines = collectHeadingLines(sourceLines, level);
    if (lines.length === 0) continue;

    for (const line of lines) {
      const score = computeTokenMatchScore(texts, line.text);
      if (score > 0 && (best === null || score > bestScore)) {
        best = { level, score };
        bestScore = score;
      }
    }
  }

  return best;
}

/**
 * Build a diagnosis result object
 *
 * @param {string} diagnosis — Diagnosis label
 * @param {number} score — Score
 * @param {string[]} texts — Token array
 * @param {Object|null} bestLine — Highest scoring line
 * @param {Array} candidateLines — Candidate heading lines
 * @param {string} summary — Summary message
 * @param {string} suggestion — Suggestion text
 * @param {string} remedyCommand — Example remedy command
 * @returns {Object}
 */
function buildDiagnosisResult(diagnosis, score, texts, bestLine, candidateLines, summary, suggestion, remedyCommand) {
  const hasValidBestLine = bestLine && typeof bestLine.text === 'string';
  return {
    diagnosis,
    score,
    summary,
    reason: generateReason(diagnosis, score, texts, bestLine),
    tokenMatches: (hasValidBestLine ? texts.map(t => ({
      token: t,
      matched: bestLine.text.includes(t),
    })) : texts.map(t => ({ token: t, matched: false }))),
    suggestion,
    requiredAction: suggestion,
    remedyHint: summary,
    remedyCommand,
    details: {
      tokenMatches: (hasValidBestLine ? texts.map(t => ({
        token: t,
        matched: bestLine.text.includes(t),
        matchCount: candidateLines.filter(l => l.text.includes(t)).length,
      })) : texts.map(t => ({
        token: t,
        matched: false,
        matchCount: 0,
      }))),
      candidateLines: candidateLines.map(l => ({
        line: l.line,
        text: l.text,
        score: l.score,
      })),
    },
  };
}

/**
 * Generate a reason message based on the diagnosis label
 *
 * @param {string} diagnosis — Diagnosis label
 * @param {number} score — Score
 * @param {string[]} texts — Token array
 * @param {Object|null} bestLine — Highest scoring line
 * @returns {string}
 */
function generateReason(diagnosis, score, texts, bestLine) {
  switch (diagnosis) {
    case DIAGNOSIS_LABELS.M0:
      return `指定見出しレベル h${bestLine ? '?' : '?'} の行がソース内に存在しません。`;
    case DIAGNOSIS_LABELS.M1:
      return `トークン ${texts.length}件のうち 0件が一致しました (${score}%)。`;
    case DIAGNOSIS_LABELS.M2:
      return `トークン ${texts.length}件のうち 1件のみ一致しました (${score}%)。`;
    case DIAGNOSIS_LABELS.M3:
      return `トークンの半数未満が一致しました (${score}%)。`;
    case DIAGNOSIS_LABELS.M4:
      return `過半数のトークンが一致しましたが、完全一致には至りません (${score}%)。`;
    case DIAGNOSIS_LABELS.M5:
      return `ほぼ全てのトークンが一致しましたが、1トークン不足しています (${score}%)。`;
    case DIAGNOSIS_LABELS.M6:
      return `全トークンが一致する行が複数存在するため、一意に特定できません。`;
    case DIAGNOSIS_LABELS.M7:
      return `全トークンが一致し一意の行が特定できるにも関わらず解決失敗しました（不審）。`;
    case DIAGNOSIS_LABELS.M8:
      return `指定レベルより別の見出しレベルの方が高スコアです (${score}%)。`;
    case DIAGNOSIS_LABELS.M9:
      return `トークンが複数の見出し行に分散しており共存不可能です (${score}%)。`;
    default:
      return `診断不能 (スコア ${score}%)。`;
  }
}

/**
 * Generate a summary message based on the diagnosis label
 *
 * @param {string} diagnosis — Diagnosis label
 * @param {string[]} texts — Token array
 * @param {number} score — Score
 * @returns {string}
 */
function generateSummary(diagnosis, texts, score) {
  switch (diagnosis) {
    case DIAGNOSIS_LABELS.M0: return '見出しレベルがソースに存在しません。';
    case DIAGNOSIS_LABELS.M1: return 'どのトークンもマッチしません。';
    case DIAGNOSIS_LABELS.M2: return '1トークンのみ一致しています。';
    case DIAGNOSIS_LABELS.M3: return '半数未満のトークンが一致しています。';
    case DIAGNOSIS_LABELS.M4: return '過半数のトークンが一致しています。';
    case DIAGNOSIS_LABELS.M5: return 'ほぼ一致しています（1トークン不足）。';
    case DIAGNOSIS_LABELS.M6: return '全トークン一致する候補が複数存在します。';
    case DIAGNOSIS_LABELS.M7: return '不審な失敗（全トークン一致かつ一意）。';
    case DIAGNOSIS_LABELS.M8: return '別の見出しレベルの方が適切です。';
    case DIAGNOSIS_LABELS.M9: return 'トークンが共存不可能です。';
    default: return `診断不能 (${score}%)。`;
  }
}

/**
 * Generate a suggestion message based on the diagnosis label
 *
 * @param {string} diagnosis — Diagnosis label
 * @param {string[]} texts — Token array
 * @param {number} score — Score
 * @returns {string}
 */
function generateSuggestion(diagnosis, texts, score) {
  switch (diagnosis) {
    case DIAGNOSIS_LABELS.M0:
      return 'headingRefs の heading 値が誤っているか、ソースの該当セクションが削除されました。';
    case DIAGNOSIS_LABELS.M1:
      return 'texts が全く異なります。ソースの見出しが改名された可能性があります。';
    case DIAGNOSIS_LABELS.M2:
      return 'texts の大部分が一致しません。ソースの見出しが変更された可能性があります。';
    case DIAGNOSIS_LABELS.M3:
      return 'texts の多くが一致しません。トークンの見直しが必要です。';
    case DIAGNOSIS_LABELS.M4:
      return '過半数は一致していますが、一部のトークンが見つかりません。';
    case DIAGNOSIS_LABELS.M5:
      return '細かい表記揺れの可能性があります（句読点・空白等）。';
    case DIAGNOSIS_LABELS.M6:
      return '全トークン一致する候補が複数あります。texts をより具体的にしてください。';
    case DIAGNOSIS_LABELS.M7:
      return 'ロジック上のバグの可能性があります。手動で確認してください。';
    case DIAGNOSIS_LABELS.M8:
      return '指定された heading レベルが誤っています。別レベルの方が適切です。';
    case DIAGNOSIS_LABELS.M9:
      return '1つの headingRef に複数セクションのトークンが混在しています。分割してください。';
    default:
      return '手動で原因を確認してください。';
  }
}

/**
 * Generate an example remedy command based on the diagnosis label
 *
 * @param {string} diagnosis — Diagnosis label
 * @returns {string}
 */
function generateRemedyCommand(diagnosis) {
  const base = 'crud.js update --graph=<g> --source=<s> --id=<nodeId>';
  switch (diagnosis) {
    case DIAGNOSIS_LABELS.M0:
    case DIAGNOSIS_LABELS.M8:
      return `${base} --heading=<正しいレベル>`;
    case DIAGNOSIS_LABELS.M1:
    case DIAGNOSIS_LABELS.M2:
    case DIAGNOSIS_LABELS.M3:
    case DIAGNOSIS_LABELS.M4:
    case DIAGNOSIS_LABELS.M5:
      return `${base} --updateHeadingRefs`;
    case DIAGNOSIS_LABELS.M6:
      return `${base} --updateHeadingRefs （texts をより具体的に）`;
    case DIAGNOSIS_LABELS.M7:
      return `${base} --updateHeadingRefs （手動確認推奨）`;
    case DIAGNOSIS_LABELS.M9:
      return `${base} --splitHeadingRefs`;
    default:
      return `${base} --updateHeadingRefs`;
  }
}

// ============================================================
// Output helper functions
// ============================================================

/**
 * Format a success message
 *
 * @param {number} totalRefs — Total count of headingRefs
 * @returns {string}
 */
function formatSuccessMessage(totalRefs) {
  return `全 ${totalRefs} 件の headingRefs が正常解決しました。`;
}

/**
 * Format an error message
 *
 * @param {Array} broken — Array of unresolvable references
 * @returns {string}
 */
function formatErrorMessage(broken) {
  const display = broken.slice(0, MAX_DETAIL_ENTRIES);
  const remaining = broken.length - MAX_DETAIL_ENTRIES;

  const lines = [`解決不能な headingRefs が ${broken.length} 件あります。`];

  for (const entry of display) {
    lines.push('');
    lines.push(`[${entry.diagnosis}] ${entry.nodeId} / ${entry.refId}`);
    lines.push(`  ノード: ${entry.nodeTitle}`);
    lines.push(`  見出しレベル: h${entry.heading}`);
    lines.push(`  トークン: [${entry.texts.join(', ')}]`);
    lines.push(`  スコア: ${entry.score}%`);
    lines.push(`  診断: ${entry.summary}`);
    if (entry.resolutionLine) {
      lines.push(`  解決行 L${entry.resolutionLine}: ${entry.resolvedText}`);
      const matched = entry.texts.filter(t => entry.resolvedText?.includes(t));
      const unmatched = entry.texts.filter(t => !entry.resolvedText?.includes(t));
      if (unmatched.length > 0) {
        lines.push(`  一致トークン: [${matched.join(', ')}]`);
        lines.push(`  不一致トークン: [${unmatched.join(', ')}]`);
      }
    }
    lines.push(`  示唆: ${entry.suggestion}`);
    lines.push(`  修正: ${entry.remedyCommand}`);
  }

  if (remaining > 0) {
    lines.push('');
    lines.push(`その他 ${remaining} 件（詳細は _fix_graph_hints.json を参照）`);
  }

  return lines.join('\n');
}

/**
 * Build the contents of _fix_graph_hints.json
 *
 * @param {Array} broken — Array of unresolvable references
 * @returns {Object}
 */
function buildHintsJson(broken) {
  return {
    generatedAt: new Date().toISOString(),
    totalBroken: broken.length,
    uniqueBroken: broken.length,
    nodes: broken.slice(0, MAX_DETAIL_ENTRIES).map(entry => ({
      nodeId: entry.nodeId,
      nodeTitle: entry.nodeTitle,
      refId: entry.refId,
      diagnosis: entry.diagnosis,
      score: entry.score,
      heading: entry.heading,
      texts: entry.texts,
      resolutionLine: entry.resolutionLine || null,
      resolvedText: entry.resolvedText || null,
      allTokensMatched: entry.allTokensMatched !== false,
      details: entry.details,
      summary: entry.summary,
      remedyHint: entry.remedyHint,
      remedyCommand: entry.remedyCommand,
    })),
  };
}

// ============================================================
// Main
// ============================================================

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv);
  } catch (e) {
    process.stderr.write(`エラー: ${e.message}\n`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(`test-query-all.js — 全 headingRefs 一括解決検証

Usage:
  test-query-all.js --graph=<path> --source=<path>

Options:
  --graph=<path>   グラフファイル（graph.schema.json 準拠）のパス
  --source=<path>  ソースファイルのパス
  --help, -h       このヘルプを表示

Exit codes:
  0  全 headingRefs が正常解決
  1  1件以上の headingRefs が解決不能
`);
    process.exit(0);
  }

  let graph, sourceLines;
  try {
    const loaded = loadGraphAndSource(parsed.graphPath, parsed.sourcePath);
    graph = loaded.graph;
    sourceLines = loaded.sourceLines;
  } catch (e) {
    process.stderr.write(`ファイル読み込みエラー: ${e.message}\n`);
    process.exit(1);
  }

  const { broken, totalRefs } = validateAllHeadingRefs(graph, sourceLines);

  if (broken.length === 0) {
    process.stdout.write(formatSuccessMessage(totalRefs) + '\n');
    process.exit(0);
  } else {
    // On failure: output hints JSON and error list to stderr
    const hintsJson = buildHintsJson(broken);
    try {
      fs.writeFileSync(HINTS_OUTPUT_FILENAME, JSON.stringify(hintsJson, null, 2));
    } catch (_) {
      // File write failure is not fatal
    }

    process.stderr.write(formatErrorMessage(broken) + '\n');
    process.exit(1);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  parseArguments,
  loadGraphAndSource,
  validateAllHeadingRefs,
  diagnoseBrokenRef,
  collectHeadingLines,
  computeTokenMatchScore,
  isMutuallyExclusive,
  checkOtherHeadingLevels,
  buildHintsJson,
  formatSuccessMessage,
  formatErrorMessage,
  MAX_DETAIL_ENTRIES,
  SCORE_THRESHOLDS,
  DIAGNOSIS_LABELS,
  HINTS_OUTPUT_FILENAME,
};

if (require.main === module) main();
