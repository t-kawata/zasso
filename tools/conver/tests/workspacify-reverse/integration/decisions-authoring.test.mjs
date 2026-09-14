// @verifies C001
// @verifies C002
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
/**
 * The decisions input driven against the representative that can carry one.
 *
 * The chain cannot start without this input and the input cannot be guessed, so
 * this suite measures rather than assumes: it publishes the origin spec from a
 * scratch copy, extracts the pulse candidates that spec produces, settles them,
 * and drives `workspacify-tree gate` to COMPLETE. The candidate list the
 * settlement is judged against is the run's own, never a fixture — a fixture
 * would let the coverage assertion pass while the real candidates moved.
 *
 * **It runs over a copy.** The representative is a frozen instrument and one of
 * its neighbours is the answer key the oracle rests on, so every command is
 * pointed at a throwaway copy and the representative is asserted byte-identical
 * afterwards.
 *
 * The whole observation costs about twenty seconds — a copy, a sixteen-second
 * analysis and a three-second gate — so it runs by default rather than behind a
 * switch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { validateSpecDefects } from '../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs';
import {
  SETTLEMENT_READINGS,
  decisionsPathFor,
  settleCandidates,
} from '../helpers/decisions-authoring.mjs';
import { createScratchFrom, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Where the chain's commands live. */
const COMMAND_ROOT = join(PROJECT_ROOT, '.claude', 'scripts');

/** The origin spec the tree command consumes. */
const ORIGIN_SPEC_FILE = 'ORIGIN-LONG-SPEC.md';

/** Room for the pulse candidate list a claim-carrying specification produces. */
const OUTPUT_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * SHA-256 of the pinned decisions input.
 *
 * The settlements are judgements taken once, and this is the digest that says
 * which reading was taken: an operator reproducing or replacing the input finds
 * this constant, and an input edited without re-taking the judgement fails here
 * instead of passing quietly as the same reading.
 */
const PINNED_DECISIONS_DIGEST = '68d6a84fb85b6211cdeef0c01405e05ccaec8f7fd3d69aa24dd8ce276fc80ffd';

/** The representative that carries claims, and the one that carries none. */
const CLAIM_CARRYING = 'siprs-for-reverse';
const ZERO_CLAIM = join('tests', 'workspacify-reverse', 'fixtures', 'patterns', 'partial-conver-project');

