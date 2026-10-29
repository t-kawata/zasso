// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
/**
 * The repair record beside a smooth-sequences run.
 *
 * A finding is closed only when a reader can see which file was edited, what evidence
 * the edit rested on, and which command re-derived the verdict. The record is a side
 * file rather than a generated document, because the detector itself is read-only: the
 * repair is an act of the operator (or the grill), and the record is its receipt.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from './errors.mjs';

export const REPAIR_FILE_NAME = 'SMOOTH-SEQUENCES-REPAIRS.json';
export const REPAIR_SCHEMA_VERSION = 1;

/** The empty record for a workspace that has not been repaired yet. */
// [::TICKET::] PX-274 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-274 --for-spec --no-implementation-order`.
function emptyRecord(workspaceRoot) {
  return { schemaVersion: REPAIR_SCHEMA_VERSION, workspace: workspaceRoot, repairs: [] };
}

/** Read the record, or the empty record when none exists. */
export function readRepairRecord(workspaceRoot) {
  const path = join(workspaceRoot, REPAIR_FILE_NAME);
  if (!existsSync(path)) return emptyRecord(workspaceRoot);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SmoothSequencesError(`${REPAIR_FILE_NAME} is not valid JSON: ${path}`, {
      code: 'UNREADABLE_REPAIR_RECORD',
      path,
      repair: `Repair the JSON in ${path}: ${error.message}`,
    });
  }
}

/** Write the record. */
export function writeRepairRecord(workspaceRoot, record) {
  const path = join(workspaceRoot, REPAIR_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/**
 * Close one finding with the file and evidence that justify the closure.
 *
 * @param {string} workspaceRoot
 * @param {{ checkId: string, subject: string }} finding
 * @param {{ file?: string, evidence?: string, before?: string, after?: string, command?: string }} details
 * @returns {object} the recorded entry
 */
export function closeFinding(workspaceRoot, finding, details = {}) {
  const file = finding.file ?? details.file;
  const evidence = finding.evidence ?? details.evidence;
  if (typeof file !== 'string' || file.trim() === '') {
    throw new SmoothSequencesError(`finding ${finding.checkId} carries no file`, {
      code: 'REPAIR_WITHOUT_FILE',
      path: workspaceRoot,
      repair: 'Name the RFC.md or OBLIGATION.json that carries the repair.',
    });
  }
  if (typeof evidence !== 'string' || evidence.trim() === '') {
    throw new SmoothSequencesError(`finding ${finding.checkId} carries no evidence`, {
      code: 'REPAIR_WITHOUT_EVIDENCE',
      path: workspaceRoot,
      repair: 'Cite the specification line, RFC section or registry clause the repair rests on.',
    });
  }
  const record = readRepairRecord(workspaceRoot);
  const entry = {
    checkId: finding.checkId,
    subject: finding.subject,
    file,
    evidence,
    before: details.before ?? null,
    after: details.after ?? null,
    command: details.command ?? 'node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs"',
  };
  record.repairs.push(entry);
  writeRepairRecord(workspaceRoot, record);
  return entry;
}

/**
 * Close a batch of findings with one default file/evidence.
 *
 * @param {string} workspaceRoot
 * @param {Array<{ checkId: string, subject: string }>} findings
 * @param {{ file?: string, evidence?: string, command?: string }} defaults
 * @returns {Array<object>} the recorded entries
 */
export function closeFindings(workspaceRoot, findings, defaults = {}) {
  return findings.map((finding) => closeFinding(workspaceRoot, finding, defaults));
}
