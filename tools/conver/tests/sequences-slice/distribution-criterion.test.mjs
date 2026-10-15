// PX-263
// The criterion is the deliverable: a distribution is complete when every clause below holds, and
// the clauses exist so that "is this enough" is a value the code returns rather than a judgement a
// reader makes. Each clause names the check that measures it, so a clause and its measurement
// cannot drift apart, and the closure predicate refuses a claim the gates print with no clause
// behind it — which is the mechanism that stops the next round from repeating the last one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLAIM_CLAUSES,
  CRITERION_BOUNDARY,
  CRITERION_CLAUSES,
  criterionFindings,
  uncoveredClaims,
} from '../../.claude/scripts/sequences-slice/lib/distribution-criterion.mjs';

const GATE_SOURCE = path.join(process.cwd(), '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js');

/** A context in which every runtime clause holds. */
// [::TICKET::] PX-263, PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-263|PX-270) --for-spec --no-implementation-order`.
function holdingContext(overrides = {}) {
  const axis = { assigned: [{ id: 'R-0001', by: 'owns' }], exempt: [], unassigned: [] };
  return {
    coverage: {
      axes: { operations: axis, sequences: { ...axis }, boundaries: { ...axis }, surfaces: { ...axis } },
      denominatorGaps: [],
      refusedExemptions: [],
      unresolvedGrounds: [],
      ...overrides.coverage,
    },
    discharge: { unaccounted: [], withoutLedger: [], ...overrides.discharge },
    locations: { unresolved: [], ...overrides.locations },
    // The reach clause is measured over the carriage, so a context in which every clause holds
    // has to say that the named package's view was projected with it.
    packages: { named: ['pkg-a'], withView: ['pkg-a'], carried: ['pkg-a'], untransported: [], ...overrides.packages },
    gateSource: overrides.gateSource ?? fs.readFileSync(GATE_SOURCE, 'utf8'),
  };
}

test('PX-263 the criterion holds when every clause holds, and reports one finding per clause', () => {
  const findings = criterionFindings(holdingContext());

  assert.deepEqual(findings.map((finding) => finding.id), CRITERION_CLAUSES.map((clause) => clause.id));
  assert.equal(findings.every((finding) => finding.holds), true);
  assert.deepEqual(findings.map((finding) => finding.measuredBy), CRITERION_CLAUSES.map((clause) => clause.measuredBy));
});

test('PX-263 a context with nothing at all reports every runtime clause short and still names each one', () => {
  const findings = criterionFindings({
    coverage: {
      axes: { operations: { assigned: [], exempt: [], unassigned: [{ id: 'R-0001' }] }, sequences: { assigned: [], exempt: [], unassigned: [] }, boundaries: { assigned: [], exempt: [], unassigned: [] }, surfaces: { assigned: [], exempt: [], unassigned: [] } },
      denominatorGaps: [{ axis: 'operations', why: 'no census', repair: 'supply it' }],
      refusedExemptions: [{ kind: 'exemption', id: 'verb', why: 'no carrier', route: 'record' }],
      unresolvedGrounds: [{ subject: 'R-0001', axis: 'operations', route: 'assigns', ground: 'prose' }],
    },
    discharge: { unaccounted: [{ packageId: 'pkg-a', unitIds: ['op-R-0001'] }], withoutLedger: ['pkg-b'] },
    locations: { unresolved: [{ packageId: 'pkg-a', location: '§9.9' }] },
    packages: { named: ['pkg-a', 'pkg-b'], withView: ['pkg-a'], carried: [], untransported: ['pkg-a', 'pkg-b'] },
    gateSource: fs.readFileSync(GATE_SOURCE, 'utf8'),
  });

  assert.equal(findings.filter((finding) => finding.holds).length, 1, 'only the closure clause holds, because the gate claims nothing the criterion does not cover');
  assert.equal(findings.length, CRITERION_CLAUSES.length, 'a failing clause is named rather than collapsed into one verdict');
});

test('PX-263 the criterion is total over its clause list, in order, with a state drawn from a closed vocabulary', () => {
  const contexts = [
    holdingContext(),
    holdingContext({ coverage: { denominatorGaps: [{ axis: 'sequences', why: 'w', repair: 'r' }] } }),
    holdingContext({ discharge: { withoutLedger: ['pkg-a'] } }),
    holdingContext({ locations: { unresolved: [{ packageId: 'pkg-a', location: '§1' }] } }),
  ];

  for (const context of contexts) {
    const findings = criterionFindings(context);
    assert.deepEqual(findings.map((finding) => finding.id), CRITERION_CLAUSES.map((clause) => clause.id));
    for (const finding of findings) {
      assert.equal(typeof finding.claim, 'string');
      assert.ok(finding.claim.length > 0);
      assert.equal(typeof finding.holds, 'boolean');
      assert.equal(typeof finding.measuredBy, 'string');
    }
  }
});

