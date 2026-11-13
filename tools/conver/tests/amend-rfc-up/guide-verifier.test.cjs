'use strict';

/**
 * PX-418 — the guide and the canonical verifier expose the same checks.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// @verifies C013
test('C013: IMPLEMENTATION-LEFTOVERS.md documents the canonical verifier', async () => {
  const guidePath = path.resolve(
    __dirname,
    '../../.claude/skills/rust-interface-law/IMPLEMENTATION-LEFTOVERS.md',
  );
  const guide = fs.readFileSync(guidePath, 'utf8');
  assert.match(guide, /verify-law-skill\.mjs/);
  assert.match(guide, /\.claude\/scripts\/amend-rfc-up\/verify-law-skill\.mjs/);
  assert.equal(guide.includes('.claude/skills/rust-interface-law/scripts/verify-law-skill.mjs'), false);
  assert.match(guide, /law-skill-verification\/v1/);
  const { VERIFIER_CHECKS } = await import(
    '../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs'
  );
  for (const check of VERIFIER_CHECKS) {
    assert.equal(guide.includes(check), true, check);
  }
});
