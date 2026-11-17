'use strict';

/** PX-436 — TypeScript/JavaScript adapter primitives. */

const { annotationsInLine, compareText, createSourceAdapter } = require('./helpers.js');

const ID = 'typescript';
const LANGUAGE = 'typescript';
const RUNNER = 'npx vitest run {test}';
const TEST_ROOTS = Object.freeze(['tests', 'src']);
const EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.jsx']);
const TEST_DECLARATION = /\b(?:it|test)(?:\.(skip|todo|only|concurrent))?\s*\(\s*(['"`])([^'"`]+)\2/;

/** Parse test declarations and their ignore modifiers. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const tests = [];
  let annotations = [];
  for (const line of text.split('\n')) {
    annotations.push(...annotationsInLine(line));
    const match = line.match(TEST_DECLARATION);
    if (match === null) continue;
    const modifier = match[1] ?? '';
    const ignored = modifier === 'skip' || modifier === 'todo';
    tests.push({
      id: match[3],
      name: match[3],
      kind: 'unit',
      ignored,
      skipReason: ignored ? '.' + modifier : null,
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
  compareText,
  parseFile,
};
