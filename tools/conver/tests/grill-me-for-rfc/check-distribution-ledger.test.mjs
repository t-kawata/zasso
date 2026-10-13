// PX-257 @verifies C002
// PX-257 @verifies C003
// The gate is exercised as the command exercises it, because that is the interface its
// caller has, and because the verdict it prints on refusal is the whole of what an operator
// sees when a package cannot pass it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEDGER_COLUMNS, LEDGER_TITLE_SUFFIX } from '../../.claude/scripts/sequences-slice/lib/distribution-ledger.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/check-distribution-ledger.js');
const VIEW_NAME = 'SEQUENCES.json';

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function withPackage(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px257-gate-'));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function writePackage(root, { rfc, units = null }) {
  fs.writeFileSync(path.join(root, 'RFC.md'), rfc);
  if (units !== null) {
    fs.writeFileSync(
      path.join(root, VIEW_NAME),
      JSON.stringify({
        ownedOperationUnits: units.map((unitId) => ({ unitId })),
        ownedSequenceUnits: [],
        crossBoundarySequenceUnits: [],
      }),
    );
  }
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function ledgerText({ rows = [], composition = true }) {
  return [
    '# RFC',
    '',
    '## A.1 ' + LEDGER_TITLE_SUFFIX,
    '',
    'This document is canonical over the material it was written from.',
    '',
    `| ${LEDGER_COLUMNS.join(' | ')} |`,
    `| ${LEDGER_COLUMNS.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
    ...(composition && rows.length === 0 ? ['Composition check: nothing is undisclosed.'] : []),
    '',
  ].join('\n');
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
function runGate(root) {
  const result = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 a ledger whose every unit the view distributes is accepted', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: ledgerText({ rows: [['op-A', 'operation', 'pkg-0006', '3.1 Issuance', 'spec line 30']] }),
      units: ['op-A'],
    });
    const result = runGate(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 row/);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 a unit the view does not distribute is refused by name', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: ledgerText({ rows: [['op-Elsewhere', 'operation', 'pkg-0006', '3.1', 'spec line 30']] }),
      units: ['op-A'],
    });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /op-Elsewhere/);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a row whose location names a file is refused, naming the row index and the cell', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: ledgerText({ rows: [['op-A', 'operation', 'pkg-0006', 'RFC.md', 'spec line 30']] }),
      units: ['op-A'],
    });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /row 0/);
    assert.match(result.stderr, /RFC\.md/);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C003 a ledger with no rows and no composition check is refused as indistinguishable from unread', () => {
  withPackage((root) => {
    writePackage(root, { rfc: ledgerText({ rows: [], composition: false }), units: [] });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /composition check/i);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 an RFC with no ledger is refused, and a missing RFC is refused by path', () => {
  withPackage((root) => {
    writePackage(root, { rfc: '# RFC\n\nNo ledger here.\n' });
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(LEDGER_TITLE_SUFFIX));
  });
  withPackage((root) => {
    const result = runGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RFC\.md could not be read/);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 a package with no view bounds nothing, so a well-formed ledger is still accepted', () => {
  withPackage((root) => {
    writePackage(root, { rfc: ledgerText({ rows: [['op-A', 'operation', 'pkg-0006', '3.1', 'spec line 30']] }) });
    const result = runGate(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
test('C002 the gate refuses a missing argument with its usage line rather than a stack trace', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage:/);
  assert.equal(result.stderr.includes('at '), false);
});