test('PX-263 every clause names a measurement that exists, so a clause cannot cite one nobody wrote', async () => {
  // Every module a clause may cite is searched, the gates included, because a measurement may
  // live in a gate; restricting the search to the slice would allow a clause to cite a name that
  // nothing exports.
  const modules = [
    '../../.claude/scripts/sequences-slice/lib/obligation-coverage.mjs',
    '../../.claude/scripts/sequences-slice/lib/obligation-denominator.mjs',
    '../../.claude/scripts/sequences-slice/lib/obligation-ground.mjs',
    '../../.claude/scripts/sequences-slice/lib/distribution-ledger.mjs',
    '../../.claude/scripts/sequences-slice/lib/obligation.mjs',
    '../../.claude/scripts/sequences-slice/lib/view.mjs',
    '../../.claude/scripts/sequences-slice/lib/material.mjs',
    '../../.claude/scripts/sequences-slice/lib/distribution-criterion.mjs',
    '../../.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js',
  ];
  const available = new Set();
  for (const path of modules) for (const name of Object.keys(await import(path))) available.add(name);
  assert.ok(available.has('readViews') && available.has('readDistributionLedger'), 'the search reaches the modules the clauses cite');

  for (const clause of CRITERION_CLAUSES) {
    assert.equal(typeof clause.evaluate, 'function', `${clause.id} carries an evaluator`);
    assert.equal(typeof clause.claim, 'string');
    assert.ok(clause.measuredBy.length > 0, `${clause.id} names what measures it`);
    for (const name of clause.measuredBy.split('+')) assert.ok(available.has(name), `${clause.id} cites ${name}, which is exported`);
  }
});

test('PX-263 the closure clause holds over the real gate and fails when a claim has no clause behind it', () => {
  const real = fs.readFileSync(GATE_SOURCE, 'utf8');

  assert.deepEqual(uncoveredClaims(real), []);
  const withAnExtraClaim = `${real}\n// guarantees: every placement is also traceable to a ninth thing nobody measures\n`;
  assert.deepEqual(uncoveredClaims(withAnExtraClaim), ['every placement is also traceable to a ninth thing nobody measures']);
});

test('PX-263 the closure refuses an empty extraction rather than passing on one', () => {
  assert.throws(() => uncoveredClaims('const nothing = 1;'), /no guarantee line/);
});

test('PX-263 the criterion prints its boundary, so a satisfied criterion is not read as a claim about the world', () => {
  assert.match(CRITERION_BOUNDARY, /specification/);
  assert.match(CRITERION_BOUNDARY, /not measured/);
});

test('PX-263 the criterion carries no project-specific string', () => {
  const forbidden = ['pkg-0011', 'gaia', 'Gaia', '/Users/', 'shyme'];
  for (const clause of CRITERION_CLAUSES) {
    const text = `${clause.id} ${clause.claim} ${clause.measuredBy}`;
    for (const needle of forbidden) assert.equal(text.includes(needle), false, `${clause.id} carries no ${needle}`);
  }
  assert.equal(CRITERION_BOUNDARY.includes('gaia'), false);
});

test('PX-263 every declared claim maps to a clause that exists, so a declaration cannot cite a clause nobody wrote', () => {
  const ids = new Set(CRITERION_CLAUSES.map((clause) => clause.id));
  assert.ok(CLAIM_CLAUSES.length > 0, 'the declaration is not empty');
  for (const entry of CLAIM_CLAUSES) assert.ok(ids.has(entry.clause), `${entry.clause} is a clause of this criterion`);
  for (const clause of CRITERION_CLAUSES) {
    if (clause.id === 'K7') continue;
    assert.ok(CLAIM_CLAUSES.some((entry) => entry.clause === clause.id), `${clause.id} has a claim that reaches it`);
  }
});

// ---------------------------------------------------------------------------
// PX-270 @verifies C004
//
// The reach clause, over the carriage rather than over a file.
//
// Measured over the real workspace on 2026-10-15: the allocation names 29 packages, 26 hold a view,
// and 1 of those 26 holds a view projected with the obligation carriage. Evaluated over every
// parseable view the clause therefore reported the distribution as having reached all but three
// directories while twenty-five of them had never been carried. The clause is the one a reader
// consults to decide whether the sweep is done, so an answer it cannot support is worse than none.
// ---------------------------------------------------------------------------

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C004 the reach clause holds only when every named package holds a view written with the carriage', () => {
  const findings = criterionFindings(holdingContext());
  const k8 = findings.find((finding) => finding.id === 'K8');

  assert.equal(k8.holds, true);
  assert.equal(k8.detail, null);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C004 a named package holding a view that predates the carriage leaves the clause short, and the finding names it', () => {
  const findings = criterionFindings(holdingContext({
    packages: { named: ['pkg-a', 'pkg-b'], withView: ['pkg-a', 'pkg-b'], carried: ['pkg-a'], untransported: ['pkg-b'] },
  }));
  const k8 = findings.find((finding) => finding.id === 'K8');

  assert.equal(k8.holds, false);
  assert.match(k8.detail, /pkg-b/);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C004 a named package holding no view at all is still short, so the two absences are both named', () => {
  const findings = criterionFindings(holdingContext({
    packages: { named: ['pkg-a', 'pkg-b'], withView: ['pkg-a'], carried: ['pkg-a'], untransported: ['pkg-b'] },
  }));
  const k8 = findings.find((finding) => finding.id === 'K8');

  assert.equal(k8.holds, false);
  assert.match(k8.detail, /pkg-b/);
});

// [::TICKET::] PX-270 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-270 --for-spec --no-implementation-order`.
test('C004 the reworded clause is still covered by a declared claim, so the closure finds nothing uncovered', () => {
  const rewritten = 'guarantees: every package the allocation names holds a view projected with the obligation carriage, so the distribution reached every directory rather than most of them';

  assert.deepEqual(uncoveredClaims(rewritten), []);
  assert.deepEqual(uncoveredClaims('guarantees: every package the allocation names carries a view'), []);
});
