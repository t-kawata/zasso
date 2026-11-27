'use strict';

/**
 * Tests for the schema reference subcommand.
 *
 * The subcommand is the AI's only source for gates, exclusions, fields, enums,
 * computed values, and the update whitelist, so the test asserts the full
 * contract rather than a sample.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT, initRepoWithUpstream, baseCandidate } = require('./fixtures.cjs');

const criteria = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'criteria.js'
));
const schema = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'schema.js'
));

const CLI_PATH = path.join(REPO_ROOT, '.claude', 'scripts', 'pickup-conver-update-candidates', 'cli.js');

// [::TICKET::] PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-458 --for-spec --no-implementation-order`.
function runSchema(args = []) {
  return spawnSync(process.execPath, [CLI_PATH, 'schema', ...args], { encoding: 'utf8' });
}

test('schema human output names every gate and exclusion with its rule text', () => {
  const run = runSchema();
  assert.equal(run.status, 0);
  for (const gate of criteria.ADMISSION_GATES) {
    assert.ok(run.stdout.includes(gate.id), gate.id);
    assert.ok(run.stdout.includes(gate.rule), gate.rule);
  }
  for (const exclusion of criteria.EXCLUSION_CODES) {
    assert.ok(run.stdout.includes(exclusion.id), exclusion.id);
    assert.ok(run.stdout.includes(exclusion.rule), exclusion.rule);
  }
});

test('schema human output names categories, required fields, computed fields, and the update whitelist', () => {
  const run = runSchema();
  for (const category of criteria.VALUE_CATEGORIES) assert.ok(run.stdout.includes(category), category);
  for (const field of criteria.REQUIRED_CANDIDATE_FIELDS) assert.ok(run.stdout.includes(field), field);
  for (const field of criteria.UPDATABLE_FIELDS) assert.ok(run.stdout.includes(field), field);
  assert.ok(run.stdout.includes('evidence.contentFingerprint'));
});

test('schema output is byte-identical across two runs', () => {
  assert.equal(runSchema().stdout, runSchema().stdout);
});

test('schema --json is parseable and carries the complete contract', () => {
  const run = runSchema(['--json']);
  assert.equal(run.status, 0);
  const description = JSON.parse(run.stdout);
  assert.deepEqual(description.gates.map((gate) => gate.id), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  assert.deepEqual(description.exclusions.map((exclusion) => exclusion.id), ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8']);
  assert.deepEqual(description.categories, criteria.VALUE_CATEGORIES);
  assert.deepEqual(description.required, criteria.REQUIRED_CANDIDATE_FIELDS);
  assert.deepEqual(description.updateWhitelist, criteria.UPDATABLE_FIELDS);
  assert.deepEqual(description.locationRequired, ['file', 'hunkHeader', 'lineStart', 'lineEnd']);
  assert.deepEqual(description.evidenceRequired, ['patch', 'upstreamRef', 'upstreamCommit', 'diffStat', 'extractCommand', 'observedAt']);
  assert.ok(description.computed.includes('evidence.contentFingerprint'));
});

test('every field the schema names as required is rejected by the validator when omitted', () => {
  const { workspace } = initRepoWithUpstream();
  const claudeDir = path.join(workspace, '.claude');
  for (const field of criteria.REQUIRED_CANDIDATE_FIELDS) {
    const candidate = baseCandidate();
    delete candidate[field];
    assert.equal(schema.validateCandidate(candidate, { workspace, claudeDir }).ok, false, field);
  }
});
