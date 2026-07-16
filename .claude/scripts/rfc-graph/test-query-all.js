#!/usr/bin/env node

/**
 * test-query-all.js — 全 headingRefs 一括解決検証
 *
 * グラフ内の全ノードの全 headingRefs がソースファイルに対して
 * 解決可能であることを検証する。解決不能な参照がある場合、
 * exit 1 で終了し _fix_graph_hints.json に診断情報を出力する。
 *
 * CLI: test-query-all.js --graph=<path> --source=<path>
 *
 * Exit codes:
 *   0  全 headingRefs が正常解決
 *   1  1件以上の headingRefs が解決不能
 *
 * 公開関数: validateAllHeadingRefs, diagnoseBrokenRef, loadGraphAndSource
 */

const fs = require('fs');
const path = require('path');

const { resolveByHeading } = require('./resolve-by-heading.js');

// ============================================================
// 定数
// ============================================================

/** 詳細表示する最大エントリ数 */
const MAX_DETAIL_ENTRIES = 25;

/** 診断用スコア閾値（パーセント） */
const SCORE_THRESHOLDS = {
  ZERO: 0,
  ONE_TOKEN_MAX: 25,
  HALF_MAX: 49,
  MAJORITY_MAX: 74,
  NEARLY_ALL_MAX: 99,
  PERFECT: 100,
};

/** 診断ラベル定義 */
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

/** ヘッディングレベル最大値 */
const MAX_HEADING_LEVEL = 6;

/** 入力行数（空行も含む） */
const SOURCE_LINE_LIMIT_WARN = 10000;

/** 出力する hints ファイル名 */
const HINTS_OUTPUT_FILENAME = '_fix_graph_hints.json';

// ============================================================
// 公開関数
// ============================================================

/**
 * CLI引数をパースする
 *
 * @param {string[]} argv — process.argv 相当
 * @returns {{ graphPath: string, sourcePath: string }}
 * @throws {Error} 必須引数が不足している場合
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
  if (!result.graphPath) throw new Error('--graph=<path> is required.');
  if (!result.sourcePath) throw new Error('--source=<path> is required.');
  return result;
}

/**
 * グラフとソースファイルを読み込む
 *
 * @param {string} graphPath — グラフJSONファイルのパス
 * @param {string} sourcePath — ソースMarkdownファイルのパス
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
 * 全 headingRefs を検証する
 *
 * 重複排除（nodeId + refId の組み合わせ）を行い、
 * 解決不能な参照の配列と解決成功件数を返す。
 *
 * @param {Object} graph — グラフデータ
 * @param {string[]} sourceLines — ソースファイルの行配列
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
 * 解決不能な headingRef を診断する（M0〜M10）
 *
 * @param {string[]} sourceLines — ソースファイルの行配列
 * @param {{ heading: number, texts: string[] }} ref — headingRef オブジェクト
 * @returns {{ diagnosis: string, score: number, details: Object, summary: string, remedyHint: string, remedyCommand: string }}
 */
function diagnoseBrokenRef(sourceLines, ref) {
  const { heading, texts } = ref;

  // 指定 heading レベルの行を収集
  const headingLines = collectHeadingLines(sourceLines, heading);
  const totalTokens = texts.length;

  // M0: 指定見出しレベルの行が0件
  if (headingLines.length === 0) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M0, 0, texts, [], [],
      '指定された見出しレベルが見つかりません。',
      '見出しレベルが誤っているか、該当セクションが削除された可能性があります。',
      'crud.js update --graph=<g> --source=<s> --id=<nodeId> --updateHeadingRefs');
  }

  // 各見出し行のスコアを計算
  const lineScores = headingLines.map(line => ({
    line: line.line,
    text: line.text,
    score: computeTokenMatchScore(texts, line.text),
    matchedTokens: texts.filter(t => line.text.includes(t)),
    unmatchedTokens: texts.filter(t => !line.text.includes(t)),
  }));

  // 最高スコアの行を特定
  lineScores.sort((a, b) => b.score - a.score);
  const bestScore = lineScores[0].score;
  const bestLines = lineScores.filter(l => l.score === bestScore);

  // M9: 各トークンがそれぞれ異なる行にしかマッチしない（共存不可能）
  if (isMutuallyExclusive(texts, headingLines)) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M9, bestScore, texts, lineScores[0],
      lineScores.slice(0, 3),
      'トークンが複数の見出しに分散しており、1行で全てを満たせません。',
      'headingRefs の texts が複数のセクションにまたがっています。分割を検討してください。',
      'crud.js update --graph=<g> --source=<s> --id=<nodeId> --updateHeadingRefs');
  }

  // M8: 別の見出しレベルの方が高スコア
  const bestOtherLevel = checkOtherHeadingLevels(sourceLines, heading, texts);
  if (bestOtherLevel && bestOtherLevel.score > bestScore) {
    return buildDiagnosisResult(DIAGNOSIS_LABELS.M8, bestScore, texts, lineScores[0],
      lineScores.slice(0, 3),
      `別の見出しレベル (h${bestOtherLevel.level}) の方が高スコア (${bestOtherLevel.score}%) です。`,
      `見出しレベルが誤っています。h${bestOtherLevel.level} が正しい可能性があります。`,
      `crud.js update --graph=<g> --source=<s> --id=<nodeId> --heading=${bestOtherLevel.level}`);
  }

  // スコアに基づく診断（M1〜M7）
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
// 診断補助関数
// ============================================================

