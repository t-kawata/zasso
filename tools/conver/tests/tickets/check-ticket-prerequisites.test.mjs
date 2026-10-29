// PX-323 @verifies C006 C008
// The entry gate is conditional: no prerequisites is a skip, not a pass and not a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../.claude/scripts/tickets/check-ticket-prerequisites.js';

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'px323-'));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ artifact_kind: 'workspacify-allocate-manifest' }));
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-1', path: 'crates/pkg-1' }, { id: 'pkg-2', path: 'crates/pkg-2' }] },
  }));
  return root;
}

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function writeTickets(directory, phases, extra = {}) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'Tickets.json');
  writeFileSync(path, JSON.stringify({ title: 't', metadata: {}, phases, ...extra }));
  return path;
}

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ticket(id, status, prerequisites = [], units = []) {
  return { id, phaseId: 0, title: `t${id}`, status, contracts: [], prerequisites, distribution: { units } };
}

// [::TICKET::] PX-323 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-323 --for-spec --no-implementation-order`.
function operationUnit(unitId) {
  return { unitId, kind: 'operation', obligation: { mode: 'implement' } };
}

test('C006 a ticket with no prerequisites is skipped', () => {
  const root = workspace();
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), [{ id: 0, tickets: [ticket(1, 'made')] }]);
  const result = run(['--ticket-key=P0-1', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.verdict, { ok: true, skipped: 'no-prerequisites', findings: [] });
  rmSync(root, { recursive: true, force: true });
});

test('C008 a missing ticket is a skip, because Case B creates it later', () => {
  const root = workspace();
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), [{ id: 0, tickets: [ticket(1, 'made')] }]);
  const result = run(['--ticket-key=PX-9', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.verdict, { ok: true, skipped: 'ticket-not-found', findings: [] });
  rmSync(root, { recursive: true, force: true });
});

test('C006 an unfinished same-package prerequisite blocks entry', () => {
  const root = workspace();
  const phases = [{ id: 0, tickets: [ticket(1, 'planned'), ticket(2, 'made', [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }])] }];
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), phases);
  const result = run(['--ticket-key=P0-2', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_DONE' && entry.subject === 'P0-1'));
  rmSync(root, { recursive: true, force: true });
});

test('C006 a done same-package prerequisite passes', () => {
  const root = workspace();
  const phases = [{ id: 0, tickets: [ticket(1, 'done'), ticket(2, 'made', [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }])] }];
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), phases);
  const result = run(['--ticket-key=P0-2', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 0);
  assert.equal(result.verdict.ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('C006 a missing cross-package Tickets.json is PREREQUISITE_TICKETS_MISSING', () => {
  const root = workspace();
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), [{ id: 0, tickets: [ticket(1, 'made', [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }])] }]);
  const result = run(['--ticket-key=P0-1', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_TICKETS_MISSING' && entry.subject === 'pkg-1'));
  rmSync(root, { recursive: true, force: true });
});

test('C006 a cross-package implementer status is read from its Tickets.json', () => {
  const root = workspace();
  const providerPath = writeTickets(join(root, 'crates/pkg-1'), [{ id: 0, tickets: [ticket(1, 'done', [], [operationUnit('op-A')])] }]);
  assert.ok(providerPath);
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), [{ id: 0, tickets: [ticket(1, 'made', [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }])] }]);
  const result = run(['--ticket-key=P0-1', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 0);
  assert.equal(result.verdict.ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('C006 a planned cross-package implementer blocks entry', () => {
  const root = workspace();
  writeTickets(join(root, 'crates/pkg-1'), [{ id: 0, tickets: [ticket(1, 'planned', [], [operationUnit('op-A')])] }]);
  const ticketsPath = writeTickets(join(root, 'crates/pkg-2'), [{ id: 0, tickets: [ticket(1, 'made', [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }])] }]);
  const result = run(['--ticket-key=P0-1', `--tickets=${ticketsPath}`, `--workspace=${root}`]);
  assert.equal(result.code, 1);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_DONE'));
  rmSync(root, { recursive: true, force: true });
});
