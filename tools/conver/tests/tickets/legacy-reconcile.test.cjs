'use strict';

/**
 * PX-436 C001/C003 — legacy omission-key reconciliation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { reconcileLegacy } = require('../../.claude/scripts/tickets/lib/legacy-reconcile.js');

/** An inventory with two clauses owned by one legacy ticket. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function inventoryOf() {
  return {
    version: 1,
    digest: 'sha256:inventory',
    clauses: [
      { key: 'clause|pkg-alpha|C044|postcondition|aaaaaaaaaaaaaaaa', contractId: 'C044', element: 'postcondition', textHash: 'aaaaaaaaaaaaaaaa', owners: ['P1-3'] },
      { key: 'clause|pkg-alpha|C045|precondition|bbbbbbbbbbbbbbbb', contractId: 'C045', element: 'precondition', textHash: 'bbbbbbbbbbbbbbbb', owners: ['P1-3'] },
    ],
  };
}

test('C001: a legacy stable key maps to its canonical clause key', () => {
  const result = reconcileLegacy({ legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'], inventory: inventoryOf(), judgments: [] });

  assert.equal(result.mapping['contract|P1-3/C044/postcondition|contract-delivery'], 'clause|pkg-alpha|C044|postcondition|aaaaaaaaaaaaaaaa');
  assert.equal(result.legacyDebt.length, 1);
  assert.equal(result.ticketsChanged, 0);
});

test('C003: an ambiguous legacy key is reported, never silently chosen', () => {
  const inventory = inventoryOf();
  inventory.clauses.push({ key: 'clause|pkg-alpha|C044|postcondition|cccccccccccccccc', contractId: 'C044', element: 'postcondition', textHash: 'cccccccccccccccc', owners: [] });
  const result = reconcileLegacy({ legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'], inventory, judgments: [] });

  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.mapping['contract|P1-3/C044/postcondition|contract-delivery'], undefined);
});

test('C001: a legacy PASS without a proof is not PROVEN', () => {
  const result = reconcileLegacy({
    legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'],
    inventory: inventoryOf(),
    judgments: [{ surface: 'contract', assetId: 'C044', criterion: 'B', status: 'PASS' }],
  });

  assert.equal(result.legacyPassWithoutProof.length, 1);
  assert.equal(result.legacyPassWithoutProof[0].status, 'EVIDENCE_UNPROVEN');
});

test('C003: reconciliation never mutates tickets', () => {
  const result = reconcileLegacy({ legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'], inventory: inventoryOf(), judgments: [] });
  assert.equal(result.ticketsChanged, 0);
});

test('C001: an empty tests array in a coverage entry is EVIDENCE_UNPROVEN, never a crash', () => {
  const inventory = inventoryOf();
  const result = reconcileLegacy({
    legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'],
    inventory,
    judgments: [{ surface: 'contract', assetId: 'C044', criterion: 'B', status: 'PASS' }],
    coverage: { clauses: [{ key: inventory.clauses[0].key, tests: [], proof: { status: 'PROVEN', verifiedAt: '2026-11-17T00:00:00Z' } }] },
  });

  assert.equal(result.legacyPassWithoutProof[0].status, 'EVIDENCE_UNPROVEN');
});

test('C001: the reconcile sidecar digest is deterministic', () => {
  const first = reconcileLegacy({ legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'], inventory: inventoryOf(), judgments: [] });
  const second = reconcileLegacy({ legacyStableKeys: ['contract|P1-3/C044/postcondition|contract-delivery'], inventory: inventoryOf(), judgments: [] });

  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^sha256:[0-9a-f]{64}$/);
});
