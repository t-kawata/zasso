'use strict';

/**
 * PX-436 — explicit test-manifest adapter.
 *
 * This adapter is the language-neutral fallback: a project that cannot or will
 * not be parsed declares its tests in TEST-MANIFEST.json. No source syntax is
 * read, so the same contract works for every language.
 */

const fs = require('node:fs');
const path = require('node:path');
const { compareText } = require('./helpers.js');

const ID = 'generic-manifest';
const LANGUAGE = 'manifest';
const RUNNER = null;
const TEST_ROOTS = Object.freeze(['.']);
const EXTENSIONS = Object.freeze([]);
const MANIFEST_FILE_NAME = 'TEST-MANIFEST.json';

/**
 * Read the explicit manifest.
 *
 * @param {{cwd:string}} input
 * @returns {{tests:object[], reported:object[], files:string[]}}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function enumerate({ cwd }) {
  const manifestPath = path.join(cwd, MANIFEST_FILE_NAME);
  if (!fs.existsSync(manifestPath)) {
    return { tests: [], reported: [{ file: MANIFEST_FILE_NAME, reason: 'MANIFEST_MISSING' }], files: [] };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tests = (manifest.tests ?? []).map((entry) => ({
    id: String(entry.id),
    name: entry.name ?? String(entry.id),
    file: entry.file ?? null,
    kind: entry.kind ?? 'unit',
    ignored: entry.ignored === true,
    skipReason: entry.skipReason ?? null,
    annotations: [...(entry.annotations ?? [])].sort(compareText),
    adapterId: ID,
  }));
  const files = [...new Set(tests.map((test) => test.file).filter((file) => typeof file === 'string'))].sort(compareText);
  const reported = (manifest.reported ?? []).map((entry) => ({ ...entry, adapterId: ID }));

  return { tests, reported, files };
}

/** Extract failing test names from a manifest runner's output. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function parseFailures(output) {
  const failures = [];
  for (const line of String(output ?? '').split('\n')) {
    const match = line.match(/^FAIL(?:ED)?\s+(\S+)/);
    if (match !== null) failures.push(match[1]);
  }
  return [...new Set(failures)].sort(compareText);
}

module.exports = {
  EXTENSIONS,
  ID,
  LANGUAGE,
  MANIFEST_FILE_NAME,
  RUNNER,
  TEST_ROOTS,
  enumerate,
  extensions: EXTENSIONS,
  id: ID,
  language: LANGUAGE,
  parseFailures,
  runner: RUNNER,
  testRoots: TEST_ROOTS,
  version: 1,
};
