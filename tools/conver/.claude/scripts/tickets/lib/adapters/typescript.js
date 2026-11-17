'use strict';

/** PX-436 — TypeScript/JavaScript adapter primitives. */

const fs = require('node:fs');
const path = require('node:path');

const { annotationsInLine, compareText, createSourceAdapter } = require('./helpers.js');

const ID = 'typescript';
const LANGUAGE = 'typescript';
const RUNNER = 'npx vitest run {test}';
const TEST_ROOTS = Object.freeze(['tests', 'src']);
const EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.jsx']);
const TEST_DECLARATION = /\b(?:it|test)(?:\.(skip|todo|only|concurrent))?\s*\(\s*(['"`])([^'"`]+)\2/;
const IMPORT_SPECIFIERS = Object.freeze([
  /\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]);
const RESOLVE_SUFFIXES = Object.freeze(['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']);
const MAX_CLOSURE_FILES = 200;

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

/** Every module specifier a source file names. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function importSpecifiersOf(text) {
  const specifiers = new Set();
  for (const pattern of IMPORT_SPECIFIERS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      specifiers.add(match[1]);
      match = pattern.exec(text);
    }
  }
  return [...specifiers].sort(compareText);
}

/** Resolve one relative import against the filesystem. */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function resolveLocalSpecifier({ cwd, fromFile, specifier }) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (fs.existsSync(path.join(cwd, candidate)) && fs.statSync(path.join(cwd, candidate)).isFile()) return candidate;
  }
  return null;
}

/**
 * Resolve the local module closure of the mutation target and the mapped test.
 *
 * Bare imports are external dependencies covered by the lockfile fingerprint.
 * An unresolved relative import fails the closure so the caller falls back to
 * package scope instead of claiming file-level precision it cannot prove.
 */
// [::TICKET::] PX-441 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-441 --for-spec --no-implementation-order`.
function dependencyClosure({ cwd, files }) {
  const visited = new Set();
  const queue = [...files].filter((file) => typeof file === 'string' && file.length > 0);
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    if (visited.size >= MAX_CLOSURE_FILES) throw new Error('CLOSURE_LIMIT');
    let text;
    try {
      text = fs.readFileSync(path.join(cwd, file), 'utf8');
    } catch {
      throw new Error('CLOSURE_FILE_MISSING ' + file);
    }
    visited.add(file);
    for (const specifier of importSpecifiersOf(text)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveLocalSpecifier({ cwd, fromFile: file, specifier });
      if (resolved === null) throw new Error('CLOSURE_IMPORT_UNRESOLVED ' + file + ' -> ' + specifier);
      queue.push(resolved);
    }
  }
  return { scope: 'file', files: [...visited].sort(compareText) };
}

module.exports = {
  ...createSourceAdapter({ id: ID, language: LANGUAGE, runner: RUNNER, testRoots: TEST_ROOTS, extensions: EXTENSIONS, parseFile }),
  dependencyClosure,
  importSpecifiersOf,
  EXTENSIONS,
  ID,
  LANGUAGE,
  RUNNER,
  TEST_ROOTS,
  compareText,
  parseFile,
};
