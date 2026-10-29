// [::TICKET::] PX-337 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-337 --for-spec --no-implementation-order`.
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
  'lib/artifact-names.json',
  'lib/markdown-headings.js',
  'lib/node-contracts.mjs',
  'show-node-contracts.mjs',
  'deduplicate-headings.js',
  'verify.js',
  'resolve-by-heading.js',
  'query.js',
  'test-query-all.js',
  'analyze-source-structure.js',
  'boundify-helpers.js',
  'boundify-tree.js',
  'boundify-graph-to-dirs.js',
  'generate-dir-template.js',
  'reverse-boundify.js',
];

/** The three canonical command directories. */
const COMMAND_ROOTS = [
  path.join(PACKAGE_ROOT, '.claude/commands'),
  path.join(WORKSPACE_ROOT, '.claude/commands'),
  path.join(WORKSPACE_ROOT, 'crates/siprs/.claude/commands'),
];

/** The command documents this ticket edits. */
const COMMAND_FILES = ['boundify-graph.md', 'graphify-rfc.md'];

/** The three canonical drill-rfc-down script directories. */
const DRILL_ROOTS = [
  path.join(PACKAGE_ROOT, '.claude/scripts/drill-rfc-down'),
  path.join(WORKSPACE_ROOT, '.claude/scripts/drill-rfc-down'),
  path.join(WORKSPACE_ROOT, 'crates/siprs/.claude/scripts/drill-rfc-down'),
];

/** The drill script this ticket edits. */
const DRILL_FILES = ['refresh-file-headers.js'];

// [::TICKET::] PX-336 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-336 --for-spec --no-implementation-order`.
// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// @verifies C005
// @verifies C006
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

  it('normal: the refreshed-header script is byte-identical in the three drill trees', () => {
    for (const file of DRILL_FILES) {
      const hashes = DRILL_ROOTS.map((root) => digest(path.join(root, file)));
      assert.equal(new Set(hashes).size, 1, file);
    }
  });

  // PX-339: the boundify scripts and commands are synchronized by the same rule.
  it('normal: the boundify scripts and commands are byte-identical across the three trees', () => {
// [::TICKET::] PX-339 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-339 --for-spec --no-implementation-order`.
    for (const file of ['boundify-tree.js', 'boundify-graph-to-dirs.js']) {
      const hashes = SCRIPT_ROOTS.map((root) => digest(path.join(root, file)));
      assert.equal(new Set(hashes).size, 1, file);
    }
    for (const file of COMMAND_FILES) {
      const hashes = COMMAND_ROOTS.map((root) => digest(path.join(root, file)));
      assert.equal(new Set(hashes).size, 1, file);
    }
  });

  // PX-340: the unit-placement gate is synchronized by the same rule.
  it('normal: verify-unit-file-coverage is byte-identical across the three trees', () => {
// [::TICKET::] PX-340 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-340 --for-spec --no-implementation-order`.
    const hashes = SCRIPT_ROOTS.map((root) => digest(path.join(root, 'verify-unit-file-coverage.js')));
    assert.equal(new Set(hashes).size, 1, 'verify-unit-file-coverage.js');
  });
});
