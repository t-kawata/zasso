'use strict';

/**
 * PX-418 — command file: material-only interface, generic artifact amendment.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMAND_PATH = path.resolve(__dirname, '../../.claude/commands/amend-rfc-up.md');

// @verifies C001
test('C001: command exposes material paths only', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.match(text, /^---\n/);
  assert.match(text, /description:\s+\S/);
  assert.match(text, /argument-hint:\s+\[<material file\|directory>\.\.\.\]/);
  assert.match(text, /disable-model-invocation:\s+true/);
  const hintLine = text.split('\n').find((line) => line.startsWith('argument-hint:'));
  for (const flag of ['--apply', '--package', '--ticket-key', '--rule', '--phase']) {
    assert.equal(hintLine.includes(flag), false, flag);
  }
});

test('C001: command is generic across all four artifacts', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  for (const section of ['# /amend-rfc-up', '## Arguments', '## Derivation', '## Steps', '## Safety Invariants', '## Terminal States']) {
    assert.equal(text.includes(section), true, `missing ${section}`);
  }
  for (const token of ['*-law', 'verify-law-skill', 'AMENDMENT-REQUEST', 'design-amendment.js', '/graphify-rfc', '/boundify-graph', '/split-to-tickets']) {
    assert.equal(text.includes(token), true, `missing ${token}`);
  }
  assert.equal(/PX-[0-9]+/.test(text), false, 'command carries a ticket id');
  assert.equal(/change history|formerly known as/i.test(text), false, 'command carries history prose');
});

test('C014: command is multi-package and non-interactive', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  const contract = text.includes('## Execution Contract')
    || text.includes('# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION');
  assert.equal(contract, true, 'missing the non-interactive execution contract');
  assert.equal(text.includes('One package per invocation'), false);
  for (const token of ['packages[]', 'OWNER_RECEIPT', 'rule coverage', 'surface coverage', 'cross-package', 'NO_CHANGE']) {
    assert.equal(text.includes(token), true, `missing ${token}`);
  }
  assert.equal(/gaia|crystal|doors|zasso/.test(text), false, 'command names a concrete repository');
  assert.equal(text.includes('rust-interface-law'), false, 'command names a concrete law skill');
});

test('C014: the invocation prose reaches preflight through a derived instruction file', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.match(text, /--instruction=@"\$PWD\/amend\/INSTRUCTION\.md"/);
  assert.equal(text.includes('amendment-request.json'), false, 'request file case drifts');
  assert.match(text, /--packages=@"\$AMEND_OUT\/PACKAGES\.json"/);
});

test('C014: a design finding enters the repair loop instead of stopping', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  for (const token of ['repair.js', 'Repair Loop', 'progress', 'regressed', 'stalled', 'escalat']) {
    assert.equal(text.includes(token), true, `missing ${token}`);
  }
  assert.equal(text.includes('Any finding is `VERIFY_BLOCKED`; repair and rerun.'), false, 'findings became terminal');
  assert.equal(text.includes('stop; no apply'), false, 'dry-run finding still stops');
  assert.match(text, /A design finding alone never selects `BLOCKED`/);
});

test('C014: semantic obligations are inventoried and dispositioned', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  for (const token of [
    'obligations.js',
    'OBLIGATIONS.json',
    'OBLIGATION-COVERAGE.json',
    '--obligations=',
    '--obligation-coverage=',
    'obligation_coverage',
    'semantic obligation',
    'OBLIGATION_BASIS_UNGROUNDED',
  ]) {
    assert.equal(text.includes(token), true, `missing ${token}`);
  }
});

test('C001: command body is telegraphic', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  const bodyStart = text.indexOf('# /amend-rfc-up');
  const body = bodyStart >= 0 ? text.slice(bodyStart) : text;
  const longLines = body.split('\n').filter((line) => line.length > 220);
  assert.deepEqual(longLines, []);
});

test('C001: command names no concrete *-law skill', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.equal(text.includes('rust-interface-law'), false);
  assert.match(text, /\$AMEND_DIR\/verify-law-skill\.mjs/);
});

test('C001: records live under the package amend/ directory, never target/', () => {
  assert.equal(fs.readFileSync(COMMAND_PATH, 'utf8').includes('target/'), false);
  const scriptDirectory = path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up');
  for (const name of fs.readdirSync(scriptDirectory)) {
    if (!name.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(scriptDirectory, name), 'utf8');
    assert.equal(/target\/(?:amend|law)/.test(source), false, name);
  }
});
