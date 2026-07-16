#!/usr/bin/env node

/**
 * query-fix-hints.js — _fix_graph_hints.json 検索・Markdown 整形表示
 *
 * test-query-all.js が出力する _fix_graph_hints.json を読み込み、
 * フィルタ条件に基づいて該当エントリを Markdown 整形して表示する。
 *
 * CLI: query-fix-hints.js --hints=<path> [--id=<nodeId>] [--diagnosis=<M0..M10>] [--refId=<refId>]
 *
 * Exit codes:
 *   0  正常終了
 *   1  エラー終了（ファイル不在・引数不正等）
 */

const fs = require('fs');

// ============================================================
// 公開関数
// ============================================================

/**
 * CLI引数をパースする
 *
 * @param {string[]} argv — process.argv 相当
 * @returns {{ hintsPath: string, idFilter: string|null, diagnosisFilter: string|null, refIdFilter: string|null, help: boolean }}
 * @throws {Error} 必須引数が不足している場合
 */
function parseArguments(argv) {
  const args = argv.slice(2);
  const result = {
    hintsPath: null,
    idFilter: null,
    diagnosisFilter: null,
    refIdFilter: null,
    help: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--hints=')) result.hintsPath = arg.slice('--hints='.length);
    else if (arg.startsWith('--id=')) result.idFilter = arg.slice('--id='.length);
    else if (arg.startsWith('--diagnosis=')) result.diagnosisFilter = arg.slice('--diagnosis='.length);
    else if (arg.startsWith('--refId=')) result.refIdFilter = arg.slice('--refId='.length);
    else if (arg === '--help' || arg === '-h') result.help = true;
  }

  if (result.help) return result;
  if (!result.hintsPath) throw new Error('--hints=<path> is required.');
  return result;
}

/**
 * _fix_graph_hints.json を読み込む
 *
 * @param {string} hintsPath — hints ファイルのパス
 * @returns {Object} hints データ
 */
function loadHintsFile(hintsPath) {
  const raw = fs.readFileSync(hintsPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * フィルタ条件に合致するエントリを検索する
 *
 * フィルタは AND 条件。指定しないフィルタは無視される。
 *
 * @param {Object} hintsData — hints データ
 * @param {{ idFilter: string|null, diagnosisFilter: string|null, refIdFilter: string|null }} filters — フィルタ条件
 * @returns {Array} フィルタ済みエントリ
 */
function filterEntries(hintsData, filters) {
  let entries = hintsData.nodes || [];

  if (filters.idFilter) {
    entries = entries.filter(e => e.nodeId === filters.idFilter);
  }
  if (filters.diagnosisFilter) {
    entries = entries.filter(e => e.diagnosis === filters.diagnosisFilter);
  }
  if (filters.refIdFilter) {
    entries = entries.filter(e => e.refId === filters.refIdFilter);
  }

  return entries;
}

/**
 * エントリを Markdown 整形する
 *
 * @param {Array} entries — フィルタ済みエントリ配列
 * @param {Object} hintsData — オリジナルの hints データ（メタ情報表示用）
 * @returns {string} Markdown 文字列
 */
function formatAsMarkdown(entries, hintsData) {
  if (entries.length === 0) {
    return '該当するエントリがありません。';
  }

  const parts = [];
  parts.push(`# Fix Graph Hints`);
  parts.push('');
  parts.push(`- **生成日時**: ${hintsData.generatedAt || '不明'}`);
  parts.push(`- **総件数**: ${hintsData.totalBroken || 0}`);
  parts.push(`- **表示件数**: ${entries.length}`);
  parts.push('');

  for (const entry of entries) {
    parts.push(`---`);
    parts.push('');
    parts.push(`## ${entry.diagnosis || '?'}: ${entry.nodeId || '?'} / ${entry.refId || '?'}`);
    parts.push('');
    parts.push(`| 項目 | 値 |`);
    parts.push(`|------|-----|`);
    parts.push(`| ノード | ${entry.nodeTitle || '?'} |`);
    parts.push(`| refId | ${entry.refId || '?'} |`);
    parts.push(`| 見出しレベル | h${entry.heading ?? '?'} |`);
    parts.push(`| 診断 | ${entry.diagnosis || '?'} |`);
    parts.push(`| スコア | ${entry.score ?? '?'}% |`);
    parts.push(`| トークン | \`${(entry.texts || []).join(', ')}\` |`);
    parts.push('');

    if (entry.summary) {
      parts.push(`**診断メッセージ**: ${entry.summary}`);
      parts.push('');
    }

    if (entry.remedyHint) {
      parts.push(`**示唆**: ${entry.remedyHint}`);
      parts.push('');
    }

    if (entry.remedyCommand) {
      parts.push('```bash');
      parts.push(`# 修正コマンド例`);
      parts.push(entry.remedyCommand);
      parts.push('```');
      parts.push('');
    }

    // トークン別一致状況
    if (entry.details && Array.isArray(entry.details.tokenMatches)) {
      parts.push('### トークン別一致状況');
      parts.push('');
      parts.push('| トークン | 一致 | 一致行数 |');
      parts.push('|----------|------|----------|');
      for (const tm of entry.details.tokenMatches) {
        parts.push(`| \`${tm.token}\` | ${tm.matched ? '✅' : '❌'} | ${tm.matchCount ?? '?'} |`);
      }
      parts.push('');
    }

    // 候補見出し行
    if (entry.details && Array.isArray(entry.details.candidateLines) && entry.details.candidateLines.length > 0) {
      parts.push('### 候補見出し行');
      parts.push('');
      parts.push('| 行番号 | 内容 | スコア |');
      parts.push('|--------|------|--------|');
      for (const cl of entry.details.candidateLines) {
        parts.push(`| ${cl.line} | \`${cl.text}\` | ${cl.score ?? 0}% |`);
      }
      parts.push('');
    }
  }

  return parts.join('\n');
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
    process.stdout.write(`query-fix-hints.js — _fix_graph_hints.json search and Markdown display

Usage:
  query-fix-hints.js --hints=<path> [--id=<nodeId>] [--diagnosis=<M0..M10>] [--refId=<refId>]

Options:
  --hints=<path>     Path to _fix_graph_hints.json
  --id=<nodeId>      Filter by node ID (e.g., --id=N0100)
  --diagnosis=<M0..M10>  Filter by diagnosis type (e.g., --diagnosis=M1)
  --refId=<refId>    Filter by refId (e.g., --refId=REF101)
  --help, -h         Show this help

Exit codes:
  0  Success
  1  Error (file not found, invalid arguments, etc.)
`);
    process.exit(0);
  }

  let hintsData;
  try {
    hintsData = loadHintsFile(parsed.hintsPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      process.stderr.write(`Error: File not found: ${parsed.hintsPath}\n`);
    } else if (e instanceof SyntaxError) {
      process.stderr.write(`Error: JSON parse failed: ${e.message}\n`);
    } else {
      process.stderr.write(`Error: ${e.message}\n`);
    }
    process.exit(1);
  }

  const filters = {
    idFilter: parsed.idFilter,
    diagnosisFilter: parsed.diagnosisFilter,
    refIdFilter: parsed.refIdFilter,
  };

  const entries = filterEntries(hintsData, filters);
  const markdown = formatAsMarkdown(entries, hintsData);

  process.stdout.write(markdown + '\n');
}

// ============================================================
// exports
// ============================================================

module.exports = {
  parseArguments,
  loadHintsFile,
  filterEntries,
  formatAsMarkdown,
};

if (require.main === module) main();
