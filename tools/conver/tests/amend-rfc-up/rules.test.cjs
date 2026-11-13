'use strict';

/**
 * PX-419 — material rule inventory and total coverage.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  extractRules,
  initRuleCoverage,
  validateRuleCoverage,
} = require('../../.claude/scripts/amend-rfc-up/rules.js');
const { cleanup } = require('./helpers.cjs');

function makeMaterial() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px419-rules-'));
  const materialPath = path.join(directory, 'spec.md');
  fs.writeFileSync(materialPath, [
    '# Rules',
    '',
    '| ID | Class | Statement |',
    '|---|---|---|',
    '| ARC-01 | C | Every crate has one role. |',
    '| OPS-01 | C | Every operation has an id. |',
    '',
    'Inline references: ARC-01 and NEW-99.',
    '',
  ].join('\n'));
  return { directory, materialPath };
}

test('C004: rule rows are registered and inline-only ids are flagged', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    const rules = extractRules({ materialPaths: [materialPath] });
    assert.deepEqual(rules.map((rule) => rule.id), ['ARC-01', 'NEW-99', 'OPS-01']);
    assert.equal(rules.find((rule) => rule.id === 'ARC-01').registered, true);
    assert.equal(rules.find((rule) => rule.id === 'NEW-99').registered, false);
    assert.equal(rules.find((rule) => rule.id === 'ARC-01').statement, 'Every crate has one role.');
    assert.equal(extractRules({ materialPaths: [materialPath] }).map((rule) => rule.id).join(','), 'ARC-01,NEW-99,OPS-01');
  } finally {
    cleanup(directory);
  }
});

test('C004: a rule with a code fence id in prose is still one inventory entry', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    fs.appendFileSync(materialPath, '\n`ARC-01` appears again.\n');
    const rules = extractRules({ materialPaths: [materialPath] });
    assert.equal(rules.filter((rule) => rule.id === 'ARC-01').length, 1);
  } finally {
    cleanup(directory);
  }
});

test('C004: a rich material entry is read by its path', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    const rules = extractRules({ materialPaths: [{ path: materialPath, sha256: 'x', kind: 'ordinary' }] });
    assert.equal(rules.length, 3);
  } finally {
    cleanup(directory);
  }
});

test('C005: coverage starts unset and requires every rule', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    const rules = extractRules({ materialPaths: [materialPath] });
    const initialized = initRuleCoverage({ rules });
    assert.equal(initialized.every((entry) => entry.status === 'unset'), true);
    assert.throws(
      () => validateRuleCoverage({ rules, coverage: initialized, changes: [{ id: 'CH1' }] }),
      (error) => error.code === 'REQUEST_RULE_UNCOVERED',
    );
  } finally {
    cleanup(directory);
  }
});

test('C005: covered and not_applicable entries satisfy every rule', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    const rules = extractRules({ materialPaths: [materialPath] });
    const coverage = [
      { ruleId: 'ARC-01', status: 'covered', changeIds: ['CH1'], reason: null },
      { ruleId: 'OPS-01', status: 'covered', changeIds: ['CH1'], reason: null },
      { ruleId: 'NEW-99', status: 'not_applicable', changeIds: [], reason: 'not part of this workspace' },
    ];
    assert.deepEqual(validateRuleCoverage({ rules, coverage, changes: [{ id: 'CH1' }] }), { ok: true });
  } finally {
    cleanup(directory);
  }
});

test('C005: unknown, duplicate, and incomplete coverage are rejected', () => {
  const { directory, materialPath } = makeMaterial();
  try {
    const rules = extractRules({ materialPaths: [materialPath] });
    assert.throws(
      () => validateRuleCoverage({
        rules,
        coverage: [
          { ruleId: 'ARC-01', status: 'covered', changeIds: ['CH1'], reason: null },
          { ruleId: 'ARC-01', status: 'covered', changeIds: ['CH1'], reason: null },
          { ruleId: 'OPS-01', status: 'covered', changeIds: ['CH1'], reason: null },
        ],
        changes: [{ id: 'CH1' }],
      }),
      (error) => error.code === 'RULE_COVERAGE_INVALID',
    );
    assert.throws(
      () => validateRuleCoverage({
        rules,
        coverage: rules.map((rule) => ({ ruleId: rule.id, status: 'covered', changeIds: ['ABSENT'], reason: null })),
        changes: [{ id: 'CH1' }],
      }),
      (error) => error.code === 'RULE_COVERAGE_INVALID',
    );
  } finally {
    cleanup(directory);
  }
});

// @verifies C004
test('C004: the rules CLI writes a deterministic inventory and coverage skeleton', () => {
  const { directory, materialPath } = makeMaterial();
  const inventoryPath = path.join(directory, 'inventory.json');
  const coveragePath = path.join(directory, 'coverage.json');
  try {
    const inventory = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/rules.js'),
      'inventory',
      `--materials=${JSON.stringify([materialPath])}`,
      `--out=${inventoryPath}`,
    ], { encoding: 'utf8' });
    assert.equal(inventory.status, 0, inventory.stderr);
    assert.equal(JSON.parse(inventory.stdout).count, 3);

    const init = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/rules.js'),
      'init',
      `--inventory=@${inventoryPath}`,
      `--out=${coveragePath}`,
    ], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const coverage = JSON.parse(require('node:fs').readFileSync(coveragePath, 'utf8'));
    assert.equal(coverage.length, 3);
    assert.equal(coverage.every((entry) => entry.status === 'unset'), true);
  } finally {
    cleanup(directory);
  }
});
