// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C004/C006 — adapter primitives and vocabulary isolation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const typescript = require('../../.claude/scripts/tickets/lib/adapters/typescript.js');
const python = require('../../.claude/scripts/tickets/lib/adapters/python.js');
const go = require('../../.claude/scripts/tickets/lib/adapters/go.js');
const swift = require('../../.claude/scripts/tickets/lib/adapters/swift.js');
const cpp = require('../../.claude/scripts/tickets/lib/adapters/c-cpp.js');
const csharp = require('../../.claude/scripts/tickets/lib/adapters/csharp.js');
const genericManifest = require('../../.claude/scripts/tickets/lib/adapters/generic-manifest.js');
const { scanVocabularyLeaks } = require('../../.claude/scripts/tickets/lib/adapters/index.js');

// Sentinel tokens are assembled at runtime so the leak test does not contain
// the token it searches for inside the scanned tree.
const SENTINEL = ['PROJECT', 'ALPHA'].join('_');
const LANGUAGE_SENTINEL = ['LANG', 'X'].join('_');
const GRAMMAR_SENTINEL = ['CONTRACT', '###'].join('_');

test('C004: TypeScript .skip is reported as ignored with a skip reason', () => {
  const parsed = typescript.parseFile({ file: 'a.test.ts', text: "test('one', () => {});\nit.skip('two', () => {});\n" });
  assert.deepEqual(parsed.tests.map((entry) => [entry.id, entry.ignored]), [['one', false], ['two', true]]);
  assert.match(parsed.tests[1].skipReason, /skip/);
});

test('C004: Python pytest.mark.skip is reported as ignored', () => {
  const parsed = python.parseFile({ file: 'test_a.py', text: 'def test_one():\n    pass\n\n@pytest.mark.skip(reason="later")\ndef test_two():\n    pass\n' });
  assert.deepEqual(parsed.tests.map((entry) => [entry.id, entry.ignored]), [['test_one', false], ['test_two', true]]);
});

test('C004: Go t.Skip is reported as ignored', () => {
  const parsed = go.parseFile({ file: 'a_test.go', text: 'func TestOne(t *testing.T) {\n\tt.Skip("later")\n}\n' });
  assert.equal(parsed.tests[0].id, 'TestOne');
  assert.equal(parsed.tests[0].ignored, true);
});

test('C004: Swift XCTSkip is reported as ignored', () => {
  const parsed = swift.parseFile({ file: 'ATests.swift', text: 'func testOne() {}\nfunc testTwo() throws { throw XCTSkip("later") }\n' });
  assert.deepEqual(parsed.tests.map((entry) => [entry.id, entry.ignored]), [['testOne', false], ['testTwo', true]]);
});

test('C004: GoogleTest DISABLED_ prefix is reported as ignored and the id is Suite.Name', () => {
  const parsed = cpp.parseFile({ file: 'a.cc', text: 'TEST(Foo, One) {}\nTEST(Foo, DISABLED_Two) {}\n' });
  assert.deepEqual(parsed.tests.map((entry) => [entry.id, entry.ignored]), [['Foo.One', false], ['Foo.DISABLED_Two', true]]);
});

test('C004: C# [Ignore] is reported as ignored', () => {
  const parsed = csharp.parseFile({ file: 'A.cs', text: '[Fact]\npublic void One() {}\n\n[Fact]\n[Ignore("later")]\npublic void Two() {}\n' });
  assert.deepEqual(parsed.tests.map((entry) => [entry.id, entry.ignored]), [['One', false], ['Two', true]]);
});

test('C004: generic manifest adapter enumerates its declared tests', () => {
  const root = path.resolve(__dirname, 'fixtures/generic-manifest');
  const result = genericManifest.enumerate({ cwd: root });
  assert.equal(result.tests.length, 2);
  assert.equal(result.tests[0].adapterId, 'generic-manifest');
});

test('C006: vocabulary leak scan reports a sentinel token outside the harness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px436-leak-'));
  try {
    fs.writeFileSync(path.join(root, 'bad.js'), 'const name = "' + SENTINEL + '";\n');
    const result = scanVocabularyLeaks({ roots: [root], forbidden: [SENTINEL] });
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].token, SENTINEL);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C006: harness adapter sources contain no sentinel vocabulary', () => {
  const result = scanVocabularyLeaks({ roots: ['.claude/scripts/tickets', 'tests/tickets'], forbidden: [SENTINEL, LANGUAGE_SENTINEL, GRAMMAR_SENTINEL] });
  assert.deepEqual(result.findings, []);
});
