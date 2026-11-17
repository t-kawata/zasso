'use strict';

/**
 * PX-441 C003/C008 — changed-mode selection and invalidation accounting.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runProofs } = require('../../.claude/scripts/tickets/lib/proof-engine.js');
const { inputsDigestOf, invalidationReasonOf } = require('../../.claude/scripts/tickets/lib/proof-inputs.js');

/** A complete input tuple for one clause. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function inputsOf(suffix) {
  return {
    version: 1,
    clauseKey: 'clause|pkg-alpha|C001|precondition|' + suffix,
    mutationFile: 'alpha.js',
    mutationFileDigest: 'sha256:m-' + suffix,
    mutationDigest: 'sha256:x-' + suffix,
    testId: 'alpha-' + suffix,
    testDigest: 'sha256:t-' + suffix,
    commandTemplate: 'node runner.js {test}',
    commandDigest: 'sha256:c-' + suffix,
    closureScope: 'package',
    closureDigest: 'sha256:d-' + suffix,
    engineVersion: 2,
    adapterVersion: 1,
    toolchainDigest: 'sha256:k-' + suffix,
  };
}

/** A proof bound to the tuple. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function proofFor(inputs) {
  return {
    status: 'PROVEN',
    verifiedAt: '2026-11-17T00:00:00Z',
    restored: true,
    inputsVersion: inputs.version,
    inputsDigest: inputsDigestOf(inputs),
    inputs,
    closureScope: inputs.closureScope,
    digests: { source: inputs.mutationFileDigest, test: inputs.testDigest, command: inputs.commandDigest },
  };
}

test('C003: changed mode skips a fresh proof and runs a stale one', () => {
  const freshInputs = inputsOf('a');
  const staleInputs = inputsOf('b');
  const fresh = { key: 'a', test: { id: 'alpha-a', digest: freshInputs.testDigest }, proof: proofFor(freshInputs), inputs: freshInputs };
  const stale = { key: 'b', test: { id: 'alpha-b', digest: staleInputs.testDigest }, proof: { ...proofFor(staleInputs), inputsDigest: 'sha256:old' }, inputs: staleInputs };
  const seen = [];

  const run = runProofs({
    clauses: [fresh, stale],
    mode: 'changed',
    runProof: (entry) => { seen.push(entry.key); return { status: 'PROVEN' }; },
  });

  assert.deepEqual(seen, ['b']);
  assert.equal(run.ran, 1);
  assert.equal(run.skipped, 1);
});

test('C003: all mode runs every entry regardless of freshness', () => {
  const inputs = inputsOf('a');
  const fresh = { key: 'a', test: { id: 'alpha-a', digest: inputs.testDigest }, proof: proofFor(inputs), inputs };
  const seen = [];

  runProofs({ clauses: [fresh], mode: 'all', runProof: (entry) => { seen.push(entry.key); return { status: 'PROVEN' }; } });

  assert.deepEqual(seen, ['a']);
});

test('C008: invalidatedBy reasons distinguish source, test, command and legacy proofs', () => {
  const inputs = inputsOf('a');
  const proof = proofFor(inputs);

  assert.equal(invalidationReasonOf({ proof, inputs, inputsOk: true }), null);
  assert.equal(invalidationReasonOf({ proof, inputs: { ...inputs, mutationFileDigest: 'sha256:other' }, inputsOk: true }), 'source');
  assert.equal(invalidationReasonOf({ proof, inputs: { ...inputs, testDigest: 'sha256:other' }, inputsOk: true }), 'test');
  assert.equal(invalidationReasonOf({ proof, inputs: { ...inputs, commandDigest: 'sha256:other' }, inputsOk: true }), 'command');
  assert.equal(invalidationReasonOf({ proof: { ...proof, inputsDigest: undefined }, inputs, inputsOk: true }), 'legacy');
  assert.equal(invalidationReasonOf({ proof: null, inputs, inputsOk: true }), 'missing');
  assert.equal(invalidationReasonOf({ proof, inputs: null, inputsOk: false }), 'unknown');
});
