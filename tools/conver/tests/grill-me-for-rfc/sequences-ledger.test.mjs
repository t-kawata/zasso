// FIX-PLAN005 (docs/FIX-PLAN005.md) — the stage report must see the units the view distributes.
//
// The defect this file pins, reproduced before the fix:
//   node .claude/scripts/grill-me-for-rfc/sequences-ledger.js \
//     ~/shyme/gaia/crates/protocol/gaia-soul --stage=upstream
// printed "not proved: no unit is distributed to this package" for a package whose
// SEQUENCES.json carries twenty-six units. Every assertion below therefore goes through the
// shipped entry point rather than through renderStageReport: the report renderer already
// handled a non-empty list, so a unit-level assertion would have been green before the fix
// and would have proved nothing about the wiring that was missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEDGER_COLUMNS, LEDGER_TITLE_SUFFIX } from '../../.claude/scripts/sequences-slice/lib/distribution-ledger.mjs';
import { STATUS_FILENAME, VIEW_JSON_NAME } from '../../.claude/scripts/sequences-slice/lib/material.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc/sequences-ledger.js');

/** The sentence the report prints when it holds no unit at all. */
const EMPTY_CASE_SENTENCE = 'no unit is distributed to this package';

/** The ledger sentence that makes the document canonical over the material. */
const PRECEDENCE_SENTENCE = 'This document is canonical over the material it was written from.';

const STAGES_WITHOUT_A_DISCHARGE_ARTIFACT = ['conformance', 'implementation', 'ship', 'evolution'];

