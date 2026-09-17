/**
 * The committed terminal-state observation, held to the code that produces it.
 *
 * `TERMINAL-STATE.json` is design §7.3's measurement: it records what the chain did
 * over the four pattern representatives. It is produced by a run that costs what
 * three commands over four trees cost, so it is selected deliberately rather than
 * run on every test run — and that is exactly what makes it worth guarding here.
 *
 * The file used to be refreshed by the test that produced it: whenever the measured
 * record differed from the committed one, the test wrote the difference out and
 * passed. A record that had stopped describing the chain was therefore corrected by
 * the run that exists to notice, silently, and nothing ever reported it. Staleness
 * was not detected; it was erased. Regeneration is now deliberate, and these
 * assertions run on every routine test run so that a record the current code no
 * longer produces is named rather than overwritten.
 *
 * What can be checked without running the chain is the input side. Each run records
 * the decisions input it read and the digest of that input's bytes, so a later
 * reader can tell whether the judgement the run rested on is still the one on disk.
 * That claim is checkable here in full: a recorded path is hashed from the committed
 * file, and a recorded `<scratch>` is hashed from the skeleton the chain falls back
 * to. Both are cheap, and both are the claim the field makes.
 *
 * The digests below were not always right. One of them was taken over a compact
 * serialization of the skeleton while the file on disk held the indented form, so
 * the record named bytes that were never written and the two representatives that
 * read the same skeleton could not be told apart by the field that exists to name
 * what each run read. The check below is what fails when that happens again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decisionsInputDigest } from '../../../.claude/scripts/workspacify-reverse/lib/terminal-state.mjs';
import { DECISIONS_INPUT_SKELETON } from '../helpers/decisions-authoring.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The observation the chain's runs are recorded in. */
const RECORD_PATH = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'analysis', 'TERMINAL-STATE.json');

/** What the record writes when the input is the skeleton written beside the scratch copy. */
const SCRATCH_PLACEHOLDER = '<scratch>';

/** The characters a SHA-256 digest is written in. */
const SHA256_HEX_LENGTH = 64;

const RECORD = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));

/** The digest of a committed file's bytes, which is what a recorded path must name. */
// [::TICKET::] P26-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-1 --for-spec --no-implementation-order`.
function digestOfCommittedFile(relativePath) {
  return createHash('sha256').update(readFileSync(join(PROJECT_ROOT, relativePath), 'utf8'), 'utf8').digest('hex');
}

test('the record describes a run per representative, and each run names the input it read', () => {
  assert.equal(Array.isArray(RECORD.runs), true, 'the record carries the runs');
  // Two, not four: the experiment's subject and its answer key held the other two
  // places and both trees have been deleted with their runs.
  assert.equal(RECORD.runs.length, 2, 'one run per pattern representative');
  for (const run of RECORD.runs) {
    assert.equal(typeof run.representative, 'string');
    assert.equal(typeof run.decisions?.input, 'string', `${run.representative} names its decisions input`);
    assert.match(run.decisions.digest, new RegExp(`^[0-9a-f]{${SHA256_HEX_LENGTH}}$`), `${run.representative} records a digest`);
    assert.match(run.started_from, new RegExp(`^[0-9a-f]{${SHA256_HEX_LENGTH}}$`), `${run.representative} records the tree it started from`);
  }
});

// The digest is re-measured whenever the file it names is re-authored. P26-4 re-authored
// `siprs-for-reverse`'s decisions from the spec the absorption produces, so the record was
// re-measured with it: the digest is over a file the chain actually read, and leaving the
// old value would have recorded a reading of bytes that are no longer on disk.
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
test('a recorded decisions input is the bytes of the committed file it names', () => {
  const authored = RECORD.runs.filter((run) => run.decisions.input !== SCRATCH_PLACEHOLDER);
  assert.equal(authored.length > 0, true, 'at least one representative reads an authored input');
  for (const run of authored) {
    assert.equal(
      run.decisions.digest,
      digestOfCommittedFile(run.decisions.input),
      `${run.representative} records a digest over ${run.decisions.input}, which is not what that file holds`,
    );
  }
});

test('a scratch input is digested over the bytes the chain actually writes', () => {
  const scratch = RECORD.runs.filter((run) => run.decisions.input === SCRATCH_PLACEHOLDER);
  assert.equal(scratch.length > 0, true, 'at least one representative reads the fallback skeleton');
  for (const run of scratch) {
    assert.equal(
      run.decisions.digest,
      decisionsInputDigest(DECISIONS_INPUT_SKELETON),
      `${run.representative} records a digest of bytes that were never written`,
    );
  }
});
