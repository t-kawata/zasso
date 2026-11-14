import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_ROOT = fileURLToPath(new URL('../okf', import.meta.url));
const ENTRY = 'pages/pjsip-build-guide/preamble';

function runCli(skillRoot, args) {
  return spawnSync(process.execPath, [join(skillRoot, 'scripts/cli.mjs'), ...args], { encoding: 'utf8' });
}

function sandboxCopy() {
  const sandbox = mkdtempSync(join(tmpdir(), 'okf-sandbox-'));
  for (const part of ['okf', 'source', 'scripts', 'okf-core']) {
    cpSync(join(SKILL, part), join(sandbox, part), { recursive: true });
  }
  cpSync(join(SKILL, 'atoms.lock.json'), join(sandbox, 'atoms.lock.json'));
  return sandbox;
}

test('over-budget context refuses instead of truncating', () => {
  const sandbox = sandboxCopy();
  try {
    const result = runCli(sandbox, ['context', '--entry', ENTRY, '--budget', '1', '--root', join(sandbox, 'okf')]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BUDGET_EXCEEDED/);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('an absent concept id is an error with candidates, never an empty answer', () => {
  const sandbox = sandboxCopy();
  try {
    const result = runCli(sandbox, ['show', 'pages/pjsip-build-guide/absent', '--root', join(sandbox, 'okf')]);
    assert.equal(result.status, 2);
    assert.match(`${result.stdout}${result.stderr}`, /candidate/i);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('lint rejects a broken body link', () => {
  const sandbox = sandboxCopy();
  try {
    const conceptPath = join(sandbox, 'okf', 'pages/pjsip-build-guide/preamble.md');
    writeFileSync(conceptPath, `${readFileSync(conceptPath, 'utf8')}\n[gone](./gone.md)\n`);
    const result = runCli(sandbox, ['validate', '--mode', 'lint', '--root', join(sandbox, 'okf')]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /LINK_BROKEN/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('conformance rejects a concept without frontmatter', () => {
  const sandbox = sandboxCopy();
  try {
    writeFileSync(join(sandbox, 'okf', 'pages/pjsip-build-guide/preamble.md'), '# No frontmatter\n');
    const result = runCli(sandbox, ['validate', '--mode', 'conformance', '--root', join(sandbox, 'okf')]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FRONTMATTER_MISSING/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('the installed copy keeps the same refusal for an over-budget context', () => {
  const target = mkdtempSync(join(tmpdir(), 'okf-install-'));
  try {
    const install = spawnSync(process.execPath, [join(SKILL, 'install.js'), target], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    const installed = join(target, '.claude/skills/pjsip-build-okf');
    const result = spawnSync(process.execPath, [join(installed, 'dist/skill.mjs'), 'context', '--entry', ENTRY, '--budget', '1'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BUDGET_EXCEEDED/);
    assert.ok(!existsSync(join(installed, 'node_modules')));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('the bundle still parses after the negative runs', () => {
  const result = runCli(SKILL, ['validate', '--mode', 'conformance', '--root', SOURCE_ROOT]);
  assert.equal(result.status, 0, result.stdout);
});
