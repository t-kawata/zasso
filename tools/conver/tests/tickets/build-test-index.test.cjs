'use strict';

/**
 * PX-436 C004 — adapter-driven test index.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildTestIndex } = require('../../.claude/scripts/tickets/build-test-index.js');
const rustAdapter = require('../../.claude/scripts/tickets/lib/adapters/rust.js');
const genericManifestAdapter = require('../../.claude/scripts/tickets/lib/adapters/generic-manifest.js');

const RUST_FIXTURE = path.resolve(__dirname, 'fixtures/rust-index');
const GENERIC_FIXTURE = path.resolve(__dirname, 'fixtures/generic-manifest');

/** A deterministic runner listing, so the test does not need cargo. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function rustIo() {
  return {
    listTests: () => ['alpha_saves', 'alpha_ignored', 'beta_loads'],
  };
}

test('C004: Rust adapter indexes every test and marks the ignored one', () => {
  const index = buildTestIndex({ cwd: RUST_FIXTURE, adapter: rustAdapter, io: rustIo() });

  assert.equal(index.tests.length, 3);
  assert.equal(index.tests[0].adapter.id, 'rust');
  assert.equal(index.adapters[0].id, 'rust');
  const ignored = index.tests.filter((entry) => entry.ignored);
  assert.deepEqual(ignored.map((entry) => entry.id), ['alpha_ignored']);
  assert.equal(ignored[0].skipReason, '#[ignore]');
  assert.equal(index.tests.find((entry) => entry.id === 'alpha_saves').annotations.includes('verifies:C001/precondition'), true);
});

test('C004: every configured test-root file is indexed or reported; none is silently dropped', () => {
  const index = buildTestIndex({ cwd: RUST_FIXTURE, adapter: rustAdapter, io: rustIo() });

  assert.equal(index.reconciliation.files, 3);
  assert.equal(index.reconciliation.indexed, 2);
  assert.equal(index.reconciliation.reported, 1);
  assert.equal(index.reconciliation.indexed + index.reconciliation.reported, index.reconciliation.files);
  assert.equal(index.reconciliation.reportedFiles[0].reason, 'NO_TESTS_FOUND');
});

test('C004: every test carries a per-test digest and the index carries an index digest', () => {
  const index = buildTestIndex({ cwd: RUST_FIXTURE, adapter: rustAdapter, io: rustIo() });

  assert.equal(index.tests.every((entry) => entry.digest.startsWith('sha256:')), true);
  assert.match(index.digest, /^sha256:[0-9a-f]{64}$/);
});

test('C004: index digest is deterministic across adapter order', () => {
  const first = buildTestIndex({ cwd: RUST_FIXTURE, adapters: [rustAdapter, genericManifestAdapter], io: rustIo() });
  const second = buildTestIndex({ cwd: RUST_FIXTURE, adapters: [genericManifestAdapter, rustAdapter], io: rustIo() });

  assert.equal(first.digest, second.digest);
});

test('C004: generic manifest adapter indexes tests without source parsing', () => {
  const index = buildTestIndex({ cwd: GENERIC_FIXTURE, adapter: genericManifestAdapter });

  assert.equal(index.tests.length, 2);
  assert.equal(index.tests.find((entry) => entry.id === 'load').ignored, true);
  assert.equal(index.tests.find((entry) => entry.id === 'save').annotations[0].startsWith('verifies:clause|'), true);
});

test('C004: a monorepo with two adapters attributes each test to its adapter', () => {
  const first = { id: 'adapter-a', language: 'a', testRoots: [], extensions: [], enumerate: () => ({ tests: [{ id: 'a1', file: 'a1.a', name: 'a1', kind: 'unit', ignored: false, skipReason: null, annotations: [] }], reported: [] }) };
  const second = { id: 'adapter-b', language: 'b', testRoots: [], extensions: [], enumerate: () => ({ tests: [{ id: 'b1', file: 'b1.b', name: 'b1', kind: 'unit', ignored: false, skipReason: null, annotations: [] }], reported: [] }) };
  const index = buildTestIndex({ cwd: RUST_FIXTURE, adapters: [first, second] });

  assert.deepEqual(index.tests.map((entry) => entry.adapter.id), ['adapter-a', 'adapter-b']);
});

test('C004: a failed file is reported by the adapter, never dropped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px436-index-'));
  try {
    fs.writeFileSync(path.join(root, 'broken.zz'), 'not a test\n');
    const adapter = {
      id: 'broken-adapter',
      language: 'zz',
      testRoots: ['.'],
      extensions: ['.zz'],
      enumerate: () => ({ tests: [], reported: [{ file: 'broken.zz', reason: 'UNPARSABLE_TEST_FILE' }] }),
    };
    const index = buildTestIndex({ cwd: root, adapter });
    assert.equal(index.reconciliation.reported, 1);
    assert.equal(index.reconciliation.reportedFiles[0].reason, 'UNPARSABLE_TEST_FILE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
