// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C010/C011 acceptance: a generated mini wiki is an OKF v0.2 bundle, the dist
 * CLI reads it, and the installer copies the runtime.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildMiniSkillV2 } from '../lib/fixture-v2.mjs';
import { loadBundle, validateConformance } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';

test('C010: the produced tree is an OKF v0.2 bundle with no okf/source.md', async () => {
  const skill = await buildMiniSkillV2();
  try {
    assert.equal(existsSync(join(skill.skillDir, 'okf/source.md')), false);
    assert.equal(existsSync(join(skill.skillDir, 'okf/source.baseline.md')), false);
    const bundle = await loadBundle(join(skill.skillDir, 'okf'));
    assert.ok(bundle.concepts.length >= 2);
    assert.deepEqual(validateConformance(bundle), []);
    for (const concept of bundle.concepts) {
      assert.ok(concept.hasFrontmatter);
      assert.equal(typeof concept.type, 'string');
      assert.ok(concept.type.length > 0);
      assert.equal(typeof concept.title, 'string');
      assert.equal(typeof concept.description, 'string');
    }
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});

test('C011: the dist CLI lists and shows a concept, and the installer copies it', async () => {
  const skill = await buildMiniSkillV2();
  try {
    const bundleRoot = join(skill.skillDir, 'okf');
    const list = spawnSync(process.execPath, [join(skill.skillDir, 'dist/skill.mjs'), 'list', '--root', bundleRoot], { encoding: 'utf8' });
    assert.equal(list.status, 0, list.stderr);
    const entries = JSON.parse(list.stdout).entries;
    assert.ok(entries.some((entry) => entry.kind === 'directory'));

    const installRoot = mkdtempSync(join(tmpdir(), 'okf-install-'));
    const install = spawnSync(process.execPath, [join(skill.skillDir, 'install.js'), installRoot], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    const installed = join(installRoot, '.claude/skills', basename(skill.skillDir));
    const installedList = spawnSync(process.execPath, [join(installed, 'dist/skill.mjs'), 'list', '--root', join(installed, 'okf')], { encoding: 'utf8' });
    assert.equal(installedList.status, 0, installedList.stderr);
    rmSync(installRoot, { recursive: true, force: true });
  } finally {
    rmSync(skill.root, { recursive: true, force: true });
  }
});
