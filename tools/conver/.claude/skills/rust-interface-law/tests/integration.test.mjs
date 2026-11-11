import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillRegistry, assertSkillRegistry } from '../scripts/lib/registry.mjs';
import { findForbiddenTokens } from '../scripts/lib/redact.mjs';
import { renderCoverageReport } from '../scripts/lib/report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..', '..');
const sourceDir = existsSync(join(repoRoot, 'docs', 'archive', 'IMPLEMENTATION-SPEC'))
  ? join(repoRoot, 'docs', 'archive', 'IMPLEMENTATION-SPEC')
  : join(repoRoot, 'docs', 'IMPLEMENTATION-SPEC');
const ingest = join(root, 'scripts', 'ingest.mjs');

function runIngest(args) {
  return execFileSync(process.execPath, [ingest, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('18 docs verify with 430 rules and zero gaps', () => {
  const output = runIngest(['verify', '--source', sourceDir]);
  assert.match(output, /18 files, \d+ atoms, 6749 lines/);

  const lock = JSON.parse(readFileSync(join(root, 'atoms.lock.json'), 'utf8'));
  const coverage = JSON.parse(readFileSync(join(root, 'coverage.json'), 'utf8'));
  const rules = lock.atoms.filter((atom) => atom.type === 'Rule');

  assert.equal(rules.length, 430);
  assert.equal(new Set(rules.map((atom) => atom.id)).size, 430);
  assert.equal(coverage.files.length, 18);
  assert.equal(coverage.files.reduce((total, file) => total + file.lines, 0), 6749);
  assert.equal(coverage.files.reduce((total, file) => total + file.attributed, 0), 6749);
  assert.equal(coverage.gaps.length, 0);
  assert.equal(coverage.overlaps.length, 0);
});

// @verifies C001
test('manifest hash mismatch fails with exit 10', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-lock-'));
  try {
    cpSync(sourceDir, join(temporary, 'spec'), { recursive: true });
    appendFileSync(join(temporary, 'spec', '00-FOUNDATION.md'), '\n');
    assert.throws(
      () => runIngest(['verify', '--source', join(temporary, 'spec')]),
      (error) => error.status === 10,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C007
test('SK registry entries have verification', () => {
  const entries = parseSkillRegistry(readFileSync(join(root, 'source/skill-registry.toml'), 'utf8'));
  assert.equal(entries.length, 8);
  assert.doesNotThrow(() => assertSkillRegistry(entries));
});

test('coverage markdown matches coverage json', () => {
  const coverage = JSON.parse(readFileSync(join(root, 'coverage.json'), 'utf8'));
  assert.equal(readFileSync(join(root, 'coverage.md'), 'utf8'), renderCoverageReport(coverage));
});

test('lock contains no forbidden identifier token', () => {
  const redaction = JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8'));
  const lock = readFileSync(join(root, 'atoms.lock.json'), 'utf8');
  assert.deepEqual(findForbiddenTokens(lock, redaction), []);
});

test('classify is byte-identical on repeat', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-determinism-'));
  try {
    const lockPath = join(temporary, 'atoms.lock.json');
    const coveragePath = join(temporary, 'coverage.json');
    const reportPath = join(temporary, 'coverage.md');
    runIngest([
      'classify',
      '--source', sourceDir,
      '--lock', lockPath,
      '--coverage', coveragePath,
      '--report', reportPath,
    ]);
    assert.equal(readFileSync(lockPath, 'utf8'), readFileSync(join(root, 'atoms.lock.json'), 'utf8'));
    assert.equal(readFileSync(coveragePath, 'utf8'), readFileSync(join(root, 'coverage.json'), 'utf8'));
    assert.equal(readFileSync(reportPath, 'utf8'), readFileSync(join(root, 'coverage.md'), 'utf8'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
