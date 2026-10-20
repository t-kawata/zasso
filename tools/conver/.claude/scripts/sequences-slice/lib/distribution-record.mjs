// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
/**
 * The record of how many times a package's view changed when it was distributed.
 *
 * The count lives beside SEQUENCES.json rather than inside it. A counter embedded in the
 * view would change the view bytes on every increment, so the next projection would see a
 * difference it produced itself and count a distribution that never happened. The digest
 * is the comparison key: a projection counts only when the view JSON it is about to write
 * differs from the one this record already names.
 *
 * The record is provenance, not design input. It is deliberately absent from
 * PACKAGE_DESIGN_FILES, so a regeneration neither copies it nor commits it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DISTRIBUTIONS_FILE_NAME = 'SEQUENCES-DISTRIBUTIONS.json';
export const DISTRIBUTIONS_SCHEMA_VERSION = 1;

const RECORD_INDENT = 2;

/** The record path inside one package directory. */
export function distributionRecordPath(packageDirectory) {
  return join(packageDirectory, DISTRIBUTIONS_FILE_NAME);
}

/** The digest that says whether a projected view moved. */
export function digestOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The record, or null when it is absent or cannot be trusted.
 *
 * An unreadable record is unknown provenance, not a reason to stop the projection: the
 * view is still written, and the next projection records a fresh first distribution.
 *
 * @param {string} packageDirectory
 * @returns {{ distributions: number, digest: string }|null}
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readDistributionRecord(packageDirectory) {
  const recordPath = distributionRecordPath(packageDirectory);
  if (!existsSync(recordPath)) return null;
  try {
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    if (record?.schemaVersion !== DISTRIBUTIONS_SCHEMA_VERSION) return null;
    if (!Number.isInteger(record.distributions) || record.distributions < 0) return null;
    if (typeof record.digest !== 'string' || record.digest.length === 0) return null;
    return { distributions: record.distributions, digest: record.digest };
  } catch {
    // The record is unknown, not the view; the caller answers with a fresh count.
    return null;
  }
}

/**
 * Write the record by building it beside its target and renaming it into place.
 *
 * A reader must never observe half a counter: the staged name is not a record, and a
 * rename that cannot land removes it rather than leaving a second file beside the real one.
 *
 * @param {string} packageDirectory
 * @param {{ distributions: number, digest: string }} record
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function writeDistributionRecord(packageDirectory, { distributions, digest }) {
  const target = distributionRecordPath(packageDirectory);
  const staged = `${target}.partial`;
  try {
    writeFileSync(staged, `${JSON.stringify({
      schemaVersion: DISTRIBUTIONS_SCHEMA_VERSION,
      distributions,
      digest,
    }, null, RECORD_INDENT)}\n`);
    renameSync(staged, target);
  } catch (error) {
    if (existsSync(staged)) unlinkSync(staged);
    throw error;
  }
}
