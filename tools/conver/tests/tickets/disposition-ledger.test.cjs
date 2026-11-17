'use strict';

/**
 * PX-440 C001 — disposition ledger validation.
 *
 * A disposition is machine evidence, not prose: every status carries the
 * structured fields it needs, a ruleId resolves to a declared rule, and an
 * evidence digest makes the disposition expire when its evidence changes.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DISPOSITIONS_FILE_NAME,
  evidenceDigestOf,
  indexDispositions,
  loadDispositions,
  validateDispositionLedger,
} = require('../../.claude/scripts/tickets/lib/dispositions.js');

const KEY = 'clause|pkg-alpha|OBL-alpha|precondition|aaaaaaaaaaaaaaaa';

/** The declared rules shared by the cases. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function rules() {
  return [
    { id: 'R-NA', kind: 'not-applicable', normativeSource: 'HANDOVER003 5.5' },
    { id: 'R-D', kind: 'design-predicate', normativeSource: 'graph:N1' },
    { id: 'R-P', kind: 'process', normativeSource: 'process:1' },
    { id: 'R-E', kind: 'external', normativeSource: 'interface:1' },
  ];
}

/** The evidence shared by the cases. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function evidence() {
  return [{ file: 'docs/HANDOVER.md', line: 652 }];
}

/** One disposition keyed by a suffix. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function keyOf(suffix) {
  return KEY.slice(0, KEY.lastIndexOf('|')) + '|' + suffix;
}

/** A record with the common fields. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function record(status, extra = {}) {
  return {
    key: KEY,
    status,
    normativeSource: 'HANDOVER003 5.5',
    evidence: evidence(),
    evidenceDigest: evidenceDigestOf(evidence()),
    ...extra,
  };
}

test('C001 Precondition: every status with its required fields is accepted', () => {
  const statuses = [
    { key: keyOf('testable'), status: 'TESTABLE' },
    record('DESIGN_PREDICATE_VERIFIED', { key: keyOf('design'), ruleId: 'R-D', predicate: 'node title is X', command: 'node check.js' }),
    record('PROCESS_VERIFIED', { key: keyOf('process'), ruleId: 'R-P', command: 'node process-check.js' }),
    record('EXTERNAL_VERIFIED', { key: keyOf('external'), ruleId: 'R-E', owner: 'P1-1', reason: 'remote system', command: 'node interface-check.js' }),
    record('NOT_APPLICABLE_VERIFIED', { key: keyOf('not-applicable'), ruleId: 'R-NA' }),
    { key: keyOf('deferred'), status: 'DEFERRED', owner: 'P1-1', reason: 'review pending', normativeSource: 'process:1', createdAt: '2026-11-17', expiresAt: '2027-01-01' },
  ];
  const ledger = { version: 1, rules: rules(), dispositions: statuses };

  const result = validateDispositionLedger({
    ledger,
    clauseKeys: new Set(statuses.map((entry) => entry.key)),
    openTicketKeys: new Set(['P1-1']),
    now: new Date('2026-11-17T00:00:00Z'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('C001 Postcondition: an unknown clause key is rejected', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [record('NOT_APPLICABLE_VERIFIED', { ruleId: 'R-NA' })] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DISPOSITION_KEY_UNKNOWN');
});

test('C001 Postcondition: an ad-hoc ruleId is rejected', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [record('NOT_APPLICABLE_VERIFIED', { ruleId: 'R-AD-HOC' })] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DISPOSITION_RULE_UNKNOWN');
});

test('C001 Postcondition: a rule kind that does not match the status is rejected', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [record('NOT_APPLICABLE_VERIFIED', { ruleId: 'R-D' })] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DISPOSITION_RULE_KIND_MISMATCH');
});

test('C001 Postcondition: a missing required field is named', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [record('DESIGN_PREDICATE_VERIFIED', { ruleId: 'R-D', predicate: 'node title is X' })] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DISPOSITION_FIELD_MISSING');
  assert.equal(result.findings[0].field, 'command');
});

test('C001 Invariant: a changed evidence digest invalidates the disposition', () => {
  const ledger = {
    version: 1,
    rules: rules(),
    dispositions: [record('NOT_APPLICABLE_VERIFIED', { ruleId: 'R-NA', evidenceDigest: 'sha256:' + '0'.repeat(64) })],
  };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DISPOSITION_EVIDENCE_DIGEST_MISMATCH');
});

test('C001 Invariant: a free-prose reason without the structured fields is rejected', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [{ key: KEY, status: 'NOT_APPLICABLE_VERIFIED', reason: 'does not apply here' }] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]) });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'DISPOSITION_FIELD_MISSING'), true);
});

test('C001 Postcondition: DEFERRED requires an owner, source, reason and expiry', () => {
  const ledger = { version: 1, rules: rules(), dispositions: [{ key: KEY, status: 'DEFERRED', owner: 'P1-1' }] };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]), openTicketKeys: new Set(['P1-1']) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DEFERRED_INVALID');
});

test('C001 Postcondition: a DEFERRED owner must be an open ticket or a named external owner', () => {
  const ledger = {
    version: 1,
    rules: rules(),
    dispositions: [{ key: KEY, status: 'DEFERRED', owner: 'P9-9', reason: 'later', normativeSource: 'process:1', createdAt: '2026-11-17', expiresAt: '2027-01-01' }],
  };

  const result = validateDispositionLedger({ ledger, clauseKeys: new Set([KEY]), openTicketKeys: new Set(['P1-1']) });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, 'DEFERRED_OWNER_NOT_OPEN');
});

test('C001: indexDispositions keeps the last record for one key', () => {
  const index = indexDispositions([
    { key: KEY, status: 'TESTABLE' },
    { key: KEY, status: 'NOT_APPLICABLE_VERIFIED' },
  ]);

  assert.equal(index.get(KEY).status, 'NOT_APPLICABLE_VERIFIED');
});

test('C001: loadDispositions returns an empty ledger when the file is absent', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px440-dispositions-'));
  try {
    const loaded = loadDispositions({ cwd, clauseKeys: new Set([KEY]) });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.exists, false);
    assert.equal(loaded.byKey.size, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C001: loadDispositions reads and validates the ledger file', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px440-dispositions-'));
  try {
    fs.writeFileSync(path.join(cwd, DISPOSITIONS_FILE_NAME), JSON.stringify({
      version: 1,
      rules: rules(),
      dispositions: [record('NOT_APPLICABLE_VERIFIED', { ruleId: 'R-NA' })],
    }));
    const loaded = loadDispositions({ cwd, clauseKeys: new Set([KEY]) });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.exists, true);
    assert.equal(loaded.byKey.get(KEY).status, 'NOT_APPLICABLE_VERIFIED');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
