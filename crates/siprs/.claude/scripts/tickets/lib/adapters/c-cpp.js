'use strict';

/** PX-436 — C/C++ (GoogleTest) adapter primitives. */

const { annotationsInLine, createSourceAdapter } = require('./helpers.js');

const ID = 'c-cpp';
const LANGUAGE = 'c-cpp';
const RUNNER = 'ctest -R {test}';
const TEST_ROOTS = Object.freeze(['tests']);
const EXTENSIONS = Object.freeze(['.cc', '.cpp', '.c', '.cxx']);
const TEST_DECLARATION = /^\s*TEST(?:_F)?\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/;
const DISABLED_PREFIX = 'DISABLED_';

/** Parse GoogleTest declarations and the DISABLED_ prefix. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const tests = [];
  let annotations = [];
  for (const line of text.split('\n')) {
    annotations.push(...annotationsInLine(line));
    const match = line.match(TEST_DECLARATION);
    if (match === null) continue;
    const suite = match[1];
    const name = match[2];
    const disabled = name.startsWith(DISABLED_PREFIX);
    tests.push({
      id: suite + '.' + name,
      name,
      kind: 'unit',
      ignored: disabled,
      skipReason: disabled ? DISABLED_PREFIX + ' prefix' : null,
      annotations: [...annotations],
      file,
    });
    annotations = [];
  }
  return { tests };
}

module.exports = {
  ...createSourceAdapter({ id: ID, language: LANGUAGE, runner: RUNNER, testRoots: TEST_ROOTS, extensions: EXTENSIONS, parseFile }),
  EXTENSIONS,
  ID,
  LANGUAGE,
  RUNNER,
  TEST_ROOTS,
  parseFile,
};
