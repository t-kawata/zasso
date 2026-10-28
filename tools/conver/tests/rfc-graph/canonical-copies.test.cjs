'use strict';

/**
 * canonical-copies.test.cjs — the three zasso canonical script trees stay identical
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * This is an integration test: it reads the two installed trees beside tools/conver.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** The conver package root (tools/conver). */
const PACKAGE_ROOT = path.resolve(__dirname, '../..');
/** The zasso repository root. */
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '../..');

/** The three canonical rfc-graph script directories. */
const SCRIPT_ROOTS = [
  path.join(PACKAGE_ROOT, '.claude/scripts/rfc-graph'),
  path.join(WORKSPACE_ROOT, '.claude/scripts/rfc-graph'),
  path.join(WORKSPACE_ROOT, 'crates/siprs/.claude/scripts/rfc-graph'),
];

/** The files this ticket creates or edits. */
const FILES = [
  'lib/markdown-headings.js',
  'deduplicate-headings.js',
  'verify.js',
  'resolve-by-heading.js',
  'query.js',
  'test-query-all.js',
  'analyze-source-structure.js',
];

// [::TICKET::] PX-335 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-335 --for-spec --no-implementation-order`.
function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// @verifies C005
describe('canonical copies — three zasso trees', () => {
  it('normal: the new library and the six scripts are byte-identical', () => {
    for (const file of FILES) {
      const hashes = SCRIPT_ROOTS.map((root) => digest(path.join(root, file)));
      assert.equal(new Set(hashes).size, 1, file);
    }
  });

  it('invariant: every copied file exists in every tree', () => {
    for (const file of FILES) {
      for (const root of SCRIPT_ROOTS) {
        assert.equal(fs.existsSync(path.join(root, file)), true, path.join(root, file));
      }
    }
  });
});
