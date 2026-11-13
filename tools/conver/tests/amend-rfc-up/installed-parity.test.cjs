'use strict';

/**
 * PX-418 — installed copies are byte-identical to the source.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_ROOT = path.resolve(__dirname, '../../.claude');
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_TARGET_ROOTS = [
  path.join(REPO_ROOT, '.claude'),
  path.join(REPO_ROOT, 'crates/siprs/.claude'),
];
const TARGET_ROOTS = (process.env.CONVER_PARITY_ROOTS || '')
  .split(':')
  .filter(Boolean)
  .concat(DEFAULT_TARGET_ROOTS);
const FILES = [
  'commands/amend-rfc-up.md',
  'scripts/amend-rfc-up/preflight.js',
  'scripts/amend-rfc-up/request.js',
  'scripts/amend-rfc-up/changes.js',
  'scripts/amend-rfc-up/dispatch.js',
  'scripts/amend-rfc-up/law-skill-verifier.js',
  'scripts/amend-rfc-up/verify.js',
  'scripts/amend-rfc-up/report.js',
  'scripts/amend-rfc-up/material.js',
  'scripts/amend-rfc-up/rules.js',
  'scripts/amend-rfc-up/workspace.js',
  'scripts/amend-rfc-up/ticket.js',
  'scripts/amend-rfc-up/owners.js',
  'scripts/amend-rfc-up/idempotency.js',
  'scripts/amend-rfc-up/obligations.js',
  'scripts/amend-rfc-up/repair.js',
  'scripts/amend-rfc-up/verify-law-skill.mjs',
];

// @verifies C014
test('C014: installed copies are byte-identical to source', () => {
  for (const relativePath of FILES) {
    const sourcePath = path.join(SOURCE_ROOT, relativePath);
    assert.ok(fs.existsSync(sourcePath), `source missing: ${relativePath}`);
  }
  for (const targetRoot of TARGET_ROOTS) {
    if (!fs.existsSync(targetRoot)) continue;
    for (const relativePath of FILES) {
      const source = fs.readFileSync(path.join(SOURCE_ROOT, relativePath));
      const installedPath = path.join(targetRoot, relativePath);
      assert.ok(fs.existsSync(installedPath), `installed missing: ${installedPath}`);
      assert.ok(source.equals(fs.readFileSync(installedPath)), `installed copy differs: ${installedPath}`);
    }
  }
});