/**
 * 指定 heading レベルの行を収集する
 *
 * @param {string[]} sourceLines — ソース行配列
 * @param {number} heading — 見出しレベル（0〜6）
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
 * トークンの一致スコアを計算する（%）
 *
 * @param {string[]} texts — トークン配列
 * @param {string} line — 見出し行
 * @returns {number} 0〜100 のパーセント値
 */
function computeTokenMatchScore(texts, line) {
  const matched = texts.filter(t => line.includes(t)).length;
  if (texts.length === 0) return 0;
  return Math.round((matched / texts.length) * 100);
}

/**
 * トークンが複数の行に分散して共存不可能かを判定する
 *
 * @param {string[]} texts — トークン配列
 * @param {Array<{ line: number, text: string }>} headingLines — 見出し行配列
 * @returns {boolean}
 */
function isMutuallyExclusive(texts, headingLines) {
  let allTokensCovered = 0;
  for (const line of headingLines) {
    const matched = texts.filter(t => line.text.includes(t)).length;
    allTokensCovered += matched;
  }
  // 各トークンが合計で1回しかマッチしない場合、かつ texts が2件以上なら排他的
  if (texts.length < 2) return false;

  // 各トークンがマッチする行数をカウント
  for (const token of texts) {
    let matchCount = 0;
    for (const line of headingLines) {
      if (line.text.includes(token)) matchCount++;
    }
    if (matchCount === 0) return false; // マッチしないトークンがある = M9 ではない
  }

  // 全トークンがそれぞれ1行にしかマッチせず、かつそれらが異なる行の場合
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
 * 別の見出しレベルをチェックし、より高スコアのレベルがあれば返す
 *
 * @param {string[]} sourceLines — ソース行配列
 * @param {number} originalHeading — 元の見出しレベル
 * @param {string[]} texts — トークン配列
 * @returns {{ level: number, score: number } | null}
 */
function checkOtherHeadingLevels(sourceLines, originalHeading, texts) {
  let best = null;
  let bestScore = -1;

  // heading=0 は特殊（全行にマッチ）のため、比較対象から除外する
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
 * 診断結果オブジェクトを構築する
 *
 * @param {string} diagnosis — 診断ラベル
 * @param {number} score — スコア
 * @param {string[]} texts — トークン配列
 * @param {Object|null} bestLine — 最高スコアの行
 * @param {Array} candidateLines — 候補見出し行
 * @param {string} summary — 要約メッセージ
 * @param {string} suggestion — 示唆
 * @param {string} remedyCommand — 修正コマンド例
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
 * 診断ラベルに応じた理由メッセージを生成する
 *
 * @param {string} diagnosis — 診断ラベル
 * @param {number} score — スコア
 * @param {string[]} texts — トークン配列
 * @param {Object|null} bestLine — 最高スコアの行
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
 * 診断ラベルに応じた要約メッセージを生成する
 *
 * @param {string} diagnosis — 診断ラベル
 * @param {string[]} texts — トークン配列
 * @param {number} score — スコア
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
 * 診断ラベルに応じた示唆メッセージを生成する
 *
 * @param {string} diagnosis — 診断ラベル
 * @param {string[]} texts — トークン配列
 * @param {number} score — スコア
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
 * 診断ラベルに応じた修正コマンド例を生成する
 *
 * @param {string} diagnosis — 診断ラベル
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
// 出力補助関数
// ============================================================

/**
 * 成功メッセージを整形する
 *
 * @param {number} totalRefs — 総 headingRefs 件数
 * @returns {string}
 */
function formatSuccessMessage(totalRefs) {
  return `全 ${totalRefs} 件の headingRefs が正常解決しました。`;
}

/**
 * 失敗メッセージを整形する
 *
 * @param {Array} broken — 解決不能な参照の配列
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
 * _fix_graph_hints.json の内容を構築する
 *
 * @param {Array} broken — 解決不能な参照の配列
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
// メイン
// ============================================================

function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(`test-query-all.js — Batch resolve and validate all headingRefs

Usage:
  test-query-all.js --graph=<path> --source=<path>

Options:
  --graph=<path>   Path to graph file (graph.schema.json compliant)
  --source=<path>  Path to source file
  --help, -h       Show this help

Exit codes:
  0  All headingRefs resolved successfully
  1  One or more headingRefs could not be resolved
`);
    process.exit(0);
  }

  let graph, sourceLines;
  try {
    const loaded = loadGraphAndSource(parsed.graphPath, parsed.sourcePath);
    graph = loaded.graph;
    sourceLines = loaded.sourceLines;
  } catch (e) {
    process.stderr.write(`File read error: ${e.message}\n`);
    process.exit(1);
  }

  const { broken, totalRefs } = validateAllHeadingRefs(graph, sourceLines);

  if (broken.length === 0) {
    process.stdout.write(formatSuccessMessage(totalRefs) + '\n');
    process.exit(0);
  } else {
    // 失敗時: hints JSON を出力し、stderr にエラー一覧
    const hintsJson = buildHintsJson(broken);
    try {
      fs.writeFileSync(HINTS_OUTPUT_FILENAME, JSON.stringify(hintsJson, null, 2));
    } catch (_) {
      // ファイル書き込み失敗は致命的ではない
    }

    process.stderr.write(formatErrorMessage(broken) + '\n');
    process.exit(1);
  }
}

// ============================================================
// exports
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
