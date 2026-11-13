// @verifies C009
/**
 * PX-424 — the producer's shared engine copies match the law originals.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEngineDrift } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/drift.mjs';

const ENGINE_DIR = new URL('../../../.claude/scripts/amend-rfc-up/okf-engine/', import.meta.url).pathname;
const LAW_SKILL_DIR = new URL('../../../.claude/skills/rust-interface-law/', import.meta.url).pathname;

test('C009: every shared module is byte-identical to its law original', () => {
  assert.equal(assertEngineDrift({ engineDir: ENGINE_DIR, lawSkillDir: LAW_SKILL_DIR }), true);
});
