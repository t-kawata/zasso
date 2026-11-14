/**
 * The checked-in host tree must agree with the canonical integration contract.
 *
 * `verify.test.mjs` builds temporary hosts, so it can prove drift detection
 * without noticing that the real CLAUDE.md and five commands fell behind the
 * check set. This file reads the real tree and runs the real gate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_LINES,
  INTEGRATION_MARKER,
  PIPELINE_COMMANDS,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/contract.mjs';
import {
  TRIGGER_MARKER_PREFIX,
  buildTriggerLine,
  loadApplicability,
} from '../../../.claude/scripts/amend-rfc-up/law-integration/applicability.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const HOST_KEYS = ['claude', ...PIPELINE_COMMANDS];

function hostFile(key) {
  return key === 'claude'
    ? join(repositoryRoot, '.claude/CLAUDE.md')
    : join(repositoryRoot, '.claude/commands', `${key}.md`);
}

function readMarkerLine(file) {
  const lines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith(INTEGRATION_MARKER));
  assert.equal(lines.length, 1, `${file} must carry exactly one checkpoint line`);
  return lines[0].trim();
}

test('every real host file carries the canonical checkpoint line', () => {
  for (const key of HOST_KEYS) {
    assert.equal(readMarkerLine(hostFile(key)), CANONICAL_LINES[key], key);
  }
});

test('the canonical plan line names the current law check set', () => {
  const contract = JSON.parse(readFileSync(
    join(repositoryRoot, '.claude/scripts/amend-rfc-up/law-verify/checks.json'),
    'utf8',
  ));
  const expected = `check set ${contract.checks.length} (v${contract.check_set_version})`;
  assert.ok(CANONICAL_LINES['plan-ticket'].includes(expected), CANONICAL_LINES['plan-ticket']);
  for (const line of Object.values(CANONICAL_LINES)) {
    assert.ok(line.includes(`v${contract.check_set_version} `), line);
  }
});

test('the real law skill ships a valid specific-case trigger contract', () => {
  const result = loadApplicability(join(repositoryRoot, '.claude/skills/rust-interface-law'));
  assert.equal(result.status, 'valid', JSON.stringify(result.findings));
  assert.equal(result.record.classification, 'specific-case-trigger');
  assert.ok(result.record.instruction.length > 0);
});

test('every real host file carries exactly one trigger line for the installed skill', () => {
  const result = loadApplicability(join(repositoryRoot, '.claude/skills/rust-interface-law'));
  const expected = buildTriggerLine(result.record.skill, result.record.instruction);
  for (const key of HOST_KEYS) {
    const lines = readFileSync(hostFile(key), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith(TRIGGER_MARKER_PREFIX));
    assert.deepEqual(lines, [expected], key);
  }
});

test('the integration gate passes on the real host tree', () => {
  const result = spawnSync(process.execPath, [
    join(repositoryRoot, '.claude/scripts/amend-rfc-up/verify-law-integration.mjs'),
    '--root', repositoryRoot,
    '--claude', join(repositoryRoot, '.claude/CLAUDE.md'),
    '--commands', join(repositoryRoot, '.claude/commands'),
    '--skills', join(repositoryRoot, '.claude/skills'),
    '--mode', 'check',
    '--require-skill',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'machine_verified');
  assert.equal(report.skills.status, 'machine_verified');
});
