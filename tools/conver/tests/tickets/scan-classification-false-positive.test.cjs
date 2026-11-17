'use strict';

/**
 * PX-440 C004 — data-driven false-positive filtering.
 *
 * The classification ledger suppresses only findings it classifies as a false
 * positive with a reason. A directory name is never an exclusion rule, so a
 * real incomplete-implementation marker under any directory still blocks.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  OMISSION_EXCLUDED_DIRS,
  applyClassificationLedger,
  scanDirectory,
} = require('../../.claude/scripts/tickets/scan-incomplete-implementations.js');

const MARKER = ['TO', 'DO'].join('');
const FINDING = { file: 'amend/build-request.py', line: 29, pattern: MARKER, content: 'FORBIDDEN = re.compile(r"\\b(' + MARKER + ')\\b")' };

/** A ledger with one entry for the finding. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function ledgerOf(classification, reason) {
  return { version: 1, findings: [{ ...FINDING, classification, reason }] };
}

test('C004 Postcondition: a falsePositive with a reason is suppressed', () => {
  const applied = applyClassificationLedger({ findings: [FINDING], ledger: ledgerOf('falsePositive', 'the detector definition itself') });

  assert.equal(applied.blocking.length, 0);
  assert.equal(applied.suppressed.length, 1);
  assert.equal(applied.invalid.length, 0);
});

test('C004 Postcondition: a falsePositive without a reason is invalid and does not suppress', () => {
  const applied = applyClassificationLedger({ findings: [FINDING], ledger: ledgerOf('falsePositive', '') });

  assert.equal(applied.blocking.length, 1);
  assert.equal(applied.invalid.length, 1);
  assert.equal(applied.invalid[0].code, 'CLASSIFICATION_REASON_MISSING');
});

test('C004 Postcondition: a ledger entry for an unknown finding is invalid', () => {
  const applied = applyClassificationLedger({
    findings: [],
    ledger: ledgerOf('falsePositive', 'stale entry'),
  });

  assert.equal(applied.invalid.length, 1);
  assert.equal(applied.invalid[0].code, 'CLASSIFICATION_KEY_UNKNOWN');
});

test('C004 Postcondition: a non-falsePositive classification keeps the finding blocking', () => {
  const applied = applyClassificationLedger({ findings: [FINDING], ledger: ledgerOf('unmarked-confirmed', 'real incomplete implementation') });

  assert.equal(applied.blocking.length, 1);
  assert.equal(applied.suppressed.length, 0);
  assert.equal(applied.invalid.length, 0);
});

test('C004 Invariant: a real incomplete-implementation marker under a directory named amend is still reported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px440-amend-'));
  try {
    fs.mkdirSync(path.join(root, 'amend'), { recursive: true });
    fs.writeFileSync(path.join(root, 'amend', 'real.py'), 'def build():\n    ' + MARKER + ' = 1\n');
    const findings = scanDirectory(root, 'stubs', { sourceSet: 'omission', relativeTo: root });

    assert.equal(findings.some((finding) => finding.file === path.join('amend', 'real.py')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('C004 Invariant: no directory name is hardcoded as an exclusion', () => {
  assert.equal(OMISSION_EXCLUDED_DIRS.includes('amend'), false);
});
