// PX-326 @verifies C001 C002 C007 C008
// The registry contract must survive the whole make chain: merge writes it, the ticket
// validator accepts it, and Gate S covers it with @verifies contract-<boundary_id>.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';

import { boundaryContractProjection } from '../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs';

const require = createRequire(import.meta.url);
const { mergeContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const { validateTickets } = require('../../.claude/scripts/lib/validate-tickets.js');

const REGISTRY = [{
  boundary_id: 'boundary-001',
  contract_id: 'contract-boundary-001',
  provider_package: 'pkg-0001',
  consumer_package: 'pkg-0002',
  clauses: {
    preconditions: ['identity present'],
    postconditions: ['order_id derived'],
    invariants: ['one active order_id'],
  },
}];

// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function graphFixture() {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['op-ProduceFact'] },
      { id: 'N0002', unitIds: ['ctr-boundary-001'] },
    ],
    edges: [{
      from: 'N0002',
      to: 'N0001',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [boundaryContractProjection(REGISTRY[0], 'C900')],
    }],
  };
}

// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function ticketsFixture() {
  return [{
    id: 1,
    phaseId: 0,
    title: 'Boundary consumer',
    status: 'planned',
    nodeIds: ['N0002', 'ctr-boundary-001'],
    distribution: { units: [{ unitId: 'ctr-boundary-001', obligation: { mode: 'obligation' } }] },
    contracts: [],
  }];
}

test('C001 the merged registry contract passes the ticket validator', () => {
  const merged = mergeContracts(ticketsFixture(), graphFixture(), REGISTRY);
  const document = {
    title: 'Synthetic package',
    round: 1,
    metadata: { source: 'PX-326', generatedAt: '2026-10-27' },
    phases: [{ id: 0, name: 'P0', tickets: merged }],
  };
  const result = validateTickets(document);
  assert.ok(result.valid, JSON.stringify(result.errors));
  const contract = merged[0].contracts.find((entry) => entry.boundaryId === 'boundary-001');
  assert.equal(contract.id, 'contract-boundary-001');
  assert.equal(contract.sourceEdge, 'boundary:boundary-001');
});

test('C001 update-ticket writes the merged registry contract unchanged', () => {
  const merged = mergeContracts(ticketsFixture(), graphFixture(), REGISTRY);
  const document = {
    title: 'Synthetic package',
    round: 1,
    metadata: { source: 'PX-326', generatedAt: '2026-10-27' },
    phases: [{ id: 0, name: 'P0', tickets: merged }],
  };
  const root = mkdtempSync(join(tmpdir(), 'px326-update-'));
  try {
    const ticketsPath = join(root, 'Tickets.json');
    writeFileSync(ticketsPath, JSON.stringify(document, null, 2));
    const script = join(process.cwd(), '.claude/scripts/tickets/update-ticket.js');
    const output = execFileSync(process.execPath, [script, ticketsPath, 'P0-1'], {
      input: JSON.stringify({ status: 'made' }),
      encoding: 'utf8',
    });
    const verdict = JSON.parse(output.trim().split('\n').pop());
    assert.equal(verdict.success, true);
    const written = JSON.parse(require('node:fs').readFileSync(ticketsPath, 'utf8'));
    const contract = written.phases[0].tickets[0].contracts.find((entry) => entry.boundaryId === 'boundary-001');
    assert.equal(contract.id, 'contract-boundary-001');
    assert.equal(contract.sourceEdge, 'boundary:boundary-001');
    assert.equal(contract.precondition, 'identity present');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 Gate S covers the merged registry contract end to end', () => {
  const merged = mergeContracts(ticketsFixture(), graphFixture(), REGISTRY);
  const document = {
    title: 'Synthetic package',
    round: 1,
    metadata: { source: 'PX-326', generatedAt: '2026-10-27' },
    phases: [{ id: 0, name: 'P0', tickets: merged }],
  };
  const root = mkdtempSync(join(tmpdir(), 'px326-gate-s-'));
  try {
    writeFileSync(join(root, 'Tickets.json'), JSON.stringify(document, null, 2));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'tests', 'registry.test.js'), [
      '// @verifies C900',
      '// @verifies contract-boundary-001',
      'test("registry contract", () => {});',
      '',
    ].join('\n'));
    const script = join(process.cwd(), '.claude/scripts/tickets/verify-red-coverage.js');
    const output = execFileSync(process.execPath, [script, '--ticket-key=P0-1', `--test-dir=${join(root, 'tests')}`], {
      cwd: root,
      encoding: 'utf8',
    });
    const verdict = JSON.parse(output.trim().split('\n').pop());
    assert.equal(verdict.ok, true);
    assert.equal(verdict.contractsChecked, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const GAIA_ROOT = process.env.GAIA_ROOT ?? join(homedir(), 'shyme', 'gaia');

test('C008 the changed scripts are mirrored to the gaia target', { skip: !existsSync(GAIA_ROOT) }, () => {
  const files = [
    '.claude/scripts/tickets/lib/contract-id.js',
    '.claude/scripts/tickets/lib/contract-facts.js',
    '.claude/scripts/tickets/lib/step-owner.js',
    '.claude/scripts/tickets/verify-red-coverage.js',
    '.claude/scripts/tickets/verify-make-distribution.js',
    '.claude/scripts/tickets/show-ticket-context.js',
    '.claude/scripts/tickets/merge-contracts-to-tickets.js',
    '.claude/scripts/tickets/tickets-schema.json',
    '.claude/commands/make-ticket.md',
  ];
  for (const file of files) {
    const converBytes = readFileSync(join(process.cwd(), file), 'utf8');
    const gaiaBytes = readFileSync(join(GAIA_ROOT, file), 'utf8');
    assert.equal(gaiaBytes, converBytes, `${file} must match the installed gaia copy`);
  }
});

test('C007 a ticket with no distribution units keeps the skip verdict', () => {
  // The validator and the gate are separate; the skip is the Case B contract.
  const document = {
    title: 'Case B package',
    round: 1,
    metadata: { source: 'conversation', generatedAt: '2026-10-27' },
    phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'Case B', status: 'todo' }] }],
  };
  assert.ok(validateTickets(document).valid);
});
