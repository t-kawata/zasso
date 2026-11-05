#!/usr/bin/env node
// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
/**
 * Recover progress-gif/snapshots/usage-cache.json from its git history.
 *
 * Usage:
 *   recover-usage-cache.js -d <repo>            # report only
 *   recover-usage-cache.js -d <repo> --write    # rewrite the ledger
 *
 * The report is Markdown because the operator reads it directly. Without
 * --write the command touches no file; the recovery itself only reads git.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CACHE_FILE, recoverUsageLedger } from './progress-gif/usage-recovery.js';

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { directory: process.cwd(), file: DEFAULT_CACHE_FILE, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-d' || argument === '--directory') options.directory = argv[++index];
    else if (argument === '--file') options.file = argv[++index];
    else if (argument === '--write') options.write = true;
    else if (argument === '-h' || argument === '--help') return null;
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.directory) throw new Error('--directory requires a path');
  return options;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function formatDollars(value) {
  return (Math.ceil((Number(value) || 0) * 100) / 100).toFixed(2);
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function renderReport(result, options) {
  const lines = [
    '# recover-usage-cache',
    '',
    `repo: ${path.resolve(options.directory)}`,
    `cache: ${options.file}`,
    '',
    `- revisions: ${result.revisions.length}`,
    `- records: ${result.records}`,
    `- tokens I/C/O: ${result.cacheMissInputTokens} / ${result.cacheHitInputTokens} / ${result.outputTokens}`,
    `- cost: $${formatDollars(result.costUsd)}`,
  ];
  if (result.revisions.length > 0) {
    lines.push('', '## revisions');
    for (const revision of result.revisions) {
      lines.push(`- ${revision.revision.slice(0, 7)} ${revision.committedAt} records=${revision.records}`);
    }
  }
  if (result.days.length > 0) {
    lines.push('', '## days', '| date | records | I | C | O | D |', '|---|---|---|---|---|---|');
    for (const day of result.days) {
      lines.push(`| ${day.date} | ${day.records} | ${day.cacheMissInputTokens} | ${day.cacheHitInputTokens} | ${day.outputTokens} | $${formatDollars(day.costUsd)} |`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push('', '## warnings');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-376 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-376 --for-spec --no-implementation-order`.
function showUsage() {
  process.stdout.write('usage: recover-usage-cache.js -d <repo> [--file <path>] [--write]\n');
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`[ERROR] ${error.message}\n`);
    process.exit(2);
  }
  if (!options) {
    showUsage();
    return;
  }
  const outputPath = options.write ? path.join(options.directory, options.file) : null;
  const result = await recoverUsageLedger({
    repoRoot: options.directory,
    filePath: options.file,
    outputPath,
    write: options.write,
  });
  process.stdout.write(renderReport(result, options));
  if (options.write) process.stdout.write(`\nwrote: ${outputPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`[ERROR] ${error.message}\n`);
    process.exit(1);
  });
}
