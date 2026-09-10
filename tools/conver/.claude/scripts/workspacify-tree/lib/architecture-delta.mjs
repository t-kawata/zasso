// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
/**
 * T5 — the separation of the logical architecture from the physical layout (§6.3).
 *
 * The physical layout is preserved, but it is not canonised as the design. The
 * candidate logical model and the measured layout are compared, and every
 * disagreement is written into `ARCHITECTURE-DELTA.json`.
 *
 * Agreement is deliberately *not* the pass condition. If it were, an existing
 * project's technical debt would be frozen into the canonical record as if it
 * had been designed, which is failure mode F14. What T5 passes on is that every
 * mismatch was recorded — including the case of no mismatch, which still
 * requires the record to exist.
 */
import { readFileSync } from 'node:fs';

import { GATE_STATUS, WorkSpacifyTreeError } from './errors.mjs';

/** The artefact this gate judges and the operator authors. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
export const ARCHITECTURE_DELTA_FILE_NAME = 'ARCHITECTURE-DELTA.json';

/** The gate identifier, named once so report, tests and design cannot disagree. */
export const ARCHITECTURE_DELTA_GATE_ID = 'T5';

/** A mismatch is identified by both its direction and the path it concerns. */
export function mismatchKey(mismatch) {
  return `${mismatch.kind}:${mismatch.path}`;
}

/**
 * Split a difference set into the part the record names and the part it does not.
 *
 * @param {{differences?: Array<object>, recorded?: Array<object>}} input
 * @returns {{differences: Array<object>, recorded: Array<object>, unrecorded: Array<object>}}
 */
export function recordArchitectureDelta({ differences, recorded }) {
  const differencesList = [...(differences ?? [])];
  const recordedList = [...(recorded ?? [])];
  const recordedKeys = new Set(recordedList.map(mismatchKey));
  const unrecorded = differencesList.filter((difference) => !recordedKeys.has(mismatchKey(difference)));
  return { differences: differencesList, recorded: recordedList, unrecorded };
}

/**
 * T5 — every mismatch between the logical model and the physical layout is recorded.
 *
 * @param {{differences?: Array<object>, recorded?: Array<object>, deltaFileExists?: boolean}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], unrecorded: string[]}}
 */
export function assertDeltaRecorded({ differences, recorded, deltaFileExists }) {
  const { unrecorded } = recordArchitectureDelta({ differences, recorded });
  const counts = { differences: (differences ?? []).length, unrecorded: unrecorded.length };

  if (!deltaFileExists) {
    return {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
      status: GATE_STATUS.FAIL,
      counts,
      reasons: [
        `${ARCHITECTURE_DELTA_FILE_NAME} does not exist. A run with zero mismatches still requires the record, because the record is the artefact that says the layout was examined rather than assumed`,
      ],
      unrecorded: unrecorded.map((mismatch) => mismatch.path),
    };
  }

  if (unrecorded.length > 0) {
    return {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
      status: GATE_STATUS.FAIL,
      counts,
      reasons: unrecorded.map(
        (mismatch) =>
          `${mismatch.path} is a ${mismatch.kind} mismatch that ${ARCHITECTURE_DELTA_FILE_NAME} does not record, so the difference would pass unnoticed`,
      ),
      unrecorded: unrecorded.map((mismatch) => mismatch.path),
    };
  }

  return {
    gateId: ARCHITECTURE_DELTA_GATE_ID,
    status: GATE_STATUS.PASS,
    counts,
    reasons: [
      counts.differences === 0
        ? `${ARCHITECTURE_DELTA_FILE_NAME} records that the logical model and the physical layout were compared and no mismatch was found`
        : `all ${counts.differences} mismatch(es) are recorded in ${ARCHITECTURE_DELTA_FILE_NAME}`,
    ],
    unrecorded: [],
  };
}

/**
 * Read the authored record.
 *
 * An absent file is reported as absent rather than substituted with an empty
 * record: inventing one would make T5 pass on a record nobody wrote.
 *
 * @param {string} absPath - absolute path to ARCHITECTURE-DELTA.json
 * @returns {{exists: boolean, mismatches: Array<object>}}
 */
export function loadArchitectureDelta(absPath) {
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch {
    return { exists: false, mismatches: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new WorkSpacifyTreeError(`${ARCHITECTURE_DELTA_FILE_NAME} is not valid JSON: ${error.message}`, {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
    });
  }

  if (!Array.isArray(parsed?.mismatches)) {
    throw new WorkSpacifyTreeError(
      `${ARCHITECTURE_DELTA_FILE_NAME} must carry a "mismatches" array; found ${JSON.stringify(parsed)}`,
      { gateId: ARCHITECTURE_DELTA_GATE_ID },
    );
  }

  return { exists: true, mismatches: parsed.mismatches };
}
