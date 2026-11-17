'use strict';

/** PX-436 — Python adapter primitives. */

const { annotationsInLine, createSourceAdapter } = require('./helpers.js');

const ID = 'python';
const LANGUAGE = 'python';
const RUNNER = 'pytest {test}';
const TEST_ROOTS = Object.freeze(['tests']);
const EXTENSIONS = Object.freeze(['.py']);
const TEST_DECLARATION = /^\s*def\s+(test_\w+)\s*\(/;
const SKIP_MARKER = /^\s*@pytest\.mark\.skip(?:if)?\b/;

/** Parse test functions and pytest skip markers. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const tests = [];
  let pending = { skip: false, annotations: [] };
  for (const line of text.split('\n')) {
    if (SKIP_MARKER.test(line)) pending.skip = true;
    pending.annotations.push(...annotationsInLine(line));
    const match = line.match(TEST_DECLARATION);
    if (match === null) continue;
    tests.push({
      id: match[1],
      name: match[1],
      kind: 'unit',
      ignored: pending.skip,
      skipReason: pending.skip ? 'pytest.mark.skip' : null,
      annotations: [...pending.annotations],
      file,
    });
    pending = { skip: false, annotations: [] };
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
