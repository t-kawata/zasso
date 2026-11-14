/**
 * The bundled rust-interface-law skill is the ideal exemplar for
 * /build-law-skill. These tests pin the properties that made it an exemplar:
 * executable frontier actions, evidence-bearing implementation checks,
 * a convention-complete conformance list, and a portable pre-OKF original.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const skill = join(here, '../../.claude/skills/rust-interface-law');
const cli = join(skill, 'dist/skill.mjs');

function run(args, cwd = skill) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function expandJson(id) {
  const result = run(['expand', '--id', id, '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function ruleAppliesTo(conceptId) {
  const text = readFileSync(join(skill, 'okf', `${conceptId}.md`), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, `${conceptId} has no frontmatter`);
  const entry = match[1].match(/^x-applies-to:\s*(.+)$/m);
  return entry ? entry[1].trim().replace(/^['"]|['"]$/g, '') : undefined;
}

test('every template action is an executable interface command, never --rule', () => {
  const lock = JSON.parse(readFileSync(join(skill, 'atoms.lock.json'), 'utf8'));
  const supported = new Set(['rest', 'websocket', 'cli', 'grpc', 'mcp', 'a2a']);
  let checked = 0;
  for (const record of lock.rules ?? []) {
    const page = expandJson(record.concept_id);
    const appliesTo = ruleAppliesTo(record.concept_id);
    const actions = (page.frontier ?? []).filter((entry) => entry.type === 'action');
    const template = actions.find((entry) => entry.id.endsWith('#template'));
    if (!supported.has(appliesTo)) {
      assert.equal(template, undefined, `${record.rule_id} must not advertise template`);
      continue;
    }
    assert.ok(template, `${record.rule_id} must advertise template`);
    assert.match(template.command, /template --interface \S+ --unit \S+/);
    assert.doesNotMatch(template.command, /template --rule/);
    assert.match(template.command, new RegExp(`--interface ${appliesTo}`));
    checked += 1;
    if (checked >= 5) break;
  }
  assert.ok(checked > 0, 'no interface rule was checked');
});

test('implementation-check prints one evidence row per finding', () => {
  const out = join(here, 'implementation-check.tmp.json');
  const result = run(['implementation-check', '--rule', 'WS-14', '--root', here, '--out', out]);
  assert.equal(result.status, 50);
  assert.match(result.stdout, /## Findings/);
  assert.match(result.stdout, /missing-dependency/);
  assert.match(result.stdout, /axum/);
});

test('the WebSocket conformance list names every WebSocket rule', () => {
  const conformance = readFileSync(
    join(skill, 'okf/sources/31-websocket/12-conformance-obligations.md'),
    'utf8',
  );
  assert.match(conformance, /WS-01` through `WS-35/);
  const contract = readFileSync(
    join(skill, 'okf/sources/31-websocket/11-implementation-contract.md'),
    'utf8',
  );
  for (const rule of ['WS-33', 'WS-34', 'WS-35']) {
    assert.match(contract, new RegExp(rule), `${rule} is absent from the implementation contract`);
  }
});

test('the skill carries a byte-identical PRE-OKF-ORIGINAL.md and its ledger', () => {
  const original = join(skill, 'PRE-OKF-ORIGINAL.md');
  const ledger = join(skill, 'source/pre-okf-original.json');
  assert.ok(existsSync(original), 'PRE-OKF-ORIGINAL.md is absent');
  assert.ok(existsSync(ledger), 'source/pre-okf-original.json is absent');
  const record = JSON.parse(readFileSync(ledger, 'utf8'));
  assert.equal(record.schema, 'pre-okf-original/v1');
  const text = readFileSync(original, 'utf8').replace(/\r\n?/g, '\n');
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  assert.equal(record.sha256, hash);
  assert.equal(record.bytes, Buffer.byteLength(text, 'utf8'));
  assert.ok(record.source, 'the ledger must name the source alias');
});

test('the installer ships the pre-OKF original to the installed tree', () => {
  const install = readFileSync(join(skill, 'install.js'), 'utf8');
  assert.match(install, /PRE-OKF-ORIGINAL\.md/);
  assert.match(install, /source\/pre-okf-original\.json|pre-okf-original\.json/);
});