/** A throwaway directory, so no command publishes into the project. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-9-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * Run one command of the chain and report its exit status and output.
 *
 * `extract` answers with every pulse candidate the specification produced — a
 * couple of megabytes for a claim-carrying representative — so the capture
 * buffer is sized for the real output rather than the default, and a buffer
 * that filled anyway is raised instead of parsed as truncated JSON.
 */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function runChain(command, args) {
  const result = spawnSync(process.execPath, [join(COMMAND_ROOT, command), ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: OUTPUT_BUFFER_BYTES,
  });
  if (result.error !== undefined) {
    throw new Error(`${command} could not be read: ${result.error.message}`);
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Publish the origin spec of a representative from a scratch copy, and hand back where it landed. */
// [::TICKET::] P24-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-9 --for-spec --no-implementation-order`.
function publishOriginSpec(representative) {
  const subject = join(PROJECT_ROOT, representative);
  const source = createScratchFrom(subject);
  const out = scratchOutput();
  const analysed = runChain('workspacify-reverse/run.mjs', ['analyze', source.root, '--through=r8', `--out=${out.root}`]);
  assert.equal(analysed.status, 0, `${representative}: the reverse run publishes the origin spec`);
  assert.equal(existsSync(join(out.root, ORIGIN_SPEC_FILE)), true, `${representative}: ${ORIGIN_SPEC_FILE} was published`);
  return { subject, source, out, specPath: join(out.root, ORIGIN_SPEC_FILE) };
}

test('IT — the pinned decisions input is the reading that was taken, byte for byte', () => {
  const pinnedPath = decisionsPathFor(CLAIM_CARRYING, PROJECT_ROOT);
  const digest = sha256Hex(readFileSync(pinnedPath));

  assert.equal(digest, PINNED_DECISIONS_DIGEST, 'the pinned input is the reading the digest records');
  const pinned = JSON.parse(readFileSync(pinnedPath, 'utf8'));
  assert.equal(
    pinned.decisions_input.spec_digest.length,
    64,
    'the record carries the digest of the origin spec the reading was taken over, not only the path it happened to sit at',
  );
});

test('IT C002 — every pulse candidate of the run\'s own list is settled exactly once, and the gate judges the settlement it was handed', () => {
  const published = publishOriginSpec(CLAIM_CARRYING);
  try {
    const extracted = runChain('workspacify-tree/run.mjs', ['extract', published.specPath]);
    assert.equal(extracted.status, 0, 'extract publishes the pulse candidate list');
    const measured = JSON.parse(extracted.stdout);
    const candidates = measured.spec_pulse.candidates;
    assert.ok(candidates.length > 0, 'the origin spec reports pulse candidates');

    const settled = settleCandidates({ candidates, readings: SETTLEMENT_READINGS });
    assert.equal(
      settled.spec_defects.length + settled.residual_questions.length,
      candidates.length,
      'the settled count equals the candidate count over the run\'s own list',
    );
    assert.deepEqual(
      validateSpecDefects({ candidates, specDefects: settled.spec_defects, residualQuestions: settled.residual_questions }),
      { ok: true, errors: [] },
    );

    // The pinned input settles the same candidate set the run just produced:
    // the run is deterministic, so a divergence is a real finding.
    const pinned = JSON.parse(readFileSync(decisionsPathFor(CLAIM_CARRYING, PROJECT_ROOT), 'utf8'));
    const pinnedIds = [...(pinned.spec_defects ?? []), ...(pinned.residual_questions ?? [])].map((record) => record.candidate_id);
    assert.deepEqual(pinnedIds.slice().sort(), candidates.map((candidate) => candidate.id).sort());
  } finally {
    published.source.dispose();
    published.out.dispose();
  }
});

test('IT C001 — the gate prints COMPLETE over a scratch copy of the claim-carrying representative, and leaves it byte-identical', () => {
  const before = hashTree(join(PROJECT_ROOT, CLAIM_CARRYING));
  const published = publishOriginSpec(CLAIM_CARRYING);
  try {
    const gated = runChain('workspacify-tree/run.mjs', [
      'gate',
      `--spec=${published.specPath}`,
      `--decisions=${decisionsPathFor(CLAIM_CARRYING, PROJECT_ROOT)}`,
    ]);
    const summary = JSON.parse(gated.stdout);

    assert.equal(gated.status, 0, `the gate exits 0:\n${gated.stderr.slice(0, 2000)}`);
    assert.equal(summary.status, 'COMPLETE');
    assert.equal(summary.finalAudit.unallocated_count, 0, 'every harvested item has an owner');
    assert.equal(summary.finalAudit.spec_defect_count, 0, 'every pulse candidate is settled');
    assert.equal(summary.finalAudit.ownership_disagreement_count, 0);
  } finally {
    published.source.dispose();
    published.out.dispose();
  }

  assert.deepEqual(hashTree(join(PROJECT_ROOT, CLAIM_CARRYING)), before, 'the representative was not modified');
});

test('IT C001 boundary — a representative whose spec carries no claim is reported as not proved, with the gate and the reason named', () => {
  const published = publishOriginSpec(ZERO_CLAIM);
  try {
    const refused = runChain('workspacify-tree/run.mjs', [
      'gate',
      `--spec=${published.specPath}`,
      `--decisions=${decisionsPathFor(ZERO_CLAIM, PROJECT_ROOT)}`,
    ]);
    const refusal = JSON.parse(refused.stdout);

    assert.equal(refusal.status, 'REVIEW_REQUIRED', 'a zero-claim subject is not proved rather than presented as complete');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /production-library pkg-\d+ owns no objects or claims; likely a speculative split/);
  } finally {
    published.source.dispose();
    published.out.dispose();
  }
});
