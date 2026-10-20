// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
/**
 * The generation history of a smooth-sequences run.
 *
 * The detector is a repeated gate: a pass is meaningful only beside the pass before it,
 * and a persisted finding is the evidence that a repair missed. The run directory keeps
 * the current pair, the status record and every superseded pair, so a pass is never
 * silently overwritten.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ARCHIVE_DIRECTORY_NAME,
  JSON_FILE_NAME,
  MARKDOWN_FILE_NAME,
  readGenerationReport,
  renderReportJson,
  runDirectoryFor,
  statusPathFor,
  writeReport,
} from './report.mjs';

export const STATUS_SCHEMA_VERSION = 1;
export const MODE_NEW_GENERATION = 'new generation';
export const MODE_VERIFICATION = 'verification';

const STATUS_INDENT = 2;

/** The generation a status stands in; 0 when it records none. */
export function generationOf(status) {
  return Number.isInteger(status?.generation) && status.generation > 0 ? status.generation : 0;
}

/** The generation record, or null when absent or unreadable. */
export function readStatus(root) {
  const path = statusPathFor(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The digest that says whether one text moved. */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Move the pair the superseded generation wrote into its archive directory.
 *
 * The pair is renamed, never copied or deleted: the previous verdict stays readable
 * after the next generation replaces it.
 */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
function archiveCurrentPair(root, previousGeneration) {
  const runDirectory = runDirectoryFor(root);
  const archiveDirectory = join(runDirectory, ARCHIVE_DIRECTORY_NAME, String(previousGeneration));
  mkdirSync(archiveDirectory, { recursive: true });
  for (const name of [JSON_FILE_NAME, MARKDOWN_FILE_NAME]) {
    const source = join(runDirectory, name);
    if (existsSync(source)) renameSync(source, join(archiveDirectory, name));
  }
}

/**
 * Write one pass, or verify the generation already on disk.
 *
 * The order is the safety property: archive, then the report pair, then the status.
 * A crash at any boundary leaves the previous generation readable, and the status is
 * written last because it is the fact a later pass trusts. A verification writes
 * nothing at all, following educe's `begin` over an unchanged set.
 *
 * @param {{ root: string, report: object, inputDigest: string, exitCode: number,
 *   now?: string }} input
 * @returns {{ mode: string, generation: number, jsonPath: string, markdownPath: string }}
 */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
export function writeGeneration({ root, report, inputDigest, exitCode, now = new Date().toISOString() }) {
  const runDirectory = runDirectoryFor(root);
  const reportPath = join(runDirectory, JSON_FILE_NAME);
  const reportDigest = digestOf(renderReportJson(report));
  const status = readStatus(root);
  const recordedGeneration = generationOf(status);
  const currentExists = readGenerationReport(root) !== null;

  if (recordedGeneration > 0 && currentExists
      && status.inputDigest === inputDigest && status.reportDigest === reportDigest) {
    return {
      mode: MODE_VERIFICATION,
      generation: recordedGeneration,
      jsonPath: reportPath,
      markdownPath: join(runDirectory, MARKDOWN_FILE_NAME),
    };
  }

  // A status that outlived its readable report still fixes the generation number: the
  // next pass continues the history instead of overwriting it under a reused number.
  const previousGeneration = recordedGeneration > 0 ? recordedGeneration : (currentExists ? 1 : 0);
  const generation = previousGeneration + 1;
  mkdirSync(runDirectory, { recursive: true });
  if (currentExists) archiveCurrentPair(root, previousGeneration);
  const paths = writeReport({ report, outputDirectory: runDirectory });
  writeFileSync(statusPathFor(root), `${JSON.stringify({
    schemaVersion: STATUS_SCHEMA_VERSION,
    generation,
    mode: MODE_NEW_GENERATION,
    measuredAt: now,
    inputDigest,
    reportDigest,
    verdict: { exitCode, findings: report.findings.length, withheld: report.withheld.length },
  }, null, STATUS_INDENT)}\n`);
  return { mode: MODE_NEW_GENERATION, generation, ...paths };
}
