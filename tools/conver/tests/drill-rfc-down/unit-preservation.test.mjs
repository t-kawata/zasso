// PX-257 @verifies C001
// PX-257 @verifies C002
// PX-257 @verifies C003
// PX-257 @verifies C004
// The whole additivity argument rests on one property: a package with no distribution
// ledger produces no finding, so the sixth check leaves every existing verdict exactly
// where it was. That property is asserted before the call site is trusted, and the absence
// of a branch on the material is asserted by reading the shipped gate text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISTRIBUTION_OBLIGATION,
  obligationsFor,
} from '../../.claude/scripts/grill-me-for-rfc/sequences-ledger.js';
import {
  LEDGER_COLUMNS,
  LEDGER_TITLE_SUFFIX,
  UNIT_KINDS,
  readDistributionLedger,
} from '../../.claude/scripts/sequences-slice/lib/distribution-ledger.mjs';
import { checkUnitPreservation } from '../../.claude/scripts/drill-rfc-down/verify-consistencies.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFY_CONSISTENCIES = path.join(PROJECT_ROOT, '.claude/scripts/drill-rfc-down/verify-consistencies.js');

/** An RFC carrying a distribution ledger, or not. */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function rfcWithLedger({ rows = [], composition = true, columns = LEDGER_COLUMNS, precedence = true } = {}) {
  const table = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
  return [
    '# Package RFC',
    '',
    '## 1. Purpose',
    '',
    'The package does this.',
    '',
    `## A.1 ${LEDGER_TITLE_SUFFIX}`,
    '',
    ...(precedence ? ['This document is canonical over the material it was written from.'] : []),
    '',
    table,
    '',
    ...(composition && rows.length === 0 ? ['Composition check: no unit in this package is undisclosed.'] : []),
    '',
  ].join('\n');
}

/** A design tree seeded with the unit nodes the projection distributes. */
// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
function treeWithUnits(unitIds) {
  return { nodes: unitIds.map((id) => ({ id, title: id, status: 'open', questions: [], children: [] })) };
}

const ROW = (unit, kind, owner, location, ground) => [unit, kind, owner, location, ground];

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 obligationsFor returns nothing without the material and one descriptor with it', () => {
  assert.deepEqual(obligationsFor({ materialPaths: [] }), []);
  assert.deepEqual(obligationsFor({ materialPaths: ['/w/Spec.md'] }), []);
  assert.deepEqual(obligationsFor({}), []);

  const withView = obligationsFor({ materialPaths: ['/w/Spec.md', '/w/pkg/SEQUENCES.md', '/w/pkg/SEQUENCES.json'] });
  assert.equal(withView.length, 1);
  assert.equal(withView[0].kind, DISTRIBUTION_OBLIGATION.kind);
  assert.equal(withView[0].ledgerTitle, LEDGER_TITLE_SUFFIX);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 the legacy researchPath registers the obligation too, since it is the same material', () => {
  assert.equal(obligationsFor({ researchPath: '/w/pkg/SEQUENCES.md' }).length, 1);
  assert.equal(obligationsFor({ researchPath: '/w/Spec.md' }).length, 0);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C001 no gate file branches on the material name, read out of the shipped text', () => {
  const gateFiles = [
    path.join(PROJECT_ROOT, '.claude/scripts/drill-rfc-down/verify-consistencies.js'),
    path.join(PROJECT_ROOT, '.claude/scripts/sequences-slice/lib/distribution-ledger.mjs'),
  ];
  for (const file of gateFiles) {
    const code = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    assert.equal(/SEQUENCES\.(md|json)|-sequences\.json/.test(code), false, `${file} names the material`);
  }
  assert.deepEqual(obligationsFor({ materialPaths: [] }), []);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 a package with no ledger produces no finding, which is the whole additivity argument', () => {
  const rfcLines = ['# RFC', '', '## 1. Purpose', '', 'No ledger here.', ''];
  assert.deepEqual(checkUnitPreservation(rfcLines, treeWithUnits([]), null), []);
  assert.deepEqual(checkUnitPreservation(rfcLines, treeWithUnits(['op-A', 'seq-B']), null), []);
  assert.deepEqual(checkUnitPreservation(rfcLines, { nodes: [] }, null), []);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 a unit the tree carries and the ledger does not disclose is a high finding naming the unit', () => {
  const rfcLines = rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', '3.1 Issuance', 'spec line 30')] }).split('\n');
  const ledger = readDistributionLedger(rfcLines.join('\n'));
  const findings = checkUnitPreservation(rfcLines, treeWithUnits(['op-A', 'op-B']), ledger);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'high');
  assert.match(findings[0].message, /op-B/);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 a ledger disclosing every unit produces no finding', () => {
  const rfcLines = rfcWithLedger({
    rows: [ROW('op-A', 'operation', 'pkg-0006', '3.1 Issuance', 'spec line 30'), ROW('xdir-C', 'cross-boundary-sequence', 'pkg-0006', '3.2 Flow', 'spec line 40')],
  }).split('\n');
  const ledger = readDistributionLedger(rfcLines.join('\n'));
  assert.deepEqual(checkUnitPreservation(rfcLines, treeWithUnits(['op-A', 'xdir-C']), ledger), []);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 a ledger row citing a location that does not resolve is a low finding, not a high one', () => {
  const rfcLines = rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', 'RFC.md', 'spec line 30')] }).split('\n');
  const ledger = readDistributionLedger(rfcLines.join('\n'));
  const findings = checkUnitPreservation(rfcLines, treeWithUnits(['op-A']), ledger);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, 'low');
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 a ledger Unit outside the unit set is refused by name', () => {
  const verdict = readDistributionLedger(rfcWithLedger({ rows: [ROW('op-NotReal', 'operation', 'pkg-0006', '3.1', 'line 30')] }), new Set(['op-A']));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /op-NotReal/);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
