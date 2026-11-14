/**
 * Per-skill trigger lines are injected as exactly one line per host file.
 *
 * The test builds a temporary host and a temporary law skill, then exercises
 * the real writer and checker. It also asserts that no other generated text
 * (JSON, CLI, metadata) leaks into the host files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  CANONICAL_LINES,
  INTEGRATION_MARKER,
  PIPELINE_COMMANDS,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/contract.mjs';
import {
  TRIGGER_MARKER_PREFIX,
  buildTriggerLine,
  triggerMarker,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/applicability.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const verifier = join(repositoryRoot, '.claude/scripts/amend-rfc-up/verify-law-integration.mjs');
const COMMAND_HEADING = '### Step 5.5: Rust interface law scope (conditional)';

const RECORD = {
  schema: 'law-applicability/v1',
  skill: 'demo-law',
  classification: 'specific-case-trigger',
  conditions: [{ id: 'path', terms: ['src/api/**'] }],
  instruction: '`demo-law`: apply only when changed/target path matches `src/api/**`; `applies` exit 3 = skip.',
  applies: {
    discovery: 'path-glob',
    paths: ['src/api/**'],
    roles: [],
    sharedRoles: [],
    skipExit: 3,
  },
};

function hostFiles(root) {
  return ['claude', ...PIPELINE_COMMANDS].map((key) => (
    key === 'claude'
      ? { key, file: join(root, '.claude/CLAUDE.md') }
      : { key, file: join(root, '.claude/commands', `${key}.md`) }
  ));
}

function writeHost(root) {
  for (const { key, file } of hostFiles(root)) {
    mkdirSync(dirname(file), { recursive: true });
    const heading = key === 'claude' ? '### Rust interface law (conditional)' : COMMAND_HEADING;
    writeFileSync(file, [
      '# Host',
      '',
      heading,
      '',
      CANONICAL_LINES[key],
      '',
      'Existing detail.',
      '',
    ].join('\n'));
  }
}

function writeSkill(root, record) {
  const skill = join(root, '.claude/skills/demo-law');
  mkdirSync(join(skill, 'dist'), { recursive: true });
  mkdirSync(join(skill, 'source'), { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: demo-law\n---\n\n# Demo Law\n');
  writeFileSync(join(skill, 'dist/skill.mjs'), 'export {};\n');
  writeFileSync(join(skill, 'source/applicability.json'), `${JSON.stringify(record, null, 2)}\n`);
  return skill;
}

function run(root, mode) {
  const result = spawnSync(process.execPath, [
    verifier,
    '--root', root,
    '--claude', join(root, '.claude/CLAUDE.md'),
    '--commands', join(root, '.claude/commands'),
    '--skills', join(root, '.claude/skills'),
    '--mode', mode,
    '--require-skill',
  ], { encoding: 'utf8' });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

function codes(report, key) {
  return report.checks[key].codes;
}

function sectionLines(file, heading) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `${file} lacks ${heading}`);
  const end = lines.findIndex((line, index) => index > start && /^#{2,3}\s/.test(line));
  return lines.slice(start + 1, end === -1 ? lines.length : end);
}

test('check fails before injection and write adds exactly one trigger line per file', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-'));
  try {
    writeHost(root);
    writeSkill(root, RECORD);

    const before = run(root, 'check');
    assert.equal(before.status, 1);
    for (const { key } of hostFiles(root)) {
      assert.ok(codes(before.report, key).includes('TRIGGER_MISSING'), key);
    }

    const write = run(root, 'write');
    assert.equal(write.status, 0, write.stdout);
    for (const { key, file } of hostFiles(root)) {
      const lines = sectionLines(file, key === 'claude'
        ? '### Rust interface law (conditional)'
        : COMMAND_HEADING);
      const markerLines = lines.filter((line) => line.startsWith('<!-- law-skill:'));
      assert.deepEqual(markerLines, [
        CANONICAL_LINES[key],
        buildTriggerLine(RECORD.skill, RECORD.instruction),
      ], key);
      assert.ok(lines.includes('Existing detail.'), key);
      assert.equal(markerLines.some((line) => /--(?:root|source-root|path-alias)/.test(line)), false);
    }

    const after = run(root, 'check');
    assert.equal(after.status, 0, after.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an instruction change is drift and write repairs only the trigger line', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-drift-'));
  try {
    writeHost(root);
    writeSkill(root, RECORD);
    assert.equal(run(root, 'write').status, 0);

    const changed = {
      ...RECORD,
      instruction: '`demo-law`: apply only when changed/target path matches `src/api/**`; `applies` exit 3 = skip. No exceptions.',
    };
    writeSkill(root, changed);

    const drift = run(root, 'check');
    assert.equal(drift.status, 1);
    assert.ok(codes(drift.report, 'claude').includes('TRIGGER_DRIFT'));

    assert.equal(run(root, 'write').status, 0);
    const repairedLines = readFileSync(join(root, '.claude/CLAUDE.md'), 'utf8').split('\n');
    assert.ok(repairedLines.includes(buildTriggerLine(changed.skill, changed.instruction)));
    assert.equal(repairedLines.includes(buildTriggerLine(RECORD.skill, RECORD.instruction)), false);
    assert.equal(run(root, 'check').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a general skill keeps the host trigger-free', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-general-'));
  try {
    writeHost(root);
    writeSkill(root, { ...RECORD, classification: 'general' });
    assert.equal(run(root, 'write').status, 0);
    for (const { key, file } of hostFiles(root)) {
      const lines = sectionLines(file, key === 'claude'
        ? '### Rust interface law (conditional)'
        : COMMAND_HEADING).filter((line) => line.startsWith(TRIGGER_MARKER_PREFIX));
      assert.deepEqual(lines, [], key);
    }
    assert.equal(run(root, 'check').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a trigger line for an uninstalled skill is stale', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-stale-'));
  try {
    writeHost(root);
    writeSkill(root, RECORD);
    assert.equal(run(root, 'write').status, 0);
    const file = join(root, '.claude/CLAUDE.md');
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace(
      buildTriggerLine(RECORD.skill, RECORD.instruction),
      `${buildTriggerLine(RECORD.skill, RECORD.instruction)}\n${triggerMarker('gone-law')} stale`,
    ));
    const result = run(root, 'check');
    assert.equal(result.status, 1);
    assert.ok(result.report.checks.claude.codes.includes('TRIGGER_STALE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate trigger lines are rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-duplicate-'));
  try {
    writeHost(root);
    writeSkill(root, RECORD);
    assert.equal(run(root, 'write').status, 0);
    const file = join(root, '.claude/CLAUDE.md');
    const line = buildTriggerLine(RECORD.skill, RECORD.instruction);
    writeFileSync(file, readFileSync(file, 'utf8').replace(line, `${line}\n${line}`));
    const result = run(root, 'check');
    assert.equal(result.status, 1);
    assert.ok(result.report.checks.claude.codes.includes('TRIGGER_DUPLICATE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a trigger line outside the law section is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'law-trigger-location-'));
  try {
    writeHost(root);
    writeSkill(root, RECORD);
    assert.equal(run(root, 'write').status, 0);
    const file = join(root, '.claude/CLAUDE.md');
    const text = readFileSync(file, 'utf8');
    const line = buildTriggerLine(RECORD.skill, RECORD.instruction);
    writeFileSync(file, `${line}\n\n${text}`);
    const result = run(root, 'check');
    assert.equal(result.status, 1);
    assert.ok(result.report.checks.claude.codes.includes('TRIGGER_LOCATION'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
