// PX-231 @verifies C004
//
// A path that leaves the process leaves it in an error message as readily as in a
// document, and the terminal is where a person first meets the machine's own name for
// itself. Each entry below drives one of the functions that throws with a path, with
// every path placed beneath an injected home, and asks the same two questions of the
// message: does it name this machine, and does it name the path at all.
//
// The second question is not decoration. A change that dropped the path from a message
// would satisfy the first question by saying less, and a diagnostic that does not say
// which file it looked for is worse than one that says too much.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadWorkspace } from '../../../.claude/scripts/explain-seed/lib/workspace.mjs';
import { readSeed } from '../../../.claude/scripts/explain-seed/lib/seed-document.mjs';
import { verifyRecordedHashes } from '../../../.claude/scripts/explain-seed/lib/verify.mjs';
import { loadOrderFacts } from '../../../.claude/scripts/explain-seed/lib/order.mjs';

/** A home no machine has, so a message that used the real one would be visible. */
const INJECTED_HOME = '/tmp/px231-message-home';

/**
 * The identity a seed records. Its paths are workspace-relative, which is what the seed
 * format records: the reader joins them onto the root it resolved from the seed itself.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function recordedIdentity() {
  return {
    package: { id: 'pkg-0001', name: 'alpha' },
    source_spec: { path: 'spec.md', sha256: 'unused' },
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'unused' },
    stage2_manifest: { path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json' },
  };
}

/**
 * Run `subject`, which must fail, and answer with the message it failed with.
 *
 * The home is set for the duration so that a conversion inside the throwing function
 * reads the injected value rather than the machine's own.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function messageFrom(subject) {
  const previous = process.env.HOME;
  process.env.HOME = INJECTED_HOME;
  try {
    subject();
  } catch (error) {
    return error.message;
  } finally {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
  }
  throw new Error('the subject was expected to fail and did not, so it proves nothing here');
}

/**
 * One fixture tree beneath the injected home, holding whatever the caller writes into it.
 *
 * It lives under the home rather than in the system temporary directory for the reason the
 * ticket exists: a fixture outside every home directory cannot tell a converted path from
 * an unconverted one, because both come out absolute.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function fixtureUnderHome(build = () => {}) {
  mkdirSync(INJECTED_HOME, { recursive: true });
  const root = mkdtempSync(join(INJECTED_HOME, 'fixture-'));
  build(root);
  return root;
}

test('C004 invariant: a missing workspace manifest names the seed home-relative', () => {
  const root = fixtureUnderHome();
  const seedPath = join(root, 'crates', 'alpha', 'RFC-SEED.md');
  mkdirSync(join(root, 'crates', 'alpha'), { recursive: true });

  const message = messageFrom(() => loadWorkspace({ seedPath, identity: recordedIdentity() }));

  assert.equal(message.includes(INJECTED_HOME), false, `the message names this machine: ${message}`);
  assert.ok(message.includes('~/'), `the message must still name the path, home-relative: ${message}`);
});

test('C004 invariant: an unreadable seed names it home-relative', () => {
  const root = fixtureUnderHome();

  const message = messageFrom(() => readSeed(join(root, 'absent', 'RFC-SEED.md')));

  assert.equal(message.includes(INJECTED_HOME), false, `the message names this machine: ${message}`);
  assert.ok(message.includes('~/'), `the message must still name the path, home-relative: ${message}`);
});

test('C004 invariant: an unreadable specification names it home-relative', () => {
  const root = fixtureUnderHome((where) => {
    writeFileSync(
      join(where, 'WORKSPACIFY-TREE-MANIFEST.json'),
      JSON.stringify({ workspace: { packages: [] }, inventory: {} }),
      'utf8',
    );
  });
  const seedPath = join(root, 'crates', 'alpha', 'RFC-SEED.md');
  mkdirSync(join(root, 'crates', 'alpha'), { recursive: true });

  const message = messageFrom(() => loadWorkspace({ seedPath, identity: recordedIdentity() }));

  assert.equal(message.includes(INJECTED_HOME), false, `the message names this machine: ${message}`);
  assert.ok(message.includes('~/'), `the message must still name the path, home-relative: ${message}`);
});

test('C004 invariant: a recorded hash that does not reproduce names the artefact home-relative', () => {
  const root = fixtureUnderHome();
  const specPath = join(root, 'spec.md');

  const identity = recordedIdentity();
  identity.source_spec.sha256 = 'a hash no file reproduces';

  const message = messageFrom(() => verifyRecordedHashes({
    identity,
    workspace: { root, specPath, specBytes: Buffer.from('the bytes that do not match the recorded hash\n', 'utf8') },
    seedText: 'the seed text',
  }));

  assert.equal(message.includes(INJECTED_HOME), false, `the message names this machine: ${message}`);
  assert.ok(message.includes('~/'), `the message must still name the path, home-relative: ${message}`);
});

test('C004 invariant: an implementation order belonging to another tree names both roots home-relative', () => {
  const root = fixtureUnderHome();
  const seedPath = join(root, 'crates', 'alpha', 'RFC-SEED.md');
  mkdirSync(join(root, 'crates', 'alpha'), { recursive: true });

  const message = messageFrom(() => loadOrderFacts({ root: join(root, 'elsewhere'), seedPath, packages: [] }));

  assert.equal(message.includes(INJECTED_HOME), false, `the message names this machine: ${message}`);
  assert.ok(message.includes('~/'), `the message must still name the path, home-relative: ${message}`);
});

test.after(() => {
  rmSync(INJECTED_HOME, { recursive: true, force: true });
});
