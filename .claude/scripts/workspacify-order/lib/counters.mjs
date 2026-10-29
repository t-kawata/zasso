// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-282, PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-282|PX-285) --for-spec --no-implementation-order`.
import { readGenerationNumber as readSmoothGenerationNumber } from '../../smooth-sequences/lib/generation.mjs';
import { readDistributionRecord } from '../../sequences-slice/lib/distribution-record.mjs';

export const EDUSEQUENCES_DIRECTORY = 'educe-sequences';
export const SMOOTH_SEQUENCES_DIRECTORY = 'smooth-sequences';
export const STATUS_FILE_NAME = 'status.json';

/** The status file a grill session keeps in its package directory. */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const PACKAGE_STATUS_FILE_NAME = 'Status.json';

/** The status suffix each downstream stage writes beside its artifact stem. */
// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
export const GRAPHIFY_STATUS_SUFFIX = '-GRAPHIFY-Status.json';
export const BOUNDIFY_STATUS_SUFFIX = '-BOUNDIFY-Status.json';
export const SPLIT_STATUS_SUFFIX = '-SPLIT-Status.json';

/** The generation a grill opens on every new run. */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const FIRST_GENERATION = 1;

/** The status fields that carry the two generations. */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const GRILL_GENERATION_FIELD = 'grillGeneration';
export const DISTRIBUTION_GENERATION_FIELD = 'distributionGeneration';

/** The sessions a status written before generations existed records. */
const COMPLETED_SESSIONS_FIELD = 'completedSessions';

/** The design document whose map block proves at least one distribution generation. */
const RFC_FILE_NAME = 'RFC.md';

/** The fence that marks a distribution map inside the RFC. */
const DISTRIBUTION_MAP_FENCE = /^```json\s+distribution-map\s*$/m;

/**
 * One JSON document, or null with the reason it could not be read.
 *
 * The reason is returned rather than swallowed so a future caller can report it without
 * re-reading the file. The public readers below answer null, which is the whole answer a
 * display needs.
 */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
function readJsonFile(path) {
  if (!existsSync(path)) return { value: null, reason: 'absent' };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), reason: null };
  } catch (error) {
    return { value: null, reason: `unreadable: ${error.message}` };
  }
}

/** A positive integer, or null for every other value. */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function educeGenerationOf(status) {
  const generation = educeGenerationOfStatus(status);
  return generation > 0 ? generation : null;
}

/** The root educe generation, or null when the run directory records none. */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readRootEduceGeneration(root) {
  const status = readJsonFile(join(root, EDUSEQUENCES_DIRECTORY, STATUS_FILE_NAME)).value;
  return status === null ? null : educeGenerationOf(status);
}

/** The root smooth generation, or null when smooth has not written a generation. */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readRootSmoothGeneration(root) {
  const status = readJsonFile(join(root, SMOOTH_SEQUENCES_DIRECTORY, STATUS_FILE_NAME)).value;
  if (status === null) return null;
  const generation = readSmoothGenerationNumber(status);
  return generation > 0 ? generation : null;
}

/**
 * The completed grill sessions a package records, or null when it records none.
 *
 * The field is written by update-status.js on the transition into DONE. A Status.json from
 * before that field existed answers null, which the display reads as "unknown" and renders
 * with the document mark rather than as zero sessions.
 */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readCompletedSessions(packageDirectory) {
  const value = readJsonFile(join(packageDirectory, STATUS_FILE_NAME)).value?.completedSessions;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** Whether an RFC carries the map a distribution generation writes. */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
function carriesDistributionMap(rfcPath) {
  if (!existsSync(rfcPath)) return false;
  try {
    return DISTRIBUTION_MAP_FENCE.test(readFileSync(rfcPath, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * The grill generation a package stands in, or null when it records none.
 *
 * A status written before the field existed counts the sessions that reached DONE, which
 * is a lower bound rather than a reconstruction. Zero completed sessions is no generation
 * at all, so it answers null and the display keeps its unknown mark.
 */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function readGrillGeneration(packageDirectory) {
  const status = readJsonFile(join(packageDirectory, PACKAGE_STATUS_FILE_NAME)).value;
  if (status === null) return null;
  const generation = status[GRILL_GENERATION_FIELD];
  if (Number.isInteger(generation) && generation >= FIRST_GENERATION) return generation;
  const sessions = status[COMPLETED_SESSIONS_FIELD];
  return Number.isInteger(sessions) && sessions >= FIRST_GENERATION ? sessions : null;
}

/**
 * The distribution generation the grill recorded, or null when none is provable.
 *
 * A status written before the field existed falls back to one when the RFC already carries
 * a map, because that map is one distribution the package received; the history before it
 * is unknown and is not guessed.
 */
// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function readDistributionGeneration(packageDirectory) {
  const status = readJsonFile(join(packageDirectory, PACKAGE_STATUS_FILE_NAME)).value;
  const recorded = status?.[DISTRIBUTION_GENERATION_FIELD];
  if (Number.isInteger(recorded) && recorded >= 0) return recorded;
  return carriesDistributionMap(join(packageDirectory, RFC_FILE_NAME)) ? FIRST_GENERATION : null;
}

/** The distribution record a package carries, or null when it carries none. */
// [::TICKET::] PX-282 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-282 --for-spec --no-implementation-order`.
export function readPackageDistribution(packageDirectory) {
  return readDistributionRecord(packageDirectory);
}

/** One downstream stage generation, or null when the status is absent or unknown. */
// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
export function readStageGeneration(packageDirectory, stem, suffix) {
  if (typeof stem !== 'string' || stem.length === 0) return null;
  const status = readJsonFile(join(packageDirectory, `${stem}${suffix}`)).value;
  const generation = status?.generation;
  return Number.isInteger(generation) && generation > 0 ? generation : null;
}

/** One downstream stage run count, or null when the status is absent or unknown. */
// [::TICKET::] PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-313 --for-spec --no-implementation-order`.
export function readStageRuns(packageDirectory, stem, suffix) {
  if (typeof stem !== 'string' || stem.length === 0) return null;
  const status = readJsonFile(join(packageDirectory, `${stem}${suffix}`)).value;
  const runs = status?.runs;
  return Number.isInteger(runs) && runs >= 0 ? runs : null;
}

/** The graphify generation a package records, or null. */
export function readGraphGeneration(packageDirectory, stem) {
  return readStageGeneration(packageDirectory, stem, GRAPHIFY_STATUS_SUFFIX);
}

/** The boundify generation a package records, or null. */
export function readBoundifyGeneration(packageDirectory, stem) {
  return readStageGeneration(packageDirectory, stem, BOUNDIFY_STATUS_SUFFIX);
}

/** The split generation a package records, or null. */
export function readSplitGeneration(packageDirectory, stem) {
  return readStageGeneration(packageDirectory, stem, SPLIT_STATUS_SUFFIX);
}

/** The graphify run count a package records, or null. */
export function readGraphRuns(packageDirectory, stem) {
  return readStageRuns(packageDirectory, stem, GRAPHIFY_STATUS_SUFFIX);
}

/** The boundify run count a package records, or null. */
export function readBoundifyRuns(packageDirectory, stem) {
  return readStageRuns(packageDirectory, stem, BOUNDIFY_STATUS_SUFFIX);
}

/** The split run count a package records, or null. */
export function readSplitRuns(packageDirectory, stem) {
  return readStageRuns(packageDirectory, stem, SPLIT_STATUS_SUFFIX);
}
