import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplatePlan, reconcileTemplatePlan } from '../scripts/lib/template.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(here, 'fixtures/implementation/templates');

test('C002 template rendering resolves placeholders and preserves RULE annotations', () => {
  const result = renderTemplatePlan({
    interface: 'rest',
    unit: 'app-rest',
    values: { crate: 'app-rest', package: 'crates/app-rest' },
    root: templateRoot,
  });
  assert.equal(result.ok, true);
  assert.ok(result.files.length > 0);
  assert.equal(result.files.every((file) => !file.content.includes('{{')), true);
  assert.equal(result.files.every((file) => file.rules.length > 0), true);
  assert.equal(result.files.every((file) => file.content.includes('RULE: ')), true);
});

test('C002 unresolved placeholder rejects the plan and writes nothing', () => {
  const result = renderTemplatePlan({
    interface: 'rest',
    unit: 'app-rest',
    values: {},
    root: templateRoot,
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].kind, 'unresolved-placeholder');
  assert.deepEqual(result.files, []);
});

test('C002 an existing file without a marker becomes merge-required', () => {
  const repo = mkdtempSync(join(tmpdir(), 'law-template-'));
  try {
    mkdirSync(join(repo, 'src/api'), { recursive: true });
    writeFileSync(join(repo, 'src/api/mod.rs'), '// existing\n');
    const rendered = renderTemplatePlan({
      interface: 'rest',
      unit: 'app-rest',
      values: { crate: 'app-rest', package: 'app-rest' },
      root: templateRoot,
    });
    const reconciled = reconcileTemplatePlan({ plan: rendered.plan, root: repo });
    assert.equal(reconciled.files[0].mode, 'merge-required');
    assert.equal(readFileSync(join(repo, 'src/api/mod.rs'), 'utf8'), '// existing\n');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
