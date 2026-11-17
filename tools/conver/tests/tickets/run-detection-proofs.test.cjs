'use strict';

/**
 * PX-436 C005 — executed detection proofs.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  runDetectionProof,
  runProofs,
  applyMutation,
  observeFailingTest,
} = require('../../.claude/scripts/tickets/lib/proof-engine.js');
const { inputsDigestOf } = require('../../.claude/scripts/tickets/lib/proof-inputs.js');

const FIXTURE = path.resolve(__dirname, 'fixtures/proof-project');
const ORIGINAL_RETURN = "return 'saved:' + value;";

/** A real isolated copy of the tiny fixture. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function isolate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px436-proof-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  return { root, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/** Run the fixture's own runner in the isolated copy. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function io(overrides = {}) {
  return {
    runCommand: ({ cwd, timeoutMs }) => {
      const result = spawnSync(process.execPath, [path.join(cwd, 'runner.js')], { cwd, encoding: 'utf8', timeout: timeoutMs });
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '', timedOut: result.signal === 'SIGTERM' };
    },
    ...overrides,
  };
}

/** The clause under proof. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function clause() {
  return { key: 'clause|pkg-alpha|C001|postcondition|abcdef0123456789' };
}

test('C005: a localized mutation that makes the mapped test fail is PROVEN', () => {
  const result = runDetectionProof({
    clause: clause(),
    testId: 'alpha_saves',
    testDigest: 'sha256:test',
    mutation: { file: 'implementation.js', strategy: 'replace-return', find: ORIGINAL_RETURN, replace: "return 'corrupted';" },
    command: 'node runner.js {test}',
    isolate: isolate(),
    io: io(),
  });

  assert.equal(result.status, 'PROVEN');
  assert.deepEqual(result.observed.failingTests, ['alpha_saves']);
  assert.equal(result.restored, true);
});

test('C005: a mutation that leaves the suite green is CLAUSE_PROOF_FAILED, never PROVEN', () => {
  const result = runDetectionProof({
    clause: clause(),
    testId: 'alpha_saves',
    testDigest: 'sha256:test',
    mutation: { file: 'implementation.js', strategy: 'replace-return', find: ORIGINAL_RETURN, replace: ORIGINAL_RETURN },
    command: 'node runner.js {test}',
    isolate: isolate(),
    io: io(),
  });

  assert.equal(result.status, 'CLAUSE_PROOF_FAILED');
  assert.equal(result.restored, true);
});

test('C005: a timeout is UNSTABLE, never PROVEN', () => {
  const result = runDetectionProof({
    clause: clause(),
    testId: 'alpha_saves',
    testDigest: 'sha256:test',
    mutation: { file: 'implementation.js', strategy: 'replace-return', find: ORIGINAL_RETURN, replace: "return 'corrupted';" },
    command: 'node runner.js {test}',
    isolate: isolate(),
    io: io({ runCommand: () => ({ status: null, stdout: '', stderr: '', timedOut: true }) }),
  });

  assert.equal(result.status, 'UNSTABLE');
});

test('C005: a missing runner is a repair item, never PASS', () => {
  const result = runDetectionProof({
    clause: clause(),
    testId: 'alpha_saves',
    testDigest: 'sha256:test',
    mutation: { file: 'implementation.js', strategy: 'replace-return', find: ORIGINAL_RETURN, replace: "return 'corrupted';" },
    command: 'missing-runner {test}',
    isolate: isolate(),
    io: io({ runCommand: () => ({ status: null, stdout: '', stderr: 'ENOENT', timedOut: false, errorCode: 'ENOENT' }) }),
  });

  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.notEqual(result.status, 'PROVEN');
});

test('C005: the proof records source, test and command digests', () => {
  const result = runDetectionProof({
    clause: clause(),
    testId: 'alpha_saves',
    testDigest: 'sha256:test',
    mutation: { file: 'implementation.js', strategy: 'replace-return', find: ORIGINAL_RETURN, replace: "return 'corrupted';" },
    command: 'node runner.js {test}',
    isolate: isolate(),
    io: io(),
  });

  assert.match(result.digests.source, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.digests.test, 'sha256:test');
  assert.match(result.digests.command, /^sha256:[0-9a-f]{64}$/);
});

test('C005: applyMutation refuses when the declared text is absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px436-mutate-'));
  try {
    const file = path.join(root, 'a.js');
    fs.writeFileSync(file, 'const x = 1;\n');
    const result = applyMutation({ file, mutation: { strategy: 'replace-return', find: 'not present', replace: 'x' } });
    assert.equal(result.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C005: failure detection requires the mapped test name and a failure marker', () => {
  assert.equal(observeFailingTest({ output: 'test alpha_saves ... FAILED', testId: 'alpha_saves' }), true);
  assert.equal(observeFailingTest({ output: 'error: build failed', testId: 'alpha_saves' }), false);
  assert.equal(observeFailingTest({ output: 'test other ... FAILED', testId: 'alpha_saves' }), false);
});

test('C005: --proofs=changed skips fresh proofs and runs stale or missing ones', () => {
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
  const inputs = {
    version: 1, clauseKey: 'a', mutationFile: 'a.js', mutationFileDigest: 'sha256:source',
    mutationDigest: 'sha256:mutation', testId: 't', testDigest: 'sha256:t',
    commandTemplate: 'runner {test}', commandDigest: 'sha256:command',
    closureScope: 'package', closureDigest: 'sha256:closure', engineVersion: 2,
    adapterVersion: 1, toolchainDigest: 'sha256:toolchain',
  };
  const fresh = {
    key: 'a', test: { digest: 'sha256:t' }, inputs,
    proof: {
      status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z', restored: true,
      inputsVersion: 1, inputsDigest: inputsDigestOf(inputs), inputs, closureScope: 'package',
      digests: { source: 'sha256:source', test: 'sha256:t', command: 'sha256:command' },
    },
  };
  const stale = { key: 'b', test: { digest: 'sha256:t' }, inputs, proof: { status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z', restored: true, inputsVersion: 1, inputsDigest: 'sha256:old', inputs, closureScope: 'package', digests: { source: 'sha256:source', test: 'sha256:t', command: 'sha256:command' } } };
  const missing = { key: 'c', test: { digest: 'sha256:t' }, inputs, proof: null };
  const seen = [];
  runProofs({ clauses: [fresh, stale, missing], mode: 'changed', runProof: (entry) => { seen.push(entry.key); return { status: 'PROVEN' }; } });
  assert.deepEqual(seen, ['b', 'c']);

  const all = [];
  runProofs({ clauses: [fresh, stale, missing], mode: 'all', runProof: (entry) => { all.push(entry.key); return { status: 'PROVEN' }; } });
  assert.deepEqual(all, ['a', 'b', 'c']);
});
