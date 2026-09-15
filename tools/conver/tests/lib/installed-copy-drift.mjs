// [::TICKET::] P25-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P25-1 --for-spec --no-implementation-order`.
/**
 * installed-copy-drift — how far each installed copy of a library has fallen
 * behind the source of record, measured and named.
 *
 * An installed copy is delivered material: it is what a conver project runs, and
 * the installer decides when it advances. So a copy that lags is not by itself a
 * defect and re-syncing it is not this module's business. What was missing is the
 * statement — a fourth module could join the three that lag and nothing would say
 * so. This module measures and names; the caller decides, and the record it is
 * compared against lives in the test.
 *
 * The measure is deliberately three lists rather than a count. A count would read
 * the same whether a copy is missing a module or carrying a fork of it, and those
 * are opposite findings: `absent` is a lag, `extra` is a fork, `differing` is a lag
 * that has not yet removed the file.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The tree the copies are measured against. */
export const SOURCE_LIBRARY = 'tools/conver/.claude/scripts/workspacify-reverse/lib';

/** The copies this repository carries, relative to the repository root. */
export const INSTALLED_COPIES = Object.freeze([
  '.claude/scripts/workspacify-reverse/lib',
  'crates/siprs/.claude/scripts/workspacify-reverse/lib',
]);

/** Only ESM modules are compared; a copy carrying other file types is a different finding. */
const MODULE_SUFFIX = '.mjs';

/**
 * The module names in a directory, sorted, or an empty list when it is not there.
 *
 * @param {string} directory
 * @returns {string[]}
 */
// [::TICKET::] P25-1, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-1|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function moduleNames(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(MODULE_SUFFIX)).sort();
}

/**
 * Measure one installed copy against the source of record.
 *
 * @param {{ repositoryRoot: string, source: string, copy: string }} input
 * @returns {{ path: string, present: boolean, modules: number, absent: string[], extra: string[], differing: string[] }}
 */
// [::TICKET::] P25-1, P25-2, P25-3, P25-4, P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-1|P25-2|P25-3|P25-4|P25-5|P25-6) --for-spec --no-implementation-order`.
function measureCopy({ repositoryRoot, source, copy }) {
  const sourceDirectory = join(repositoryRoot, source);
  const copyDirectory = join(repositoryRoot, copy);
  const sourceModules = moduleNames(sourceDirectory);
  const copyModules = moduleNames(copyDirectory);
  const shared = sourceModules.filter((name) => copyModules.includes(name));

  return {
    path: copy,
    present: existsSync(copyDirectory),
    modules: copyModules.length,
    absent: sourceModules.filter((name) => !copyModules.includes(name)),
    extra: copyModules.filter((name) => !sourceModules.includes(name)),
    differing: shared.filter((name) => !readFileSync(join(sourceDirectory, name)).equals(readFileSync(join(copyDirectory, name)))),
  };
}

/**
 * Measure every installed copy against the source of record.
 *
 * @param {{ repositoryRoot: string, source?: string, copies?: readonly string[] }} input
 * @returns {{ source: { path: string, modules: number }, copies: ReturnType<typeof measureCopy>[] }}
 */
export function measureInstalledCopyDrift({ repositoryRoot, source = SOURCE_LIBRARY, copies = INSTALLED_COPIES }) {
  return {
    source: { path: source, modules: moduleNames(join(repositoryRoot, source)).length },
    copies: copies.map((copy) => measureCopy({ repositoryRoot, source, copy })),
  };
}

/**
 * Render the measurement as the report a person reads.
 *
 * Every drifting path is named, because a reader who has to re-derive the
 * measurement to act on it has been given a summary rather than a finding.
 *
 * @param {ReturnType<typeof measureInstalledCopyDrift>} report
 * @returns {string} Markdown
 */
export function renderDriftReport(report) {
  const lines = [
    '## Installed copy drift',
    '',
    `Source of record: \`${report.source.path}\` — **${report.source.modules}** module(s)`,
    '',
  ];

  for (const copy of report.copies) {
    lines.push(`### \`${copy.path}\``);
    if (!copy.present) {
      lines.push('', '**not installed** — the directory is absent, which is a different finding from a lag');
      continue;
    }
    lines.push(
      '',
      `- modules: **${copy.modules}** against ${report.source.modules}`,
      `- absent from the copy (${copy.absent.length}): ${copy.absent.length > 0 ? copy.absent.join(', ') : 'none'}`,
      `- differing bytes (${copy.differing.length}): ${copy.differing.length > 0 ? copy.differing.join(', ') : 'none'}`,
      `- present only in the copy (${copy.extra.length}): ${copy.extra.length > 0 ? copy.extra.join(', ') : 'none'}`,
    );
  }

  return lines.join('\n');
}
