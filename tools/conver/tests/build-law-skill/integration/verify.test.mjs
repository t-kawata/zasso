// [::TICKET::] PX-423 changes. Details: `node "$(git show --stat PX-423 2>/dev/null || true)"`.
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C006

/**
 * PX-423 — executable contract for the producer-side integration gate.
 *
 * The gate owns six fixed checkpoint lines, not a per-skill block. These tests
 * build temporary hosts so the same assertions run against missing, drifted,
 * duplicated, misplaced, and CLI-bearing lines without touching the real tree.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  CANONICAL_LINES,
  INTEGRATION_MARKER,
  MAX_CHECKPOINT_LENGTH,
  PIPELINE_COMMANDS,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const verifierPath = join(repositoryRoot, '.claude/scripts/amend-rfc-up/verify-law-integration.mjs');

const CLAUDE_HEADING = '### Rust interface law (conditional)';
const COMMAND_HEADING = '### Step 5.5: Rust interface law scope (conditional)';
const FILE_KEYS = ['claude', ...PIPELINE_COMMANDS];

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function commandPath(root, command) {
  return join(root, '.claude/commands', `${command}.md`);
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function claudePath(root) {
  return join(root, '.claude/CLAUDE.md');
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function hostFile(root, key) {
  return key === 'claude' ? claudePath(root) : commandPath(root, key);
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function writeHostFile(root, key, options = {}) {
  const heading = key === 'claude' ? CLAUDE_HEADING : COMMAND_HEADING;
  const canonical = CANONICAL_LINES[key];
  const line = options.line === 'drift'
    ? canonical.replace('machine_verified', 'verified')
    : options.line === 'cli'
      ? `${canonical} --root .`
      : canonical;
  let lines;
  if (options.line === 'omit') {
    lines = [heading, '', 'Existing law detail.'];
  } else if (options.line === 'location') {
    lines = [line, '', heading, '', 'Existing law detail.'];
  } else if (options.line === 'duplicate') {
    lines = [heading, '', canonical, canonical, '', 'Existing law detail.'];
  } else {
    lines = [heading, '', line, '', 'Existing law detail.'];
  }
  const file = hostFile(root, key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${lines.join('\n')}\n`);
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function writeSkill(root, name, options = {}) {
  const skill = join(root, '.claude/skills', name);
  mkdirSync(join(skill, 'dist'), { recursive: true });
  if (!options.skipSkillMd) {
    writeFileSync(join(skill, 'SKILL.md'), `# ${name}\n\n${PIPELINE_COMMANDS.join(', ')}\n`);
  }
  if (!options.skipDist) {
    writeFileSync(join(skill, 'dist/skill.mjs'), 'export {};\n');
  }
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function createHost(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'law-integration-'));
  for (const key of FILE_KEYS) {
    const line = options.omit === key ? 'omit' : options.mode ?? 'canonical';
    writeHostFile(root, key, { line });
  }
  if (options.skills !== false) writeSkill(root, options.skillName ?? 'alpha-law');
  return root;
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function runIntegration(root, args) {
  const result = spawnSync(process.execPath, [verifierPath, '--root', root, ...args], {
    encoding: 'utf8',
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function hashHost(root) {
  const digest = createHash('sha256');
  for (const key of FILE_KEYS) digest.update(readFileSync(hostFile(root, key)));
  return digest.digest('hex');
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function codeSet(report, key) {
  return new Set(report?.checks?.[key]?.codes ?? []);
}

test('C001: six canonical lines are fixed, bounded, term-complete, and skill-agnostic', () => {
  const lines = Object.values(CANONICAL_LINES);
  assert.equal(lines.length, 6);
  for (const line of lines) {
    assert.ok(line.startsWith(INTEGRATION_MARKER));
    assert.ok(line.length <= MAX_CHECKPOINT_LENGTH);
    for (const term of ['dev', 'installed', 'machine_verified', 'closure']) {
      assert.ok(line.includes(term), term);
    }
    assert.equal(/--(?:root|source-root|path-alias)/.test(line), false);
    assert.equal(line.includes('rust-interface-law'), false);
  }
  assert.equal(new Set(lines).size, 6);
  assert.match(CANONICAL_LINES.claude, /Only when a `skills\/\*-law` trigger matches/);
  assert.match(CANONICAL_LINES.claude, /No match → skip/);
});

test('C002: a valid host passes and reports the discovered skill', () => {
  const root = createHost();
  try {
    const result = runIntegration(root, ['--mode', 'check', '--require-skill']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.status, 'machine_verified');
    assert.deepEqual(Object.keys(result.report.checks), FILE_KEYS);
    assert.deepEqual(result.report.skills.discovered, ['alpha-law']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002: a missing CLAUDE line names the file and code', () => {
  const root = createHost({ omit: 'claude' });
  try {
    const result = runIntegration(root, ['--mode', 'check']);
    assert.equal(result.status, 1);
    assert.ok(codeSet(result.report, 'claude').has('INTEGRATION_MISSING'));
    assert.equal(result.report.checks.claude.file, '.claude/CLAUDE.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002: a missing command line is not masked by the other five files', () => {
  const root = createHost({ omit: 'make-ticket' });
  try {
    const result = runIntegration(root, ['--mode', 'check']);
    assert.equal(result.status, 1);
    assert.ok(codeSet(result.report, 'make-ticket').has('INTEGRATION_MISSING'));
    assert.equal(result.report.checks['make-ticket'].file, '.claude/commands/make-ticket.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002: drift, duplicate, location, and CLI leak are distinct findings', () => {
  const cases = [
    ['claude', 'drift', 'INTEGRATION_DRIFT'],
    ['make-ticket', 'duplicate', 'INTEGRATION_DUPLICATE'],
    ['plan-ticket', 'location', 'INTEGRATION_LOCATION'],
    ['start-ticket', 'cli', 'INTEGRATION_CLI_LEAK'],
  ];
  for (const [key, mode, code] of cases) {
    const root = createHost({ omit: '__none__' });
    writeHostFile(root, key, { line: mode });
    try {
      const result = runIntegration(root, ['--mode', 'check']);
      assert.equal(result.status, 1, `${key}/${mode}`);
      assert.ok(codeSet(result.report, key).has(code), `${key}/${mode}: ${JSON.stringify(result.report.checks[key])}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('C002: zero skills skips only without require-skill', () => {
  const root = createHost({ skills: false });
  try {
    const skipped = runIntegration(root, ['--mode', 'check']);
    assert.equal(skipped.status, 0);
    assert.equal(skipped.report.skills.status, 'skipped');
    const required = runIntegration(root, ['--mode', 'check', '--require-skill']);
    assert.equal(required.status, 1);
    assert.ok(required.report.skills.codes.includes('INTEGRATION_NO_SKILL'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003: write inserts, is idempotent, and a duplicate refuses the write', () => {
  const root = createHost({ mode: 'omit' });
  try {
    const before = hashHost(root);
    const first = runIntegration(root, ['--mode', 'write']);
    assert.equal(first.status, 0, first.stderr);
    const firstHash = hashHost(root);
    assert.notEqual(firstHash, before);
    const second = runIntegration(root, ['--mode', 'write']);
    assert.equal(second.status, 0);
    assert.equal(hashHost(root), firstHash);
    const check = runIntegration(root, ['--mode', 'check', '--require-skill']);
    assert.equal(check.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003: a write failure restores the original bytes', () => {
  const root = createHost({ mode: 'drift' });
  const commands = join(root, '.claude/commands');
  try {
    const before = hashHost(root);
    chmodSync(commands, 0o555);
    const failed = runIntegration(root, ['--mode', 'write']);
    chmodSync(commands, 0o755);
    assert.equal(failed.status, 1);
    assert.ok(codeSet(failed.report, 'make-ticket').has('INTEGRATION_WRITE_FAILED'));
    assert.equal(hashHost(root), before);
  } finally {
    chmodSync(commands, 0o755);
    rmSync(root, { recursive: true, force: true });
  }
});

test('C003: a duplicate marker blocks write without partial output', () => {
  const root = createHost({ mode: 'omit' });
  writeHostFile(root, 'make-ticket', { line: 'duplicate' });
  try {
    const before = hashHost(root);
    const failed = runIntegration(root, ['--mode', 'write']);
    assert.equal(failed.status, 1);
    assert.ok(codeSet(failed.report, 'make-ticket').has('INTEGRATION_DUPLICATE'));
    assert.equal(hashHost(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004: skill discovery is sorted and adding a skill leaves the host bytes unchanged', () => {
  const root = createHost({ skills: false });
  writeSkill(root, 'beta-law');
  writeSkill(root, 'alpha-law');
  try {
    const report = runIntegration(root, ['--mode', 'check', '--require-skill']);
    assert.equal(report.status, 0);
    assert.deepEqual(report.report.skills.discovered, ['alpha-law', 'beta-law']);
    const before = hashHost(root);
    writeSkill(root, 'gamma-law');
    assert.equal(runIntegration(root, ['--mode', 'write']).status, 0);
    assert.equal(hashHost(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C004: a skill without SKILL.md or dist is invalid', () => {
  const root = createHost();
  writeSkill(root, 'broken-law', { skipSkillMd: true });
  try {
    const result = runIntegration(root, ['--mode', 'check']);
    assert.equal(result.status, 1);
    assert.ok(result.report.skills.codes.includes('INTEGRATION_SKILL_INVALID'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C006: the generated pipeline-checkpoints template checks the host contract', () => {
  const template = readFileSync(
    join(here, '../acceptance/fixtures/mini/mini-law/tests/pipeline-checkpoints.test.mjs'),
    'utf8',
  );
  assert.match(template, /function findHostRoot/);
  assert.match(template, /LAW_HOST_ROOT/);
  assert.match(template, /law-skill:checkpoint/);
  assert.ok(template.includes('tests/fixtures/host'));
  assert.equal(template.includes('rust-interface-law'), false);
});
