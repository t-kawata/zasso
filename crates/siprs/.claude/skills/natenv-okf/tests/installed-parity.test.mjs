import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../', import.meta.url));
const ROOTS = ['dist', 'okf-core', 'okf', 'source', 'tests/fixtures/runtime'];

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files.sort();
}

function digest(root) {
  const hash = createHash('sha256');
  for (const name of ROOTS) {
    for (const file of listFiles(join(root, name))) {
      hash.update(relative(root, file));
      hash.update('\0');
      hash.update(readFileSync(file));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

function installInto(target) {
  return spawnSync(process.execPath, [join(SKILL, 'install.js'), target], { encoding: 'utf8' });
}

test('the installed tree is byte-identical to the staged roots', () => {
  const target = mkdtempSync(join(tmpdir(), 'okf-parity-'));
  try {
    const result = installInto(target);
    assert.equal(result.status, 0, result.stderr);
    const installed = join(target, '.claude/skills/natenv-okf');
    assert.equal(digest(installed), digest(SKILL));
    assert.ok(readdirSync(installed).includes('SKILL.md'));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('installing twice keeps the same bytes', () => {
  const first = mkdtempSync(join(tmpdir(), 'okf-parity-'));
  const second = mkdtempSync(join(tmpdir(), 'okf-parity-'));
  try {
    assert.equal(installInto(first).status, 0);
    assert.equal(installInto(second).status, 0);
    assert.equal(
      digest(join(first, '.claude/skills/natenv-okf')),
      digest(join(second, '.claude/skills/natenv-okf')),
    );
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('the installed dist runs with no node_modules beside it', () => {
  const target = mkdtempSync(join(tmpdir(), 'okf-parity-'));
  try {
    assert.equal(installInto(target).status, 0);
    const installed = join(target, '.claude/skills/natenv-okf');
    const result = spawnSync(process.execPath, [join(installed, 'dist/skill.mjs'), 'list'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
