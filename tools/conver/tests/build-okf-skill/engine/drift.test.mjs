// @verifies C009
/**
 * PX-424 — shared engine modules must stay byte-identical to the law copies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEngineDrift } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/drift.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function createTrees() {
  const root = mkdtempSync(join(tmpdir(), 'okf-drift-'));
  const engineDir = join(root, 'okf-engine');
  const lawSkillDir = join(root, 'law');
  mkdirSync(join(engineDir, 'scripts/lib'), { recursive: true });
  mkdirSync(join(engineDir, 'source'), { recursive: true });
  mkdirSync(join(lawSkillDir, 'scripts/lib'), { recursive: true });
  const text = 'export const shared = true;\n';
  writeFileSync(join(engineDir, 'scripts/lib/markdown.mjs'), text);
  writeFileSync(join(lawSkillDir, 'scripts/lib/markdown.mjs'), text);
  writeFileSync(join(engineDir, 'source/shared-engine.json'), JSON.stringify({
    schema: 'okf-shared-engine/v1',
    modules: [{ copy: 'scripts/lib/markdown.mjs', law: 'markdown.mjs', sha256: sha256(text) }],
  }));
  return { root, engineDir, lawSkillDir };
}

test('C009: identical shared modules pass and a drifted law copy fails closed', () => {
  const trees = createTrees();
  try {
    assert.equal(assertEngineDrift(trees), true);
    assert.throws(
      () => assertEngineDrift({ ...trees, mutate: 'markdown.mjs' }),
      (error) => error.code === 'ENGINE_DRIFT',
    );
  } finally {
    rmSync(trees.root, { recursive: true, force: true });
  }
});
