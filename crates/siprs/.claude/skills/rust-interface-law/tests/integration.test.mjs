// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
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
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillRegistry, assertSkillRegistry } from '../scripts/lib/registry.mjs';
import { findForbiddenTokens } from '../scripts/lib/redact.mjs';
import { renderCoverageReport } from '../scripts/lib/report.mjs';
import { buildDist } from '../scripts/lib/dist.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const repoRoot = join(root, '..', '..', '..');
const aliasMap = JSON.parse(readFileSync(join(root, '..', 'rust-interface-law.path-alias.json'), 'utf8'));
const sourceDir = join(repoRoot, aliasMap.input_roots[0]);
const ingest = join(root, 'scripts', 'ingest.mjs');

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function runIngest(args, cwd = repoRoot) {
  return execFileSync(process.execPath, [ingest, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('19 docs and the expert package generate 486 rule concepts and zero gaps', () => {
  const manifest = readFileSync(join(root, 'source/manifest.toml'), 'utf8');
  const sources = (manifest.match(/\[\[file\]\]/g) ?? []).length;
  const lock = JSON.parse(readFileSync(join(root, 'atoms.lock.json'), 'utf8'));
  const ruleMap = JSON.parse(readFileSync(join(root, 'source/rule-concepts.json'), 'utf8'));
  const rules = lock.rules ?? [];
  assert.equal(sources, 19);
  assert.equal(rules.length, 486);
  assert.equal(new Set(rules.map((rule) => rule.rule_id)).size, 486);
  assert.equal(Object.keys(ruleMap.byRule).length, 486);
  assert.equal(new Set(Object.values(ruleMap.byRule).map((rule) => rule.concept_id)).size, 486);
});

// @verifies C001
test('manifest hash mismatch fails with exit 10', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'law-lock-'));
  try {
    cpSync(sourceDir, join(temporary, 'spec'), { recursive: true });
    appendFileSync(join(temporary, 'spec', '00-FOUNDATION.md'), '\n');
    const aliases = Object.fromEntries(
      Object.entries(aliasMap.aliases).map(([alias, original]) => [alias, join(temporary, 'spec', basename(original))]),
    );
    const tamperedMap = join(temporary, 'alias.json');
    writeFileSync(tamperedMap, JSON.stringify({ ...aliasMap, aliases }));
    assert.throws(
      () => runIngest(['verify', '--alias', tamperedMap], temporary),
      (error) => error.status === 10,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// @verifies C007
test('SK registry entries have verification', () => {
  const entries = parseSkillRegistry(readFileSync(join(root, 'source/skill-registry.toml'), 'utf8'));
  assert.equal(entries.length, 12);
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
    assert.ok(existsSync(join(skillDir, 'okf/rules')));
    assert.ok(existsSync(join(skillDir, 'okf-core/index.mjs')));

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

test('rebuild is byte-identical on repeat', () => {
  const output = execFileSync(process.execPath, [join(root, 'dist/skill.mjs'), 'rebuild', '--root', root], { encoding: 'utf8' });
  assert.match(output, /byte-identical/);
});
