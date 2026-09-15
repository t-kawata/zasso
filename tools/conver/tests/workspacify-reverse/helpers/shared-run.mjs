/**
 * Shared pipeline runs — one run per (root, stage) per suite run.
 *
 * The integration suite holds the reverse instrument to its invariants over the
 * real inputs, and it pays for that by running the whole pipeline inside every
 * test that needs a published run: about 23s over `siprs-for-reverse` and about
 * 70s over `siprs-with-4layers`. `node --test` gives each test file its own
 * process, so one file cannot hand a run to another and the sharing has to be
 * on disk.
 *
 * What makes the sharing sound rather than convenient is that a shared run is a
 * measurement and not an assumption. Three properties hold it there:
 *
 *   - the key names the instrument as well as the request, so a directory built
 *     by different library sources is not this run and is never read;
 *   - the marker file is written inside the run directory before the directory
 *     is renamed into place, so a reader that finds the directory always finds
 *     the marker, and a reader that finds no marker refuses the directory;
 *   - the run publishes into the shared root, never inside the tree it measures.
 *
 * The run is built into a temporary sibling and renamed into place, which is
 * what makes the second property hold without a lock held across the build.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';

const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT_ROOT = join(SUITE_ROOT, '..', '..');

/** The instrument whose behaviour a run measures: its sources decide what a run means. */
const INSTRUMENT_LIBRARY = join(PROJECT_ROOT, '.claude/scripts/workspacify-reverse/lib');

/** Names the marker a completed run carries. A directory without it is not a run. */
export const MARKER_FILE_NAME = '.complete.json';

/** How long a waiter gives the builder before it reports the stall rather than racing it. */
const LOCK_WAIT_MS = 5 * 60 * 1000;
const LOCK_POLL_MS = 25;

/** How many characters of each digest name a directory. Enough to separate, short enough to read. */
const KEY_LENGTH = 32;

const counters = { created: 0, reused: 0 };

let instrumentDigestCache = null;

/**
 * A digest of the reverse instrument's own sources.
 *
 * Two runs over one tree with one stage are the same measurement only while the
 * instrument that produced them is the same. This is what makes that checkable
 * rather than assumed, and it is why the digest is part of a run's key.
 */
export function instrumentDigest() {
  if (instrumentDigestCache !== null) return instrumentDigestCache;
  const digest = createHash('sha256');
  for (const name of readdirSync(INSTRUMENT_LIBRARY).sort()) {
    if (!name.endsWith('.mjs')) continue;
    digest.update(name).update('\0').update(readFileSync(join(INSTRUMENT_LIBRARY, name)));
  }
  instrumentDigestCache = digest.digest('hex');
  return instrumentDigestCache;
}

/** The directory every shared run lives under, derived from the repository so all processes agree. */
export function sharedRoot() {
  const name = createHash('sha256').update(PROJECT_ROOT).digest('hex').slice(0, 16);
  return join(tmpdir(), `wsp-shared-runs-${name}`);
}

/** What the counters say about this process's requests. */
export function sharedRunCounters() {
  return { ...counters };
}

/** Start the counters over, so a test measures its own requests rather than the file's. */
export function resetSharedRunCounters() {
  counters.created = 0;
  counters.reused = 0;
}

/**
 * The marker a completed run carries, or a refusal.
 *
 * A directory holding a run's artefacts but no marker is a directory that was
 * still being built, or one whose builder died. Either way it is not a run this
 * helper may hand to a caller, and reading it would publish a partial result
 * under the name of a whole one.
 */
export function readSharedRun(directory) {
  const markerPath = join(directory, MARKER_FILE_NAME);
  if (!existsSync(markerPath)) {
    throw new Error(
      `${directory} carries no ${MARKER_FILE_NAME} marker, so it is not a completed run. `
      + 'A run is published by being renamed into place with its marker already inside it.',
    );
  }
  return JSON.parse(readFileSync(markerPath, 'utf8'));
}

/** The directory a request is served from, named so that root, stage and instrument all separate. */
// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
function keyFor({ root, through }) {
  return createHash('sha256')
    .update(root).update('\0').update(through).update('\0').update(instrumentDigest())
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

/** A completed run already in place, or null when there is none to read. */
// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
function completedRunAt(directory, request) {
  if (!existsSync(join(directory, MARKER_FILE_NAME))) return null;
  const marker = readSharedRun(directory);
  const matches = marker.root === request.root && marker.through === request.through
    && marker.instrumentDigest === instrumentDigest();
  if (matches) return marker;
  // The key names all three, so a mismatch means the directory is not this
  // request's run. It cannot be read as one, and leaving it would make every
  // later request pay for the same refusal.
  rmSync(directory, { recursive: true, force: true });
  return null;
}

/** Wait for another process to publish the run, or report the stall rather than racing it. */
// [::TICKET::] P25-5, P25-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P25-5|P25-6) --for-spec --no-implementation-order`.
async function waitForPublishedRun(finalDirectory, request) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    const marker = completedRunAt(finalDirectory, request);
    if (marker !== null) return marker;
  }
  throw new Error(
    `no run for ${request.root} at ${request.through} was published within ${LOCK_WAIT_MS}ms, `
    + 'and this request will not build a second one: two runs of one measurement would make '
    + 'the shared directory whichever finished last.',
  );
}

/**
 * One pipeline run for a root and a stage, executed once per suite run.
 *
 * The returned directory is read-only to the caller: it is shared, so a caller
 * that wrote into it would change another test's measurement.
 *
 * @param {{root: string, through: string}} request — the tree to measure and the stage to stop at
 * @returns {Promise<{root: string, through: string}>} the directory the run published into
 */
export async function requestPipelineRun({ root, through }) {
  const request = { root, through };
  const finalDirectory = join(sharedRoot(), keyFor(request));
  mkdirSync(sharedRoot(), { recursive: true });

  const completed = completedRunAt(finalDirectory, request);
  if (completed !== null) {
    counters.reused += 1;
    return { root: finalDirectory, through };
  }

  const lockDirectory = `${finalDirectory}.lock`;
  let holdingLock = false;
  try {
    mkdirSync(lockDirectory);
    holdingLock = true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  if (!holdingLock) {
    const published = await waitForPublishedRun(finalDirectory, request);
    counters.reused += 1;
    return { root: finalDirectory, through: published.through };
  }

  const buildDirectory = mkdtempSync(join(sharedRoot(), `${keyFor(request)}.build-`));
  try {
    const pending = completedRunAt(finalDirectory, request);
    if (pending !== null) {
      counters.reused += 1;
      return { root: finalDirectory, through };
    }

    await analyzeProject({ root, out: buildDirectory, through });
    writeFileSync(
      join(buildDirectory, MARKER_FILE_NAME),
      `${JSON.stringify({ root, through, instrumentDigest: instrumentDigest() }, null, 2)}\n`,
      'utf8',
    );
    renameSync(buildDirectory, finalDirectory);
    counters.created += 1;
    return { root: finalDirectory, through };
  } finally {
    rmSync(buildDirectory, { recursive: true, force: true });
    rmSync(lockDirectory, { recursive: true, force: true });
  }
}
