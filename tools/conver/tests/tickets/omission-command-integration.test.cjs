'use strict';

/**
 * PX-406 — Step 0 is additive and the existing commands stay intact.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const COMMANDS = path.join(ROOT, '.claude/commands');

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function readCommand(name) {
  return fs.readFileSync(path.join(COMMANDS, name + '.md'), 'utf8');
}

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function gitHeadCommand(name) {
  return execFileSync('git', ['show', 'HEAD:tools/conver/.claude/commands/' + name + '.md'], {
    cwd: path.resolve(ROOT, '../..'),
    encoding: 'utf8',
  });
}

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function stepHeadings(text) {
  return text.split('\n').filter((line) => /^### Step /.test(line));
}

// @verifies C005
test('C005: consolidate-stubs gains Step 0 without renumbering the existing Steps', () => {
  const after = readCommand('consolidate-stubs');
  const before = gitHeadCommand('consolidate-stubs');

  assert.equal(stepHeadings(after).some((heading) => /Step 0/.test(heading)), true);
  assert.deepEqual(stepHeadings(after).filter((heading) => !/Step 0/.test(heading)), stepHeadings(before));
  assert.equal(after.includes('scan-incomplete-implementations.js'), true);
});

// @verifies C005
test('C005: find-omissions gains Step 0 without renumbering the existing Steps', () => {
  const after = readCommand('find-omissions');
  const before = gitHeadCommand('find-omissions');

  assert.equal(stepHeadings(after).some((heading) => /Step 0/.test(heading)), true);
  assert.deepEqual(stepHeadings(after).filter((heading) => !/Step 0/.test(heading)), stepHeadings(before));
  assert.equal(after.includes('omission-gap-scan.js'), true);
  assert.equal(after.includes('omission-detection-gate.js'), true);
});

// @verifies C005
test('C005: the existing consolidate-stubs and find-omissions regression tests stay green', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const result = execFileSync(process.execPath, [
    '--test',
    'tests/consolidate-stubs-doc.test.cjs',
    'tests/consolidate-stubs-gate.test.cjs',
    'tests/require-consolidated-manifest.test.cjs',
    'tests/print-manifest-for-find-omissions.test.cjs',
  ], { cwd: ROOT, encoding: 'utf8', env });

  assert.equal(result.includes('fail 0'), true);
});

// @verifies C005
test('C005: every new detector source is project-neutral', () => {
  const files = [
    '.claude/scripts/tickets/omission-detectors.json',
    '.claude/scripts/tickets/lib/omission-detectors.js',
    '.claude/scripts/tickets/lib/judgment-ledger.js',
    '.claude/scripts/tickets/lib/omission-convergence.js',
    '.claude/scripts/tickets/omission-gap-scan.js',
    '.claude/scripts/tickets/omission-detection-gate.js',
  ];
  const forbidden = /gaia|soul_id|Core Operation|Procedure Registry|\/Users\//i;

  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, forbidden, file);
  }
});
