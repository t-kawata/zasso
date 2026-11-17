'use strict';

/** PX-436 — Swift adapter primitives. */

const { annotationsInLine, createSourceAdapter } = require('./helpers.js');

const ID = 'swift';
const LANGUAGE = 'swift';
const RUNNER = 'swift test --filter {test}';
const TEST_ROOTS = Object.freeze(['Tests']);
const EXTENSIONS = Object.freeze(['.swift']);
const TEST_DECLARATION = /^\s*func\s+(test\w+)\s*\(/;
const SKIP_CALL = /XCTSkip\s*\(/;

/** Parse Swift test functions and an XCTSkip in the function body. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const lines = text.split('\n');
  const tests = [];
  let annotations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    annotations.push(...annotationsInLine(line));
    const match = line.match(TEST_DECLARATION);
    if (match === null) continue;

    let ignored = SKIP_CALL.test(line);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*func\s+/.test(lines[cursor])) break;
      if (SKIP_CALL.test(lines[cursor])) {
        ignored = true;
        break;
      }
    }
    tests.push({
      id: match[1],
      name: match[1],
      kind: 'unit',
      ignored,
      skipReason: ignored ? 'XCTSkip' : null,
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
