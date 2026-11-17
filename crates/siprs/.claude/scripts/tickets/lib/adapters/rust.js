'use strict';

/**
 * PX-436 — Rust adapter.
 *
 * The runner list is preferred because it is the project's own definition of a
 * test. Source parsing supplies the file, annotations and ignore reason when
 * the runner cannot be invoked.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { annotationsInLine, compareText, readText, walkFiles } = require('./helpers.js');

/** Files and markers this adapter understands. */
const ID = 'rust';
const LANGUAGE = 'rust';
// [::TICKET::] PX-442 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-442 --for-spec --no-implementation-order`.
// A bare test id is the filter cargo matches. --exact compares the fully
// qualified name and therefore matches zero bare ids.
const RUNNER = 'cargo test {test}';
const TEST_ROOTS = Object.freeze(['tests', 'src/tests']);
const EXTENSIONS = Object.freeze(['.rs']);
const TEST_ATTRIBUTE = /^\s*#\[(?:tokio::)?test\]/;
const IGNORE_ATTRIBUTE = /^\s*#\[ignore\b/;
const FUNCTION = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/;

/**
 * Parse one Rust source file.
 *
 * @param {{file:string, text:string}} input
 * @returns {{tests:object[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const tests = [];
  let pending = { test: false, ignore: false, annotations: [] };

  for (const line of text.split('\n')) {
    if (TEST_ATTRIBUTE.test(line)) pending.test = true;
    if (IGNORE_ATTRIBUTE.test(line)) pending.ignore = true;
    pending.annotations.push(...annotationsInLine(line));

    const match = line.match(FUNCTION);
    if (match === null) continue;
    if (pending.test) {
      tests.push({
        id: match[1],
        name: match[1],
        kind: 'unit',
        ignored: pending.ignore,
        skipReason: pending.ignore ? '#[ignore]' : null,
        annotations: [...pending.annotations],
        file,
      });
    }
    pending = { test: false, ignore: false, annotations: [] };
  }
  return { tests };
}

/** Run the project's own test listing when the caller supplies no seam. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function listTestsFromRunner(cwd) {
  const result = spawnSync('cargo', ['test', '--', '--list'], { cwd, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout
    .split('\n')
    .map((line) => line.match(/^(.+): test$/))
    .filter((match) => match !== null)
    .map((match) => match[1].trim());
}

/**
 * Enumerate the Rust test population.
 *
 * @param {{cwd:string, io?:{listTests:Function}}} input
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function enumerate({ cwd, io }) {
  const files = walkFiles({ cwd, roots: TEST_ROOTS, extensions: EXTENSIONS });
  const parsed = files.map((file) => ({ file, ...parseFile({ file, text: readText(path.join(cwd, file)) }) }));
  const byId = new Map();
  for (const entry of parsed) for (const test of entry.tests) byId.set(test.id, test);

  const listed = typeof io?.listTests === 'function' ? io.listTests() : null;
  const tests = [];
  const reported = [];

  if (Array.isArray(listed)) {
    for (const name of listed) {
      const test = byId.get(name);
      if (test === undefined) {
        reported.push({ file: null, reason: 'TEST_SOURCE_MISSING', id: name });
        tests.push({ id: name, name, kind: 'unit', ignored: false, skipReason: null, annotations: [], file: null });
        continue;
      }
      tests.push(test);
    }
  } else {
    for (const entry of parsed) tests.push(...entry.tests);
  }

  for (const entry of parsed) {
    if (entry.tests.length === 0) reported.push({ file: entry.file, reason: 'NO_TESTS_FOUND' });
  }

  tests.sort((left, right) => compareText(left.file ?? '', right.file ?? '') || compareText(left.id, right.id));
  return { tests, reported, files };
}

/** Extract the failing test names a Rust runner reports. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFailures(output) {
  const failures = [];
  for (const line of String(output ?? '').split('\n')) {
    const match = line.match(/^(?:test\s+)?(\S+)\s+\.\.\.\s+FAILED$/);
    if (match !== null) failures.push(match[1]);
  }
  return [...new Set(failures)].sort(compareText);
}

module.exports = {
  EXTENSIONS,
  ID,
  LANGUAGE,
  RUNNER,
  TEST_ROOTS,
  enumerate,
  extensions: EXTENSIONS,
  id: ID,
  language: LANGUAGE,
  listTestsFromRunner,
  parseFailures,
  parseFile,
  runner: RUNNER,
  testRoots: TEST_ROOTS,
  version: 1,
};
