// PX-309 @verifies C003
// A distribution generation opens when the grill writes a map whose digest differs from
// the one recorded. A no-op render is the same generation, and a render without the flag
// is not the grill's business.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  recordDistributionGeneration,
  renderDistribution,
} from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/render-distribution.mjs');

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [{
      unitId: 'op-Produce',
      operationId: 'Produce',
      resultObjectClasses: ['Thing'],
      ownerPackageIds: ['pkg-1'],
      roleCandidate: 'implementer',
      obligation: { purpose: 'produce', specLines: [12] },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function fixtureRfc() {
  return [
    '# Package RFC',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '',
  ].join('\n');
}

// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function writeFixture(directory, status) {
  const rfcPath = join(directory, 'RFC.md');
  writeFileSync(rfcPath, fixtureRfc());
  writeFileSync(join(directory, 'SEQUENCES.json'), JSON.stringify(fixtureView()));
  writeFileSync(join(directory, 'Status.json'), JSON.stringify(status));
  return { rfcPath, statusPath: join(directory, 'Status.json') };
}

test('C003 a changed map opens a distribution generation and records its digest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-'));
  const { rfcPath, statusPath } = writeFixture(directory, { state: 'GRILLING', distributionGeneration: 0 });
  const rendered = renderDistribution(fixtureRfc(), fixtureView());
  assert.equal(rendered.ok, true, rendered.code);

  recordDistributionGeneration(rfcPath, rendered.map);

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.distributionGeneration, 1);
  assert.equal(status.distributionDigest, rendered.map.digest);
});

test('C003 the same digest does not open a second generation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-same-'));
  const { rfcPath, statusPath } = writeFixture(directory, {
    state: 'GRILLING',
    distributionGeneration: 1,
    distributionDigest: 'a'.repeat(64),
  });
  const rendered = renderDistribution(fixtureRfc(), fixtureView());

  recordDistributionGeneration(rfcPath, { ...rendered.map, digest: 'a'.repeat(64) });

  assert.equal(JSON.parse(readFileSync(statusPath, 'utf8')).distributionGeneration, 1);
});

test('C003 a render without a map records nothing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-none-'));
  const { rfcPath, statusPath } = writeFixture(directory, { state: 'GRILLING', distributionGeneration: 2 });

  recordDistributionGeneration(rfcPath, null);

  assert.equal(JSON.parse(readFileSync(statusPath, 'utf8')).distributionGeneration, 2);
});

test('C003 the CLI without the flag leaves Status.json untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-cli-'));
  const { statusPath } = writeFixture(directory, { state: 'GRILLING', distributionGeneration: 0 });
  const before = readFileSync(statusPath);

  execFileSync(process.execPath, [RENDER], { cwd: directory, encoding: 'utf8' });

  assert.deepEqual(readFileSync(statusPath), before);
});

test('C003 the CLI with the flag opens the generation after a write', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-cli-flag-'));
  const { statusPath } = writeFixture(directory, { state: 'GRILLING', distributionGeneration: 0 });

  execFileSync(process.execPath, [RENDER, '--record-generation'], { cwd: directory, encoding: 'utf8' });

  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  assert.equal(status.distributionGeneration, 1);
  assert.match(status.distributionDigest, /^[0-9a-f]{64}$/);
});

test('C003 a second CLI run with the same map keeps the generation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px309-dist-cli-repeat-'));
  const { statusPath } = writeFixture(directory, { state: 'GRILLING', distributionGeneration: 0 });

  execFileSync(process.execPath, [RENDER, '--record-generation'], { cwd: directory, encoding: 'utf8' });
  execFileSync(process.execPath, [RENDER, '--record-generation'], { cwd: directory, encoding: 'utf8' });

  assert.equal(JSON.parse(readFileSync(statusPath, 'utf8')).distributionGeneration, 1);
});
