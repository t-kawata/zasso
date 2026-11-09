'use strict';

/**
 * scaffold-test.js — generate a failing test that proves a missing contract.
 *
 * A repair that has no test yet needs a Red test, not a note. The scaffold always
 * fails first (`assert.fail`) and carries a STUB marker until the real assertion
 * replaces it. A body without an assertion is refused because it could never
 * distinguish a fix from a no-op.
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildAnnotation, commentTokenFor } = require('./annotate-ticket-context-by-git-diff.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';
const SUPPORTED_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const ASSERTION_PATTERNS = Object.freeze([
  /\bassert\s*\./,
  /\bassert\s*\(/,
  /\bexpect\s*\(/,
  /\.should\b/,
  /\bassert_eq!\s*\(/,
  /\.throws\s*\(/,
]);

/** A refused scaffold. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class ScaffoldTestError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code) {
    super(message);
    this.name = 'ScaffoldTestError';
    this.code = code;
  }
}

/** Whether the body contains an assertion that can fail. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function hasAssertion(body) {
  return ASSERTION_PATTERNS.some((pattern) => pattern.test(body));
}

/** Indent every non-empty line by two spaces. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function indentBody(body) {
  return body.split('\n').map((line) => (line.trim().length === 0 ? line : '  ' + line)).join('\n');
}

/** Escape a test name for a single-quoted JavaScript string. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function quoteTestName(testName) {
  return "'" + testName.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** The required imports a generated test file needs. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function ensureImports(content) {
  const imports = [];
  if (!/node:test/.test(content)) imports.push("const { test } = require('node:test');");
  if (!/node:assert\/strict/.test(content)) imports.push("const assert = require('node:assert/strict');");
  if (imports.length === 0) return content;
  return imports.join('\n') + '\n' + content;
}

/**
 * Build the scaffold block.
 *
 * @param {object} input
 * @returns {string}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function buildBlock({ file, ticketKey, contractId, testName, body }) {
  const commentToken = commentTokenFor(file);
  return [
    commentToken + ' @verifies ' + contractId,
    buildAnnotation(ticketKey, commentToken),
    'test(' + quoteTestName(testName) + ', () => {',
    '  ' + commentToken + ' [::STUB::] ' + ticketKey + ': scaffolded failing test for ' + contractId + ' -- replace assert.fail with the real assertion',
    "  assert.fail('scaffold: implementation missing');",
    indentBody(body),
    '});',
  ].join('\n');
}

/**
 * Scaffold a failing test.
 *
 * @param {object} input
 * @param {string} input.file
 * @param {string} input.ticketKey
 * @param {string} input.contractId
 * @param {string} input.testName
 * @param {string} input.body — must contain an assertion
 * @param {boolean} [input.dryRun]
 * @returns {{ inserted: true } | { inserted: false, reason: 'DUPLICATE' }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function scaffoldTest({ file, ticketKey, contractId, testName, body, dryRun = false }) {
  if (typeof file !== 'string' || file.trim() === '') {
    throw new ScaffoldTestError('file is required', REPAIR_TOOL_INVALID_INPUT);
  }
  if (!SUPPORTED_EXTENSIONS.has(path.extname(file))) {
    throw new ScaffoldTestError(
      'scaffold-test supports only .js, .cjs and .mjs files, received ' + path.extname(file),
      REPAIR_TOOL_INVALID_INPUT,
    );
  }
  for (const [name, value] of Object.entries({ ticketKey, contractId, testName })) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ScaffoldTestError(name + ' is required', REPAIR_TOOL_INVALID_INPUT);
    }
  }
  if (typeof body !== 'string' || body.trim() === '') {
    throw new ScaffoldTestError('body must not be empty', REPAIR_TOOL_INVALID_INPUT);
  }
  if (!hasAssertion(body)) {
    throw new ScaffoldTestError('body must contain an assertion, otherwise the test cannot fail', REPAIR_TOOL_INVALID_INPUT);
  }

  const directory = path.dirname(path.resolve(file));
  if (!fs.existsSync(directory)) {
    throw new ScaffoldTestError('target directory not found: ' + directory, REPAIR_TARGET_MISSING);
  }

  const exists = fs.existsSync(file);
  const existing = exists ? fs.readFileSync(file, 'utf8') : '';
  if (new RegExp('@verifies\\s+' + contractId.trim() + '(?![A-Za-z0-9])').test(existing)) {
    return { inserted: false, reason: 'DUPLICATE' };
  }

  const block = buildBlock({
    file,
    ticketKey: ticketKey.trim(),
    contractId: contractId.trim(),
    testName: testName.trim(),
    body: body.trimEnd(),
  });

  const content = exists
    ? ensureImports(existing) + (existing.endsWith('\n') || existing.length === 0 ? '' : '\n') + '\n' + block + '\n'
    : ensureImports('') + '\n' + block + '\n';

  if (!dryRun) {
    writeTemporaryThenRename(file, content);
  }

  return { inserted: true };
}

/** Read a `--name=value` argument. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  try {
    const result = scaffoldTest({
      file: argumentValue(args, 'file'),
      ticketKey: argumentValue(args, 'ticket-key'),
      contractId: argumentValue(args, 'contract-id'),
      testName: argumentValue(args, 'test-name'),
      body: argumentValue(args, 'body'),
      dryRun: args.includes('--dry-run'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ inserted: false, code: error.code, error: error.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { ScaffoldTestError, scaffoldTest };