// A package directory that is removed once the body returns, so no fixture leaks between tests.
function withPackage(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-plan005-report-'));
  try {
    return body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * A package the report can be asked about.
 *
 * `recordsMaterial` writes the Status.json that registers the obligation, and the view is
 * written even when it distributes nothing, because a package handed an empty view is the
 * shape gaia-foundation and gaia-network have.
 */
function writePackage(root, { rfc, units = {}, recordsMaterial = true }) {
  const { operations = [], sequences = [], crossBoundary = [] } = units;
  fs.writeFileSync(path.join(root, 'RFC.md'), rfc);
  fs.writeFileSync(
    path.join(root, VIEW_JSON_NAME),
    JSON.stringify({
      ownedOperationUnits: operations.map((unitId) => ({ unitId })),
      ownedSequenceUnits: sequences.map((unitId) => ({ unitId })),
      crossBoundarySequenceUnits: crossBoundary.map((unitId) => ({ unitId })),
    }),
  );
  if (recordsMaterial) {
    fs.writeFileSync(
      path.join(root, STATUS_FILENAME),
      JSON.stringify({ state: 'completed', materialPaths: [path.join(root, VIEW_JSON_NAME)] }),
    );
  }
}

/** An RFC that carries no Distribution ledger at all. */
function rfcWithoutLedger() {
  return ['# RFC', '', '## 1. Purpose', '', 'The package does this.', ''].join('\n');
}

/** An RFC whose Distribution ledger carries the rows given. */
function rfcWithLedger(rows) {
  return [
    '# RFC',
    '',
    '## A.1 ' + LEDGER_TITLE_SUFFIX,
    '',
    PRECEDENCE_SENTENCE,
    '',
    `| ${LEDGER_COLUMNS.join(' | ')} |`,
    `| ${LEDGER_COLUMNS.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}

function runReport(root, stage = 'upstream') {
  const result = spawnSync(process.execPath, [REPORT, root, `--stage=${stage}`], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The verdict lines of a report, which are the lines the machine vocabulary begins. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function verdictLines(stdout) {
  return stdout.split('\n').filter((line) => /^(proved|not proved|undeclared):/.test(line));
}

test('C001 the report names every unit the view distributes, one line each, when no ledger exists', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: rfcWithoutLedger(),
      units: {
        operations: ['op-alpha', 'op-beta'],
        sequences: ['seq-gamma'],
        crossBoundary: ['xdir-delta'],
      },
    });

    const report = runReport(root);
    assert.equal(report.status, 0, report.stderr);
    assert.deepEqual(
      verdictLines(report.stdout),
      [
        'not proved: op-alpha at upstream',
        'not proved: op-beta at upstream',
        'not proved: seq-gamma at upstream',
        'not proved: xdir-delta at upstream',
      ],
      report.stdout,
    );
    assert.equal(
      report.stdout.includes(EMPTY_CASE_SENTENCE),
      false,
      'a package with four units is not the empty case',
    );
  });
});

test('C002 the report discharges the units the ledger rows, and only those', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: rfcWithLedger([['op-alpha', 'operation', 'pkg-0002', '3.1 Issuance', 'spec line 30']]),
      units: { operations: ['op-alpha', 'op-beta'], sequences: ['seq-gamma'] },
    });

    const report = runReport(root);
    assert.equal(report.status, 0, report.stderr);
    assert.deepEqual(
      verdictLines(report.stdout),
      [
        'proved: op-alpha at upstream',
        'not proved: op-beta at upstream',
        'not proved: seq-gamma at upstream',
      ],
      'being listed by the view is the obligation, not its discharge',
    );
  });
});

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
test('C003 the report names a missing ledger and discharges a present one, and the empty case is unchanged', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: rfcWithoutLedger(),
      units: { operations: ['op-alpha'] },
    });
    const reportWithoutLedger = runReport(root);
    assert.deepEqual(verdictLines(reportWithoutLedger.stdout), ['not proved: op-alpha at upstream']);
  });

  withPackage((root) => {
    writePackage(root, {
      rfc: rfcWithLedger([['op-alpha', 'operation', 'pkg-0002', '3.1 Issuance', 'spec line 30']]),
      units: { operations: ['op-alpha'] },
    });
    const reportWithLedger = runReport(root);
    assert.deepEqual(verdictLines(reportWithLedger.stdout), ['proved: op-alpha at upstream']);
  });

  withPackage((root) => {
    writePackage(root, { rfc: rfcWithoutLedger(), units: { operations: ['op-alpha'] }, recordsMaterial: false });
    const report = runReport(root);
    assert.equal(report.status, 0, report.stderr);
    assert.equal(
      report.stdout.includes(EMPTY_CASE_SENTENCE),
      true,
      'a package that was never handed the material reads exactly as it did before',
    );
  });

  withPackage((root) => {
    writePackage(root, { rfc: rfcWithoutLedger(), units: {} });
    const report = runReport(root);
    assert.equal(report.status, 0, report.stderr);
    assert.equal(
      report.stdout.includes(EMPTY_CASE_SENTENCE),
      true,
      'a package handed an empty view is the shape gaia-foundation and gaia-network have',
    );
  });
});

test('C004 a stage whose discharge artifact is not named reports not proved, never proved', () => {
  withPackage((root) => {
    writePackage(root, {
      rfc: rfcWithLedger([
        ['op-alpha', 'operation', 'pkg-0002', '3.1 Issuance', 'spec line 30'],
        ['seq-gamma', 'sequence', 'pkg-0002', '3.1 Issuance', 'spec line 30'],
      ]),
      units: { operations: ['op-alpha'], sequences: ['seq-gamma'] },
    });

    assert.deepEqual(verdictLines(runReport(root, 'upstream').stdout), [
      'proved: op-alpha at upstream',
      'proved: seq-gamma at upstream',
    ]);

    for (const stage of STAGES_WITHOUT_A_DISCHARGE_ARTIFACT) {
      const report = runReport(root, stage);
      assert.equal(report.status, 0, report.stderr);
      assert.deepEqual(
        verdictLines(report.stdout),
        [`not proved: op-alpha at ${stage}`, `not proved: seq-gamma at ${stage}`],
        `an unrun check at ${stage} must not be reported as proved`,
      );
    }
  });
});

test('C005 a package directory that was not given is refused with the usage line, not answered about an unnamed package', () => {
  const result = spawnSync(process.execPath, [REPORT], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^usage: sequences-ledger\.js/m);
  assert.equal(result.stdout, '', 'no verdict is printed about a package that was never named');
});

// PX-259 @verifies C004
test('C004 an undeclared view earns the third verdict, and an undeclared package is not a failure', () => {
  withPackage((root) => {
    writePackage(root, { rfc: rfcWithoutLedger(), units: { operations: [], sequences: [], crossBoundary: [] } });
    const unitsPath = path.join(root, VIEW_JSON_NAME);
    const view = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
    fs.writeFileSync(unitsPath, JSON.stringify({ ...view, obligationUnits: [], obligationSource: 'undeclared' }));

    const result = runReport(root);

    assert.equal(result.status, 0);
    assert.equal(verdictLines(result.stdout).length, 1);
    assert.match(verdictLines(result.stdout)[0], /^undeclared: /);
    assert.match(result.stdout, /declares no interface/);
  });
});
