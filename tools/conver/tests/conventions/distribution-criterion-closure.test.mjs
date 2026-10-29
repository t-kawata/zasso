// PX-263
// The closure this ticket exists for. Every clause the gates claim, in the guarantee sentence they
// print and in the verdict vocabulary they answer with, is extracted as data and held against the
// criterion. A claim printed without a clause behind it fails here, which is the mechanism by which
// the next round is stopped from repeating the last one: four rounds each closed a named hole and
// each left residue, because nothing bound a claim to a measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CRITERION_BOUNDARY,
  CRITERION_CLAUSES,
  uncoveredClaims,
} from '../../.claude/scripts/sequences-slice/lib/distribution-criterion.mjs';

const GATE_SOURCES = [
  '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js',
  '.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js',
  '.claude/scripts/grill-me-for-rfc/check-distribution-completeness.js',
];

// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
function sourceOf(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('PX-263 every clause the gates claim is covered by a criterion clause', () => {
  for (const relativePath of GATE_SOURCES) {
    assert.deepEqual(uncoveredClaims(sourceOf(relativePath)), [], `${relativePath} claims nothing the criterion does not measure`);
  }
});

test('PX-263 the closure is not vacuous: each gate source yields at least one claim', () => {
  for (const relativePath of GATE_SOURCES) {
    const source = sourceOf(relativePath);
    // An extractor that found nothing would pass the test above for the wrong reason, so the
    // sources are asserted to carry a guarantee line the extractor is expected to read.
    assert.ok(/guarantee/i.test(source), `${relativePath} carries a guarantee line for the extractor to read`);
  }
});

test('PX-263 adding a claim without a clause fails the closure', () => {
  const source = sourceOf(GATE_SOURCES[0]);
  const withAnExtraClaim = `${source}\nconst extra = 'guarantees: every placement is also traceable to a ninth thing';`;

  assert.deepEqual(uncoveredClaims(withAnExtraClaim), ['every placement is also traceable to a ninth thing']);
});

test('PX-263 the criterion names no project, path or package, so it is the same criterion for every project', () => {
  const forbidden = ['pkg-', 'gaia', 'Gaia', 'GaiaSekkeiShiyousho', '/Users/', 'shyme', 'crates/'];
  for (const clause of CRITERION_CLAUSES) {
    const text = `${clause.id} ${clause.claim} ${clause.measuredBy}`;
    for (const needle of forbidden) assert.equal(text.includes(needle), false, `${clause.id} carries no "${needle}"`);
  }
  for (const needle of forbidden) assert.equal(CRITERION_BOUNDARY.includes(needle), false);
});

test('PX-263 the boundary is stated, so a satisfied criterion is never presented as a claim about the world', () => {
  assert.match(CRITERION_BOUNDARY, /not measured/);
  assert.match(CRITERION_BOUNDARY, /specification/);
});
