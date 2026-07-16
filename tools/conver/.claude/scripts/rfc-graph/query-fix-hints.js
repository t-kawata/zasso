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
  if (!result.hintsPath) throw new Error('--hints=<path> is required.');
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
    return 'No matching entries found.';
  }

  const parts = [];
  parts.push(`# Fix Graph Hints`);
  parts.push('');
  parts.push(`- **Generated at**: ${hintsData.generatedAt || 'unknown'}`);
  parts.push(`- **Total entries**: ${hintsData.totalBroken || 0}`);
  parts.push(`- **Displayed**: ${entries.length}`);
  parts.push('');

  for (const entry of entries) {
    parts.push(`---`);
    parts.push('');
    parts.push(`## ${entry.diagnosis || '?'}: ${entry.nodeId || '?'} / ${entry.refId || '?'}`);
    parts.push('');
    parts.push(`| Item | Value |`);
    parts.push(`|------|-----|`);
    parts.push(`| Node | ${entry.nodeTitle || '?'} |`);
    parts.push(`| refId | ${entry.refId || '?'} |`);
    parts.push(`| heading level | h${entry.heading ?? '?'} |`);
    parts.push(`| Diagnosis | ${entry.diagnosis || '?'} |`);
    parts.push(`| Score | ${entry.score ?? '?'}% |`);
    parts.push(`| Tokens | \`${(entry.texts || []).join(', ')}\` |`);
    parts.push('');

    if (entry.summary) {
      parts.push(`**Diagnosis message**: ${entry.summary}`);
      parts.push('');
    }

    if (entry.remedyHint) {
      parts.push(`**Suggestion**: ${entry.remedyHint}`);
      parts.push('');
    }

    if (entry.remedyCommand) {
      parts.push('```bash');
      parts.push(`# Example fix command`);
      parts.push(entry.remedyCommand);
      parts.push('```');
      parts.push('');
    }

    // Per-token match status
    if (entry.details && Array.isArray(entry.details.tokenMatches)) {
      parts.push('### Per-token match status');
      parts.push('');
      parts.push('| Token | Match | Match lines |');
      parts.push('|----------|------|----------|');
      for (const tm of entry.details.tokenMatches) {
        parts.push(`| \`${tm.token}\` | ${tm.matched ? '✅' : '❌'} | ${tm.matchCount ?? '?'} |`);
      }
      parts.push('');
    }

    // Candidate heading lines
    if (entry.details && Array.isArray(entry.details.candidateLines) && entry.details.candidateLines.length > 0) {
      parts.push('### Candidate heading lines');
      parts.push('');
      parts.push('| Line | Content | Score |');
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
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }

  if (parsed.help) {
    process.stdout.write(`query-fix-hints.js — Search _fix_graph_hints.json and format as Markdown

Usage:
  query-fix-hints.js --hints=<path> [--id=<nodeId>] [--diagnosis=<M0..M10>] [--refId=<refId>]

Options:
  --hints=<path>     Path to _fix_graph_hints.json
  --id=<nodeId>      Filter by specific node ID (e.g., --id=N0100)
  --diagnosis=<M0..M10>  Filter by specific diagnosis type (e.g., --diagnosis=M1)
  --refId=<refId>    Filter by specific refId (e.g., --refId=REF101)
  --help, -h         Display this help

Exit codes:
  0  Normal completion
  1  Error exit (file not found, invalid arguments, etc.)
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
// Exports
// ============================================================

module.exports = {
  parseArguments,
  loadHintsFile,
  filterEntries,
  formatAsMarkdown,
};

if (require.main === module) main();
