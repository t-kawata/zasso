#!/usr/bin/env node
// Monthly ICOD totals for a workspace. The aggregation, price table, peak rule
// and display rounding are shared with draw-progress-gif so both views agree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkspaceError } from './progress-gif/parse.js';
import {
  DEFAULT_PRICES,
  aggregateUsage,
  dailySeries,
  expandHome,
} from './progress-gif/usage.js';
import { CACHE_FILE_NAME } from './progress-gif/usage-cache.js';
import { displayDateKey } from './progress-gif/loop.js';
import {
  buildMonthlyUsageRows,
  enumerateMonths,
  formatMonthlyIcodTable,
  resolveDefaultMonthRange,
} from './progress-gif/icod.js';

const HELP_TEXT = `Usage: node calc-monthly-icods.js -t <workspace> [--from YYYY-MM] [--to YYYY-MM]

Options:
  -t, --target <path>   Workspace whose Claude Code logs are aggregated (required)
      --from <YYYY-MM>  First month to display (default: five months before the current month)
      --to <YYYY-MM>    Last month to display (default: the current month)
  -h, --help            Show this help

The table reports monthly ICOD totals: cache-miss input, cache-hit input and
output tokens in millions, plus USD. All values use the same ceiling rounding as
the draw-progress-gif title bar. The usage cache is
<target>/progress-gif/snapshots/usage-cache.json, read and written like a normal
GIF run.
Exit codes: 0 success, 2 invalid input or missing logs, 3 unexpected failure.
`;

const CACHE_DIRECTORY = path.join('progress-gif', 'snapshots');
const MONTH_KEY_LENGTH = 7;
const EXIT_INVALID_INPUT = 2;
const EXIT_UNEXPECTED_FAILURE = 3;

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function requireMonth(value, flag) {
  try {
    enumerateMonths(value, value);
  } catch {
    throw new WorkspaceError(`${flag} must be YYYY-MM: ${value}`, EXIT_INVALID_INPUT, 'Example: --from 2026-01');
  }
  return value;
}

/** Parse the CLI contract, resolving one missing bound from the six-month default. */
export function parseArgs(argv = process.argv.slice(2), now = new Date()) {
  const options = { target: null, from: null, to: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-h' || argument === '--help') {
      options.help = true;
      continue;
    }
    if (argument === '-t' || argument === '--target') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new WorkspaceError(`${argument} requires a value`, EXIT_INVALID_INPUT, 'Pass an existing workspace directory with -t.');
      }
      options.target = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--target=')) {
      options.target = argument.slice('--target='.length);
      continue;
    }
    if (argument === '--from' || argument === '--to') {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new WorkspaceError(`${argument} requires a value`, EXIT_INVALID_INPUT, 'Pass a YYYY-MM month.');
      }
      if (argument === '--from') options.from = requireMonth(value, '--from');
      else options.to = requireMonth(value, '--to');
      index += 1;
      continue;
    }
    if (argument.startsWith('--from=')) {
      options.from = requireMonth(argument.slice('--from='.length), '--from');
      continue;
    }
    if (argument.startsWith('--to=')) {
      options.to = requireMonth(argument.slice('--to='.length), '--to');
      continue;
    }
    throw new WorkspaceError(`unknown argument: ${argument}`, EXIT_INVALID_INPUT, 'Run with --help to see the supported options.');
  }
  if (options.help) return { target: options.target, range: null, help: true };
  const defaults = resolveDefaultMonthRange(now);
  const range = { from: options.from ?? defaults.from, to: options.to ?? defaults.to };
  if (range.from > range.to) {
    throw new WorkspaceError(
      `--from ${range.from} is after --to ${range.to}`,
      2,
      'Pass a range whose first month is not after its last month.',
    );
  }
  if (!options.target) {
    throw new WorkspaceError(
      'usage: node calc-monthly-icods.js -t <workspace> [--from YYYY-MM] [--to YYYY-MM]',
      2,
      'Pass an existing workspace directory with -t.',
    );
  }
  return { target: options.target, range, help: false };
}

/** The same cache path a normal draw-progress-gif run reads and writes. */
export function resolveUsageCachePath(target) {
  return path.join(target, CACHE_DIRECTORY, CACHE_FILE_NAME);
}

/**
 * Aggregate the workspace logs with the GIF date key, then price them with the
 * GIF defaults. `configDir` stays implicit so CLAUDE_CONFIG_DIR keeps working.
 */
export async function loadUsageSeries(target, cachePath) {
  const aggregation = await aggregateUsage({
    directory: target,
    cachePath,
    dateKey: (ms) => displayDateKey(ms, 'ms'),
  });
  return { aggregation, series: dailySeries(aggregation.groups, DEFAULT_PRICES) };
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function assertWorkspaceDirectory(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new WorkspaceError(`target is not a directory: ${target}`, EXIT_INVALID_INPUT, 'Pass an existing workspace directory with -t.');
  }
  if (!stat.isDirectory()) {
    throw new WorkspaceError(`target is not a directory: ${target}`, EXIT_INVALID_INPUT, 'Pass an existing workspace directory with -t.');
  }
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function writeAggregationWarnings(aggregation, stderr) {
  if (aggregation.invalidJson > 0) {
    stderr.write(`[WARN] skipped invalid JSON lines: ${aggregation.invalidJson}\n`);
  }
  if (aggregation.invalidTimestamp > 0) {
    stderr.write(`[WARN] skipped invalid timestamps: ${aggregation.invalidTimestamp}\n`);
  }
}

// [::TICKET::] PX-453 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-453 --for-spec --no-implementation-order`.
function rangeHasRecords(series, range) {
  return (series || []).some((entry) => {
    const month = entry.date.slice(0, MONTH_KEY_LENGTH);
    return month >= range.from && month <= range.to;
  });
}

/** Run the report and write the table to stdout. */
export async function run(options, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const now = io.now || new Date();
  const target = path.resolve(expandHome(options.target));
  assertWorkspaceDirectory(target);
  const cachePath = resolveUsageCachePath(target);
  const { aggregation, series } = await loadUsageSeries(target, cachePath);
  if (aggregation.projectsDirMissing) {
    throw new WorkspaceError(
      `usage logs not found: ${aggregation.projectsDir}`,
      2,
      'Set CLAUDE_CONFIG_DIR to the Claude Code config that holds projects/.',
    );
  }
  if (aggregation.projects.length === 0) {
    throw new WorkspaceError(
      `no usage logs for workspace: ${target}`,
      2,
      'Check that -t points at the workspace whose Claude Code logs exist.',
    );
  }
  writeAggregationWarnings(aggregation, stderr);
  if (!rangeHasRecords(series, options.range)) {
    stderr.write(`[WARN] no usage records in ${options.range.from}..${options.range.to}; all months are zero\n`);
  }
  const rows = buildMonthlyUsageRows(series, options.range);
  const currentMonth = resolveDefaultMonthRange(now).to;
  const table = formatMonthlyIcodTable(rows, {
    target,
    range: options.range,
    currentMonth,
  });
  stdout.write(`${table}\n`);
  return { rows, aggregation };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      process.stdout.write(HELP_TEXT);
      return;
    }
    await run(options);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      process.stderr.write(`[ERROR] ${error.message}\nCause: ${error.message}\nAction: ${error.action || 'Fix the input and re-run.'}\n`);
      process.exit(error.exitCode || EXIT_INVALID_INPUT);
    }
    process.stderr.write(`[ERROR] ${error.message}\nCause: unexpected failure\nAction: Inspect the error and re-run.\n`);
    process.exit(EXIT_UNEXPECTED_FAILURE);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
