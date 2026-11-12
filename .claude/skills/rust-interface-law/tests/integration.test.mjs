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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillRegistry, assertSkillRegistry } from '../scripts/lib/registry.mjs';
import { findForbiddenTokens } from '../scripts/lib/redact.mjs';
import { renderCoverageReport } from '../scripts/lib/report.mjs';
import { buildDist } from '../scripts/lib/dist.mjs';

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

// @verifies C004
test('attest accepts the document emitted by --init', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-attest-'));
  try {
    const manifestPath = join(temporary, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      phases: ['adapter'],
      nodes: [{ id: 'R-1', delivery: 'must', phase: 'adapter' }],
    }));

    const rowsPath = join(temporary, 'attestation.json');
    writeFileSync(rowsPath, JSON.stringify({
      phase: 'adapter',
      rows: [{ rule: 'R-1', status: 'applied', evidence: 'check passed' }],
    }));

    execFileSync(process.execPath, [
      join(root, 'scripts/cli.mjs'),
      'attest',
      '--manifest', manifestPath,
      '--phase', 'adapter',
      '--rows', rowsPath,
    ], { encoding: 'utf8' });

    assert.throws(
      () => execFileSync(process.execPath, [
        join(root, 'scripts/cli.mjs'),
        'attest',
        '--manifest', manifestPath,
        '--phase', 'contract',
        '--rows', rowsPath,
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      /phase mismatch/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C003
test('gate applies project verify metadata to manifest nodes', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-verify-'));
  try {
    const manifestPath = join(temporary, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      nodes: [{ id: 'X-01', delivery: 'must' }],
    }));

    const checkPath = join(temporary, 'check.mjs');
    writeFileSync(checkPath, 'process.stdout.write(JSON.stringify({ selected: 1, failed: 0 }));\n');

    const verifyPath = join(temporary, 'verify.toml');
    writeFileSync(verifyPath, [
      '[[verify]]',
      'rule = "X-01"',
      'level = "V3"',
      'cmd = ["node", "' + checkPath + '"]',
      'expected_cases = 1',
      '',
    ].join('\n'));

    const reportPath = join(temporary, 'report.json');
    execFileSync(process.execPath, [
      join(root, 'scripts/cli.mjs'),
      'gate',
      '--manifest', manifestPath,
      '--verify', verifyPath,
      '--out', reportPath,
    ], { encoding: 'utf8' });

    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    assert.equal(report.statuses[0].status, 'machine_verified');
    assert.equal(report.ok, true);
    assert.equal(report.machinePass, true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C008
test('install.js preserves dist layout and the installed entry resolves', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-install-'));
  try {
    await buildDist({ root });
    execFileSync(process.execPath, [join(root, 'install.js'), temporary], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const skillDir = join(temporary, '.claude/skills/rust-interface-law');
    assert.ok(existsSync(join(skillDir, 'dist/skill.mjs')));
    assert.ok(existsSync(join(skillDir, 'okf/nodes')));

    const out = join(temporary, 'manifest.json');
    execFileSync(process.execPath, [
      join(skillDir, 'dist/skill.mjs'),
      'resolve',
      '--profile', join(root, 'tests/fixtures/project/RULES-PROFILE.toml'),
      '--map', join(root, 'tests/fixtures/project/contract/workspace-map.toml'),
      '--paths', 'crates/app-rest/src/handler.rs',
      '--out', out,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(manifest.phases, ['contract', 'operation', 'adapter', 'conformance']);
    assert.ok(manifest.nodes.length > 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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
