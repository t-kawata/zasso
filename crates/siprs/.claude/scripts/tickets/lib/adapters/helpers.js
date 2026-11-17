'use strict';

/**
 * PX-436 — shared adapter primitives.
 *
 * Adapters declare how a language or manifest is discovered. The harness owns
 * the accounting: every configured test-root file is indexed or reported.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

/** Directories that never contain project tests worth indexing. */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'target', 'dist', 'build', '.next', 'vendor']);

/** File extensions the vocabulary scanner reads as text. */
const TEXT_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml',
  '.py', '.go', '.rs', '.swift', '.cs', '.cc', '.cpp', '.c', '.h', '.sh',
]);

/** Compare two strings by Unicode code point. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function compareText(left, right) {
  const a = Array.from(String(left ?? ''));
  const b = Array.from(String(right ?? ''));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = a[index].codePointAt(0);
    const rightPoint = b[index].codePointAt(0);
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}

/** The sha256 of a string, prefixed. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function sha256(value) {
  return 'sha256:' + createHash('sha256').update(String(value)).digest('hex');
}

/** Read a UTF-8 file. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Walk configured test roots and return project-relative file paths.
 *
 * @param {{cwd:string, roots:string[], extensions:string[]}} input
 * @returns {string[]}
 */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function walkFiles({ cwd, roots, extensions }) {
  const allowed = new Set((extensions ?? []).map((extension) => extension.toLowerCase()));
  const found = [];

// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
  function walk(relativeDirectory) {
    const absoluteDirectory = path.join(cwd, relativeDirectory);
    if (!fs.existsSync(absoluteDirectory)) return;
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      const relativePath = path.posix.join(relativeDirectory.split(path.sep).join('/'), entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(relativePath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (allowed.size === 0 || allowed.has(extension)) found.push(relativePath);
    }
  }

  for (const root of roots ?? []) walk(root);
  return [...new Set(found)].sort(compareText);
}

/** Extract `@verifies <value>` annotations from one line. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function annotationsInLine(line) {
  const annotations = [];
  const pattern = /@verifies\s+(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) annotations.push('verifies:' + match[1]);
  return annotations;
}

/** Build a source adapter from its parse primitive. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function createSourceAdapter({ id, language, runner, testRoots, extensions, parseFile }) {
  return {
    id,
    language,
    runner,
    testRoots,
    extensions,
    parseFile,
    /**
     * Enumerate tests and report every file that yielded none.
     *
     * @param {{cwd:string}} input
     */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
    enumerate({ cwd }) {
      const files = walkFiles({ cwd, roots: testRoots, extensions });
      const tests = [];
      const reported = [];
      for (const file of files) {
        const text = readText(path.join(cwd, file));
        const parsed = parseFile({ file, text });
        if (parsed.tests.length === 0) reported.push({ file, reason: parsed.reason ?? 'NO_TESTS_FOUND' });
        for (const entry of parsed.tests) tests.push({ ...entry, file, adapterId: id });
      }
      return { tests, reported, files };
    },
  };
}

module.exports = {
  SKIP_DIRECTORIES,
  TEXT_EXTENSIONS,
  annotationsInLine,
  compareText,
  createSourceAdapter,
  readText,
  sha256,
  walkFiles,
};
