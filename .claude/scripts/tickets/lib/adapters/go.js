'use strict';

/** PX-436 — Go adapter primitives. */

const { annotationsInLine, createSourceAdapter } = require('./helpers.js');

const ID = 'go';
const LANGUAGE = 'go';
const RUNNER = 'go test -run {test}';
const TEST_ROOTS = Object.freeze(['.']);
const EXTENSIONS = Object.freeze(['_test.go']);
const TEST_DECLARATION = /^\s*func\s+(Test\w+)\s*\(\s*\w+\s+\*testing\.T\s*\)/;
const SKIP_CALL = /\bt\.Skip(?:f|Now)?\s*\(/;

/** Parse Go test functions and a t.Skip in the function body. */
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

    let ignored = false;
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
      skipReason: ignored ? 't.Skip' : null,
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
