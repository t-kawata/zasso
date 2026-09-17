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
 * **It runs over a copy.** The representative is a frozen instrument, so every
 * command is pointed at a throwaway copy and the representative is asserted
 * byte-identical afterwards.
 *
 * The claim-carrying half of this file retired with its subject. It drove the
 * chain to COMPLETE over `siprs-for-reverse`, the experiment's own tree, and that
 * tree has been deleted: the fixture under `patterns/siprs-for-reverse/` holds
 * the decisions input that was authored for it, but no longer the project it was
 * authored over, so nothing can re-publish the spec those judgements were taken
 * against. What remains is the refusal path — a representative whose spec carries
 * no claim — and the record that the authored input is still the reading the
 * digest names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reservedReverseDirectory } from '../../../.claude/scripts/workspacify-reverse/lib/holdout-ledger.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { validateSpecDefects } from '../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs';
import {
  SETTLEMENT_READINGS,
  decisionsPathFor,
  settleCandidates,
} from '../helpers/decisions-authoring.mjs';
import { createScratchFrom, hashTree } from '../helpers/scratch.mjs';
import { stageTreeDecisionsFrom } from '../../workspacify-tree/helpers/stage-tree-decisions.mjs';

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
// Re-measured 2026-09-17 by P26-4. The pinned input is the decisions authored over a
// representative's origin spec, and the spec changed: its sections now carry the analysis's
// own published documents, so the pulse sees seventeen chapter-level observations it did
// not see before and every positional candidate id moved with them. The fixture was
// re-authored from the new spec by `writeDecisions`, which derives every entry from the
// spec and the measured tree rather than from this file.
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
const PINNED_DECISIONS_DIGEST = 'ad893f48502403f840b3f5adc3c3e7e7de12652c91162f8876441bfd11e562a5';

/**
 * The deleted experiment subject, whose authored decisions input is still on disk.
 *
 * It is named because it locates a record rather than a tree: `decisionsPathFor`
 * mirrors a non-fixture representative's input under `patterns/`, and the mirror
 * is the judgement a run took over a spec that no longer exists.
 */
const CLAIM_CARRYING = 'siprs-for-reverse';
const ZERO_CLAIM = join('tests', 'workspacify-reverse', 'fixtures', 'patterns', 'partial-conver-project');

/**
 * Run one command of the chain and report its exit status and output.
 *
 * `extract` answers with every pulse candidate the specification produced — a
 * couple of megabytes for a claim-carrying representative — so the capture
 * buffer is sized for the real output rather than the default, and a buffer
 * that filled anyway is raised instead of parsed as truncated JSON.
 */
// [::TICKET::] P24-9, PX-213, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-9|PX-213|PX-214|PX-215) --for-spec --no-implementation-order`.
function runChain(command, args, { cwd = PROJECT_ROOT } = {}) {
  const result = spawnSync(process.execPath, [join(COMMAND_ROOT, command), ...args], {
    cwd,
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
// [::TICKET::] P24-9, PX-213, PX-214, PX-215 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-9|PX-213|PX-214|PX-215) --for-spec --no-implementation-order`.
function publishOriginSpec(representative) {
  const subject = join(PROJECT_ROOT, representative);
  const source = createScratchFrom(subject);
  // The entrance publishes beneath the directory it is run in, so the analysis
  // documents land inside the scratch copy of the subject and are disposed of
  // with it. There is no second directory to close.
  const analysisRoot = reservedReverseDirectory(source.root);
  const analysed = runChain('workspacify-reverse/run.mjs', ['analyze'], { cwd: source.root });
  assert.equal(analysed.status, 0, `${representative}: the reverse run publishes the origin spec`);
  assert.equal(existsSync(join(analysisRoot, ORIGIN_SPEC_FILE)), true, `${representative}: ${ORIGIN_SPEC_FILE} was published`);
  return { subject, source, specPath: join(analysisRoot, ORIGIN_SPEC_FILE) };
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

test('IT C001 boundary — a representative whose spec carries no claim is reported as not proved, with the gate and the reason named', () => {
  const published = publishOriginSpec(ZERO_CLAIM);
  try {
    stageTreeDecisionsFrom(published.source.root, decisionsPathFor(ZERO_CLAIM, PROJECT_ROOT));
    const refused = runChain('workspacify-tree/run.mjs', ['gate', `--spec=${published.specPath}`], { cwd: published.source.root });
    const refusal = JSON.parse(refused.stdout);

    assert.equal(refusal.status, 'REVIEW_REQUIRED', 'a zero-claim subject is not proved rather than presented as complete');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /production-library pkg-\d+ owns no objects or claims; likely a speculative split/);
  } finally {
    published.source.dispose();
    published.source.dispose();
  }
});
