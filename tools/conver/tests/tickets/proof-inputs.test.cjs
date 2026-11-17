'use strict';

/**
 * PX-441 C001/C004/C005 — proof experiment inputs.
 *
 * A proof is reusable only when every input that determines its outcome is
 * identical. These tests fix the input tuple, the closure fallback and the
 * toolchain fingerprint.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CLOSURE_SCOPE,
  PROOF_INPUTS_VERSION,
  computeProofInputs,
  inputsDigestOf,
  invalidationReasonOf,
  isHarnessArtifact,
  resolveDependencyClosure,
  toolchainFingerprint,
} = require('../../.claude/scripts/tickets/lib/proof-inputs.js');

/** A tiny package with one implementation, one test and one unrelated file. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-inputs-'));
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.mkdirSync(path.join(cwd, 'tests'));
  fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), 'module.exports = () => 1;\n');
  fs.writeFileSync(path.join(cwd, 'src', 'unrelated.js'), 'module.exports = () => 2;\n');
  fs.writeFileSync(path.join(cwd, 'tests', 'alpha.test.js'), "test('alpha', () => {});\n");
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{"lockfileVersion":3}\n');
  return cwd;
}

/** The adapter shape the harness consumes. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function adapterOf(overrides = {}) {
  return {
    id: 'typescript',
    language: 'typescript',
    runner: 'node runner.js {test}',
    version: 1,
    extensions: ['.js'],
    ...overrides,
  };
}

/** The mutation used by the tuple. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function mutationOf() {
  return { file: 'src/alpha.js', find: '=> 1', replace: '=> 2' };
}

/** The mapped test record. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function testEntryOf() {
  return { id: 'alpha', file: 'tests/alpha.test.js', digest: 'sha256:test-alpha' };
}

test('C001 Precondition: computeProofInputs records the complete input tuple', () => {
  const cwd = fixture();
  try {
    const result = computeProofInputs({
      cwd,
      clauseKey: 'clause|pkg-alpha|C001|precondition|aaaaaaaaaaaaaaaa',
      mutation: mutationOf(),
      testEntry: testEntryOf(),
      adapter: adapterOf(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.inputs.version, PROOF_INPUTS_VERSION);
    assert.equal(result.inputs.closureScope, CLOSURE_SCOPE.PACKAGE);
    assert.equal(result.inputs.clauseKey, 'clause|pkg-alpha|C001|precondition|aaaaaaaaaaaaaaaa');
    assert.equal(result.inputs.testDigest, 'sha256:test-alpha');
    assert.match(result.inputs.mutationFileDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(result.inputs.toolchainDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(result.inputsDigest, inputsDigestOf(result.inputs));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C001 Invariant: inputsDigest is canonical and changes with one input', () => {
  const first = { version: 1, clauseKey: 'k', testDigest: 'sha256:t', closureScope: 'package' };
  const reordered = { closureScope: 'package', testDigest: 'sha256:t', clauseKey: 'k', version: 1 };
  const changed = { ...first, testDigest: 'sha256:other' };

  assert.equal(inputsDigestOf(first), inputsDigestOf(reordered));
  assert.notEqual(inputsDigestOf(first), inputsDigestOf(changed));
});

test('C001 Postcondition: invalidationReasonOf names each changed field', () => {
  const cwd = fixture();
  try {
    const computed = computeProofInputs({
      cwd,
      clauseKey: 'clause|pkg-alpha|C001|precondition|aaaaaaaaaaaaaaaa',
      mutation: mutationOf(),
      testEntry: testEntryOf(),
      adapter: adapterOf(),
    });
    const proof = {
      status: 'PROVEN',
      restored: true,
      verifiedAt: '2026-11-17T00:00:00Z',
      inputsVersion: computed.inputs.version,
      inputsDigest: computed.inputsDigest,
      inputs: computed.inputs,
      closureScope: computed.inputs.closureScope,
      digests: { source: computed.inputs.mutationFileDigest, test: computed.inputs.testDigest, command: computed.inputs.commandDigest },
    };

    assert.equal(invalidationReasonOf({ proof, inputs: computed.inputs, inputsOk: true }), null);
    assert.equal(invalidationReasonOf({ proof, inputs: { ...computed.inputs, mutationFileDigest: 'sha256:other' }, inputsOk: true }), 'source');
    assert.equal(invalidationReasonOf({ proof, inputs: { ...computed.inputs, testDigest: 'sha256:other' }, inputsOk: true }), 'test');
    assert.equal(invalidationReasonOf({ proof, inputs: { ...computed.inputs, commandDigest: 'sha256:other' }, inputsOk: true }), 'command');
    assert.equal(invalidationReasonOf({ proof: null, inputs: computed.inputs, inputsOk: true }), 'missing');
    assert.equal(invalidationReasonOf({ proof, inputs: null, inputsOk: false }), 'unknown');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Precondition: a valid adapter closure is file-scoped', () => {
  const cwd = fixture();
  try {
    const adapter = adapterOf({
      dependencyClosure: () => ({ scope: 'file', files: ['src/alpha.js', 'tests/alpha.test.js'] }),
    });
    const closure = resolveDependencyClosure({ cwd, mutationFile: 'src/alpha.js', testFile: 'tests/alpha.test.js', adapter });

    assert.equal(closure.ok, true);
    assert.equal(closure.scope, 'file');
    assert.deepEqual(closure.files, ['src/alpha.js', 'tests/alpha.test.js']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Postcondition: absent or invalid closure falls back to package scope', () => {
  const cwd = fixture();
  try {
    fs.writeFileSync(path.join(cwd, 'Tickets.json'), '{}\n');
    fs.writeFileSync(path.join(cwd, 'OMISSION-CONVERGENCE-V3.json'), '{}\n');

    const missing = resolveDependencyClosure({ cwd, mutationFile: 'src/alpha.js', testFile: 'tests/alpha.test.js', adapter: adapterOf() });
    assert.equal(missing.ok, true);
    assert.equal(missing.scope, 'package');
    assert.equal(missing.files.some((file) => file === 'Tickets.json'), false);
    assert.equal(missing.files.some((file) => file === 'OMISSION-CONVERGENCE-V3.json'), false);

    const invalid = resolveDependencyClosure({
      cwd,
      mutationFile: 'src/alpha.js',
      testFile: 'tests/alpha.test.js',
      adapter: adapterOf({ dependencyClosure: () => { throw new Error('no graph'); } }),
    });
    assert.equal(invalid.ok, true);
    assert.equal(invalid.scope, 'package');
    assert.equal(invalid.findings[0].code, 'CLOSURE_INVALID');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Invariant: unknown closure never yields file-level reuse', () => {
  const cwd = fixture();
  try {
    const closure = resolveDependencyClosure({
      cwd,
      mutationFile: 'src/alpha.js',
      testFile: 'tests/alpha.test.js',
      adapter: adapterOf({ dependencyClosure: () => ({ scope: 'unknown', files: ['src/alpha.js'] }) }),
    });

    assert.equal(closure.scope, 'package');
    assert.notEqual(closure.scope, 'file');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C005 Postcondition: a lockfile change changes the toolchain fingerprint', () => {
  const cwd = fixture();
  try {
    const before = toolchainFingerprint({ cwd, adapter: adapterOf() });
    fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
    const after = toolchainFingerprint({ cwd, adapter: adapterOf() });

    assert.notEqual(before, after);
    assert.match(after, /^sha256:[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Invariant: harness artifacts are never package source inputs', () => {
  for (const file of ['Tickets.json', 'CONTRACT-COVERAGE.json', 'OMISSION-DISPOSITIONS.json', 'CONVER-FIND-REPORT.json', '_tmp-omissions-1.json', '.conver-boundary.json']) {
    assert.equal(isHarnessArtifact(file), true, file);
  }
  assert.equal(isHarnessArtifact('src/alpha.js'), false);
  assert.equal(isHarnessArtifact('CONVER-utils.js'), false);
  assert.equal(isHarnessArtifact('OMISSION-001.json'), true);
});

test('C004 Precondition: the TypeScript adapter resolves a local import closure', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-ts-closure-'));
  try {
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), "const beta = require('./beta');\nmodule.exports = beta;\n");
    fs.writeFileSync(path.join(cwd, 'src', 'beta.js'), 'module.exports = () => 1;\n');
    const typescript = require('../../.claude/scripts/tickets/lib/adapters/typescript.js');

    const closure = typescript.dependencyClosure({ cwd, files: ['src/alpha.js'] });
    assert.equal(closure.scope, 'file');
    assert.deepEqual(closure.files, ['src/alpha.js', 'src/beta.js']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004 Postcondition: an unresolved relative import fails the closure', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px441-ts-unresolved-'));
  try {
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.writeFileSync(path.join(cwd, 'src', 'alpha.js'), "const gone = require('./gone');\n");
    const typescript = require('../../.claude/scripts/tickets/lib/adapters/typescript.js');

    assert.throws(
      () => typescript.dependencyClosure({ cwd, files: ['src/alpha.js'] }),
      /CLOSURE_IMPORT_UNRESOLVED/
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
