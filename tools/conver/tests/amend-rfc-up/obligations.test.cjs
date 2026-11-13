'use strict';

/**
 * Semantic obligation inventory and coverage.
 *
 * Rule tables are not the only source of design obligations. A procedural
 * handbook states obligations in headings, normative prose, list items and
 * table rows. This module enumerates them so a design amendment must answer
 * every one with a change, a grounded not_applicable, or a recorded judgment.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  COVERED_STATUS,
  JUDGED_STATUS,
  NOT_APPLICABLE_STATUS,
  OBLIGATION_SCHEMA,
  UNSET_STATUS,
  extractObligations,
  initObligationCoverage,
  validateObligationCoverage,
} = require('../../.claude/scripts/amend-rfc-up/obligations.js');

const HANDBOOK = [
  '# Laboratory handbook',
  '',
  'Ordinary prose that states no obligation.',
  '',
  '## 1. Host contract',
  '',
  'The host must isolate the laboratory network.',
  '',
  '- The runner shall record every packet.',
  '',
  '```bash',
  '# This must be ignored because it is an example command.',
  'docker run --must-not-count',
  '```',
  '',
  '| Requirement | Detail |',
  '|---|---|',
  '| The fixture must use TLS. | Every call. |',
  '',
].join('\n');

function makeHandbook() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amend-obligations-'));
  const filePath = path.join(directory, 'HANDBOOK.md');
  fs.writeFileSync(filePath, HANDBOOK);
  return { directory, filePath };
}

test('obligations are extracted from headings, normative prose, list items and table rows', () => {
  const { directory, filePath } = makeHandbook();
  try {
    const obligations = extractObligations({ materialPaths: [filePath] });
    const texts = obligations.map((entry) => entry.text);
    assert.equal(obligations.every((entry) => entry.id.startsWith('OB-')), true);
    assert.equal(new Set(obligations.map((entry) => entry.id)).size, obligations.length);
    assert.equal(texts.some((text) => text.includes('Laboratory handbook')), true);
    assert.equal(texts.some((text) => text.includes('Host contract')), true);
    assert.equal(texts.some((text) => text.includes('must isolate')), true);
    assert.equal(texts.some((text) => text.includes('shall record')), true);
    assert.equal(texts.some((text) => text.includes('must use TLS')), true);
    assert.equal(texts.some((text) => text.includes('must be ignored')), false, 'a fenced example became an obligation');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the inventory is deterministic and init leaves every obligation unset', () => {
  const { directory, filePath } = makeHandbook();
  try {
    const first = extractObligations({ materialPaths: [filePath] });
    const second = extractObligations({ materialPaths: [filePath] });
    assert.deepEqual(first, second);

    const coverage = initObligationCoverage({ obligations: first });
    assert.equal(coverage.length, first.length);
    assert.equal(coverage.every((entry) => entry.status === UNSET_STATUS), true);
    assert.equal(OBLIGATION_SCHEMA, 'amend-rfc-up.obligations/v1');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('every obligation needs a covered, not_applicable or judged disposition', () => {
  const { directory, filePath } = makeHandbook();
  try {
    const obligations = extractObligations({ materialPaths: [filePath] });
    const changes = [{ id: 'CH1', text: obligations.map((entry) => entry.text).join('\n') }];
    const first = obligations[0];
    const coverage = obligations.map((entry) => ({
      obligationId: entry.id,
      status: COVERED_STATUS,
      changeIds: ['CH1'],
      reason: null,
      rationale: null,
      basis: { changeId: 'CH1', quote: entry.text },
    }));

    assert.deepEqual(
      validateObligationCoverage({ obligations, coverage, changes, materialPaths: [filePath] }),
      { ok: true },
    );

    const uncovered = coverage.map((entry, index) => (
      index === 0 ? { ...entry, status: UNSET_STATUS, changeIds: [] } : entry
    ));
    assert.throws(
      () => validateObligationCoverage({ obligations, coverage: uncovered, changes, materialPaths: [filePath] }),
      (error) => error.code === 'REQUEST_OBLIGATION_UNCOVERED',
    );

    const unknownChange = coverage.map((entry, index) => (
      index === 0 ? { ...entry, changeIds: ['CH-ABSENT'] } : entry
    ));
    assert.throws(
      () => validateObligationCoverage({ obligations, coverage: unknownChange, changes, materialPaths: [filePath] }),
      (error) => error.code === 'OBLIGATION_COVERAGE_INVALID',
    );

    const ungrounded = coverage.map((entry, index) => (
      index === 0
        ? {
          ...entry,
          status: NOT_APPLICABLE_STATUS,
          changeIds: [],
          reason: 'not part of this package',
          basis: { file: filePath, line: 1, quote: 'a sentence that is not in the file' },
        }
        : entry
    ));
    assert.throws(
      () => validateObligationCoverage({ obligations, coverage: ungrounded, changes, materialPaths: [filePath] }),
      (error) => error.code === 'OBLIGATION_BASIS_UNGROUNDED',
    );

    const judged = coverage.map((entry, index) => (
      index === 0
        ? {
          ...entry,
          status: JUDGED_STATUS,
          changeIds: [],
          rationale: 'the design interprets this as a host-level obligation',
          basis: { file: filePath, line: 1, quote: 'Laboratory handbook' },
        }
        : entry
    ));
    assert.deepEqual(
      validateObligationCoverage({ obligations, coverage: judged, changes, materialPaths: [filePath] }),
      { ok: true },
    );
    assert.equal(first.id.length > 3, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a directory material is expanded recursively, never silently skipped', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amend-obligations-dir-'));
  const nestedDirectory = path.join(directory, 'nested');
  const topFile = path.join(directory, 'TOP.md');
  const nestedFile = path.join(nestedDirectory, 'NESTED.md');
  try {
    fs.mkdirSync(nestedDirectory);
    fs.writeFileSync(topFile, '# Top contract\n\nThe top host must sign every artifact.\n');
    fs.writeFileSync(nestedFile, '# Nested contract\n\nThe nested host must bind the loopback address.\n');
    fs.writeFileSync(
      path.join(directory, 'binary.bin'),
      Buffer.from('# Fake contract\n\nThe fake host must obey binary bytes.\n\0'),
    );

    const obligations = extractObligations({ materialPaths: [directory] });
    const texts = obligations.map((entry) => entry.text);
    assert.equal(texts.some((text) => text.includes('Top contract')), true);
    assert.equal(texts.some((text) => text.includes('Nested contract')), true);
    assert.equal(texts.some((text) => text.includes('bind the loopback address')), true);
    assert.equal(texts.some((text) => text.includes('Fake contract')), false, 'binary material became an obligation');

    const nestedRequirement = obligations.find((entry) => entry.text.includes('bind the loopback address'));
    const changes = [{ id: 'CH1', text: obligations.map((entry) => entry.text).join('\n') }];
    const coverage = obligations.map((entry) => (
      entry.id === nestedRequirement.id
        ? {
          obligationId: entry.id,
          status: NOT_APPLICABLE_STATUS,
          changeIds: [],
          reason: 'the nested host binding is owned by another package',
          basis: { file: nestedFile, line: 3, quote: 'bind the loopback address' },
        }
        : {
          obligationId: entry.id,
          status: COVERED_STATUS,
          changeIds: ['CH1'],
          basis: { changeId: 'CH1', quote: entry.text },
        }
    ));
    assert.deepEqual(
      validateObligationCoverage({ obligations, coverage, changes, materialPaths: [directory] }),
      { ok: true },
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the obligations CLI writes an inventory and coverage skeleton', () => {
  const { directory, filePath } = makeHandbook();
  const inventoryPath = path.join(directory, 'OBLIGATIONS.json');
  const coveragePath = path.join(directory, 'OBLIGATION-COVERAGE.json');
  try {
    const inventory = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/obligations.js'),
      'inventory',
      `--materials=${filePath}`,
      `--out=${inventoryPath}`,
    ], { encoding: 'utf8' });
    assert.equal(inventory.status, 0, inventory.stderr);
    const obligations = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    assert.equal(obligations.length > 0, true);

    const init = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/obligations.js'),
      'init',
      `--inventory=@${inventoryPath}`,
      `--out=${coveragePath}`,
    ], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    assert.equal(JSON.parse(fs.readFileSync(coveragePath, 'utf8')).length, obligations.length);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
