#!/usr/bin/env node

/**
 * query-fix-hints.js — Search _fix_graph_hints.json and format as Markdown
 *
 * Reads _fix_graph_hints.json produced by test-query-all.js,
 * filters entries by criteria, and displays them formatted in Markdown.
 *
 * CLI: query-fix-hints.js --hints=<path> [--id=<nodeId>] [--diagnosis=<M0..M10>] [--refId=<refId>]
 *
 * Exit codes:
 *   0  Normal completion
 *   1  Error exit (file not found, invalid arguments, etc.)
 */

const fs = require('fs');

// ============================================================
// Public functions
// ============================================================

/**
 * Parse CLI arguments
 *
 * @param {string[]} argv — Equivalent to process.argv
 * @returns {{ hintsPath: string, idFilter: string|null, diagnosisFilter: string|null, refIdFilter: string|null, help: boolean }}
 * @throws {Error} If required arguments are missing
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
  if (!result.hintsPath) throw new Error('--hints=<path> が必要です。');
  return result;
}

/**
 * Load _fix_graph_hints.json
 *
 * @param {string} hintsPath — Path to the hints file
 * @returns {Object} hints data
 */
function loadHintsFile(hintsPath) {
  const raw = fs.readFileSync(hintsPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Filter entries matching the given criteria
 *
 * Filters are AND conditions. Unspecified filters are ignored.
 *
 * @param {Object} hintsData — hints data
 * @param {{ idFilter: string|null, diagnosisFilter: string|null, refIdFilter: string|null }} filters — Filter criteria
 * @returns {Array} Filtered entries
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
 * Format entries as Markdown
 *
 * @param {Array} entries — Array of filtered entries
 * @param {Object} hintsData — Original hints data (for metadata display)
 * @returns {string} Markdown string
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

    // Per-token match status
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

    // Candidate heading lines
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
    process.stdout.write(`query-fix-hints.js — _fix_graph_hints.json 検索・Markdown 整形表示

Usage:
  query-fix-hints.js --hints=<path> [--id=<nodeId>] [--diagnosis=<M0..M10>] [--refId=<refId>]

Options:
  --hints=<path>     _fix_graph_hints.json のパス
  --id=<nodeId>      特定ノードIDでフィルタ（例: --id=N0100）
  --diagnosis=<M0..M10>  特定診断種別でフィルタ（例: --diagnosis=M1）
  --refId=<refId>    特定 refId でフィルタ（例: --refId=REF101）
  --help, -h         このヘルプを表示

Exit codes:
  0  正常終了
  1  エラー終了（ファイル不在・引数不正等）
`);
    process.exit(0);
  }

  let hintsData;
  try {
    hintsData = loadHintsFile(parsed.hintsPath);
  } catch (e) {
    if (e.code === 'ENOENT') {
      process.stderr.write(`エラー: ファイルが見つかりません: ${parsed.hintsPath}\n`);
    } else if (e instanceof SyntaxError) {
      process.stderr.write(`エラー: JSON のパースに失敗しました: ${e.message}\n`);
    } else {
      process.stderr.write(`エラー: ${e.message}\n`);
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
// Exports
// ============================================================

module.exports = {
  parseArguments,
  loadHintsFile,
  filterEntries,
  formatAsMarkdown,
};

if (require.main === module) main();
