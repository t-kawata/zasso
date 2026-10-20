// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
/**
 * The pipeline counters the implementation order reads.
 *
 * A counter is provenance: how many generations, completed sessions or changed
 * distributions a directory has. Every reader is total. An absent, unreadable or malformed
 * record answers null, because a plan that stopped on one bad counter would replace the
 * picture with a stack trace and tell the reader less than the omission does.
 *
 * The generation rules are imported rather than restated: educe and smooth each already
 * decided what their own status means, and a second reading here would be a second answer.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { generationOf as educeGenerationOfStatus } from '../../educe-sequences/rail/run-state.mjs';
import { generationOf as smoothGenerationOf } from '../../smooth-sequences/lib/generation.mjs';
import { readDistributionRecord } from '../../sequences-slice/lib/distribution-record.mjs';

export const EDUSEQUENCES_DIRECTORY = 'educe-sequences';
export const SMOOTH_SEQUENCES_DIRECTORY = 'smooth-sequences';
export const STATUS_FILE_NAME = 'status.json';

/**
 * One JSON document, or null with the reason it could not be read.
 *
 * The reason is returned rather than swallowed so a future caller can report it without
 * re-reading the file. The public readers below answer null, which is the whole answer a
 * display needs.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function readJsonFile(path) {
  if (!existsSync(path)) return { value: null, reason: 'absent' };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), reason: null };
  } catch (error) {
    return { value: null, reason: `unreadable: ${error.message}` };
  }
}

/** A positive integer, or null for every other value. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
function positiveGeneration(status) {
  return Number.isInteger(status?.generation) && status.generation > 0 ? status.generation : null;
}

/**
 * The generation an educe status stands in; null when it records none.
 *
 * The rule is educe's own `generationOf`, imported rather than restated so a status
 * written before generations existed (phases but no number) is generation 1 here exactly
 * as it is in educe's console.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function educeGenerationOf(status) {
  const generation = educeGenerationOfStatus(status);
  return generation > 0 ? generation : null;
}

/** The root educe generation, or null when the run directory records none. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readRootEduceGeneration(root) {
  const status = readJsonFile(join(root, EDUSEQUENCES_DIRECTORY, STATUS_FILE_NAME)).value;
  return status === null ? null : educeGenerationOf(status);
}

/** The root smooth generation, or null when smooth has not written a generation. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readRootSmoothGeneration(root) {
  const status = readJsonFile(join(root, SMOOTH_SEQUENCES_DIRECTORY, STATUS_FILE_NAME)).value;
  if (status === null) return null;
  const generation = smoothGenerationOf(status);
  return generation > 0 ? generation : null;
}

/**
 * The completed grill sessions a package records, or null when it records none.
 *
 * The field is written by update-status.js on the transition into DONE. A Status.json from
 * before that field existed answers null, which the display reads as "unknown" and renders
 * with the document mark rather than as zero sessions.
 */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readCompletedSessions(packageDirectory) {
  const value = readJsonFile(join(packageDirectory, STATUS_FILE_NAME)).value?.completedSessions;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** The distribution record a package carries, or null when it carries none. */
// [::TICKET::] PX-282 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readPackageDistribution(packageDirectory) {
  return readDistributionRecord(packageDirectory);
}