// [::TICKET::] PX-259 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-259 --for-spec --no-implementation-order`.
test('C002 a well-formed ledger whose every Unit is a member is accepted, and a Kind outside the vocabulary is not', () => {
  assert.equal(readDistributionLedger(rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', '3.1', 'line 30')] }), new Set(['op-A'])).ok, true);
  const wrongKind = readDistributionLedger(rfcWithLedger({ rows: [ROW('op-A', 'invented', 'pkg-0006', '3.1', 'line 30')] }), new Set(['op-A']));
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.reason, /invented/);
  assert.deepEqual(UNIT_KINDS, ['operation', 'sequence', 'cross-boundary-sequence', 'contract', 'surface', 'declared-residual']);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a row whose location is empty or names a file is refused, naming the row index and the cell', () => {
  const empty = readDistributionLedger(rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', '', 'line 30')] }), new Set(['op-A']));
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /row 0/);

  const file = readDistributionLedger(rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', 'RFC.md', 'line 30')] }), new Set(['op-A']));
  assert.equal(file.ok, false);
  assert.match(file.reason, /row 0/);
  assert.match(file.reason, /RFC\.md/);

  const noGround = readDistributionLedger(rfcWithLedger({ rows: [ROW('op-A', 'operation', 'pkg-0006', '3.1', '')] }), new Set(['op-A']));
  assert.equal(noGround.ok, false);
  assert.match(noGround.reason, /row 0/);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a ledger with no rows and no composition check is refused as indistinguishable from unread', () => {
  const unread = readDistributionLedger(rfcWithLedger({ rows: [], composition: false }), new Set([]));
  assert.equal(unread.ok, false);
  assert.match(unread.reason, /composition check/i);
  assert.equal(readDistributionLedger(rfcWithLedger({ rows: [], composition: true }), new Set([])).ok, true);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a header whose columns are the five in order is required, and a precedence sentence is required', () => {
  const wrongColumns = readDistributionLedger(rfcWithLedger({ columns: ['Unit', 'Kind', 'Owner', 'Location', 'Ground'] }), new Set([]));
  assert.equal(wrongColumns.ok, false);
  const noPrecedence = readDistributionLedger(rfcWithLedger({ precedence: false }), new Set([]));
  assert.equal(noPrecedence.ok, false);
  assert.equal(readDistributionLedger('# RFC\n\nNo ledger at all.\n'), null, 'an absent ledger is null, not a refusal');
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 verify-consistencies.js still reports the findings it reported before when no ledger is present', () => {
  const result = spawnSync(process.execPath, [VERIFY_CONSISTENCIES], { encoding: 'utf8' });
  assert.equal(result.status, 1, 'a missing argument still exits 1 with its usage line');
  assert.match(result.stderr, /Usage:/);
});

// [::TICKET::] PX-257 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C004 the sixth check returns an array and never a bare finding, so it spreads like the other five', () => {
  assert.ok(Array.isArray(checkUnitPreservation(['# RFC'], { nodes: [] }, null)));
  assert.ok(Array.isArray(checkUnitPreservation(['# RFC'], treeWithUnits(['op-A']), readDistributionLedger(rfcWithLedger({ rows: [] })))));
});
