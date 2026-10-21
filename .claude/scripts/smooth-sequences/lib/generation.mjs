// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
/**
 * The generation history of a smooth-sequences run.
 *
 * The detector is a repeated gate: a pass is meaningful only beside the pass before it,
 * and a persisted finding is the evidence that a repair missed. The run directory keeps
 * the current pair, the status record and every superseded pair, so a pass is never
 * silently overwritten.
 *
 * Since PX-285 the status also carries the digest of the finding identities and the
 * schema history. The first makes a verification pass distinguish "same report" from
 * "same findings"; the second makes a v3 to v2 downgrade visible instead of looking
 * like a fresh baseline.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from './errors.mjs';
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

export const STATUS_SCHEMA_VERSION = 2;
export const MODE_NEW_GENERATION = 'new generation';
export const MODE_VERIFICATION = 'verification';

const STATUS_INDENT = 2;

/** The generation a status stands in; 0 when it records none. */
export function readGenerationNumber(status) {
  return Number.isInteger(status?.generation) && status.generation > 0 ? status.generation : 0;
}

/** The generation record, or null when the file is absent. */
export function readStatus(root) {
  const path = statusPathFor(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SmoothSequencesError(`${path} is not valid JSON`, {
      code: 'UNREADABLE_STATUS',
      path,
      repair: `Repair or remove ${path}; a corrupt status is not a fresh generation.`,
    });
  }
}

/** The digest that says whether one text moved. */
// [::TICKET::] PX-281, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-281|PX-285) --for-spec --no-implementation-order`.
function computeDigest(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** The digest of the finding identities a report carries. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function computeFindingKeysDigest(findings) {
  const lines = findings.map((finding) => `${finding.checkId}\u0000${finding.subject}`).sort();
  return computeDigest(lines.join('\n'));
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
 *   findingKeysDigest?: string|null, schemaHistory?: number[], now?: string }} input
 * @returns {{ mode: string, generation: number, jsonPath: string, markdownPath: string }}
 */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function writeGeneration(input) {
  const {
    root,
    report,
    inputDigest,
    exitCode,
    findingKeysDigest = null,
    schemaHistory = [],
    now = new Date().toISOString(),
  } = input;
  const runDirectory = runDirectoryFor(root);
  const reportPath = join(runDirectory, JSON_FILE_NAME);
  const reportDigest = computeDigest(renderReportJson(report));
  const status = readStatus(root);
  const recordedGeneration = readGenerationNumber(status);
  const currentExists = readGenerationReport(root) !== null;
  const findingDigestMatches = findingKeysDigest === null || status?.findingKeysDigest === findingKeysDigest;

  if (recordedGeneration > 0 && currentExists
      && status.inputDigest === inputDigest && status.reportDigest === reportDigest
      && findingDigestMatches) {
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
  const verdict = {
    exitCode,
    findings: report.findings.length,
    blocked: (report.blocked ?? []).length,
    withheld: report.withheld.length,
    readings: report.readings?.inquest?.yes ?? 0,
  };
  if (report.verdict === 'audit') {
    verdict.audit = true;
    verdict.wouldExit = report.wouldExit;
  }
  writeFileSync(statusPathFor(root), `${JSON.stringify({
    schemaVersion: STATUS_SCHEMA_VERSION,
    generation,
    mode: MODE_NEW_GENERATION,
    measuredAt: now,
    inputDigest,
    reportDigest,
    findingKeysDigest,
    schemaHistory,
    verdict,
  }, null, STATUS_INDENT)}\n`);
  return { mode: MODE_NEW_GENERATION, generation, ...paths };
}
