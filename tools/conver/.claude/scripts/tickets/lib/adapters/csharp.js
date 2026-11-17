'use strict';

/** PX-436 — C# adapter primitives. */

const { annotationsInLine, createSourceAdapter } = require('./helpers.js');

const ID = 'csharp';
const LANGUAGE = 'csharp';
const RUNNER = 'dotnet test --filter {test}';
const TEST_ROOTS = Object.freeze(['tests']);
const EXTENSIONS = Object.freeze(['.cs']);
const TEST_ATTRIBUTE = /^\s*\[(?:Fact|Test|Theory)\b/;
const IGNORE_ATTRIBUTE = /^\s*\[Ignore\b/;
const METHOD_DECLARATION = /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:void|Task)\s+(\w+)\s*\(/;

/** Parse xUnit/NUnit attributes and the following method declaration. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFile({ file, text }) {
  const tests = [];
  let pending = { test: false, ignore: false, annotations: [] };

  for (const line of text.split('\n')) {
    if (TEST_ATTRIBUTE.test(line)) pending.test = true;
    if (IGNORE_ATTRIBUTE.test(line)) pending.ignore = true;
    pending.annotations.push(...annotationsInLine(line));

    const match = line.match(METHOD_DECLARATION);
    if (match === null) continue;
    if (pending.test) {
      tests.push({
        id: match[1],
        name: match[1],
        kind: 'unit',
        ignored: pending.ignore,
        skipReason: pending.ignore ? '[Ignore]' : null,
        annotations: [...pending.annotations],
        file,
      });
    }
    pending = { test: false, ignore: false, annotations: [] };
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
