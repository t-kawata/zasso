// @verifies C002
// @verifies C003
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R8 — the origin spec, and the limits the profile states rather than hides.
 *
 * The round trip is the load-bearing property. The Markdown is what a reader
 * and every downstream command consumes, so if it did not re-parse to the
 * structure it was rendered from, the document would be prose that merely looks
 * structured and no later stage could trust it. It is proved here, including
 * that neither the input nor the rendered text is modified by proving it.
 *
 * The profile is the other half. Whether reverse engineering succeeded is a
 * human's judgement, so the machine states what it can and cannot prove across
 * five dimensions and emits no verdict at all: not `eligible`, and nothing that
 * routes on a threshold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOriginSpec,
  renderOriginSpec,
  parseOriginSpec,
  assertRoundTrip,
  validateOriginSpec,
  ORIGIN_SPEC_KIND,
  ORIGIN_SPEC_SCHEMA_VERSION,
  buildOriginSpecCandidate,
} from '../../../.claude/scripts/workspacify-reverse/lib/origin-spec.mjs';
import {
  buildCapabilityProfile,
  renderCapabilityProfile,
  CAPABILITY_DIMENSIONS,
} from '../../../.claude/scripts/workspacify-reverse/lib/capability-profile.mjs';
import { canonicalSerialize } from '../../../.claude/scripts/workspacify-tree/lib/canonical-json.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

const SPEC_TREE = Object.freeze({
  'src/api/login.rs': [
    'use crate::db::users::User;',
    '',
    'pub fn login(user: &User) -> bool {',
    '    assert!(!user.name.is_empty());',
    '    !user.name.is_empty()',
    '}',
    '',
  ].join('\n'),
  'src/db/users.rs': 'pub struct User { pub name: String }\n',
});

/** The claims a run over SPEC_TREE yields: one located, one handed to the grill. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function specClaims() {
  return [
    {
      claim_id: 'clm-observed-001',
      claim_type: 'observed',
      scope: 'src/api',
      statement: 'login asserts the user name is non-empty',
      falsification: 'a login path that admits an empty name',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' }],
      support: ['ev-login-004'],
      counterevidence: [],
      grill_question: null,
      normative_decision_id: null,
      residual_id: null,
      evidence_bundle_hash: null,
      evidence_records: [],
      basis: [],
      review_state: null,
      normative_authority: null,
    },
    {
      claim_id: 'clm-unresolved-002',
      claim_type: 'unresolved',
      scope: 'src/api',
      statement: 'the crossing from src/api into src/db is an intended boundary',
      falsification: 'a caller reaching src/db without passing the boundary',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 1 }, evidence_mode: 'source_static' }],
      support: [],
      counterevidence: ['the import arrived in a single commit with no design note'],
      grill_question: 'Is the crossing an intended boundary or an accident of history?',
      normative_decision_id: null,
      residual_id: null,
      evidence_bundle_hash: null,
      evidence_records: [],
      basis: [],
      review_state: null,
      normative_authority: null,
    },
  ];
}

// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function specOver(tree) {
  return {
    schema_version: ORIGIN_SPEC_SCHEMA_VERSION,
    kind: ORIGIN_SPEC_KIND,
    root: tree.root,
    title: `ORIGIN-LONG-SPEC — ${tree.root}`,
    tree_hash: 'sha256:deadbeef',
    claims: specClaims(),
    demotions: [],
  };
}

// --- C002 precondition -----------------------------------------------------------

test('C002 precondition: the analysis the profile reads has completed', () => {
  const analysis = { stagesRun: ['r0', 'r1', 'r2', 'r3.5'], ledger: { claims: [] } };

  const profile = buildCapabilityProfile(analysis);

  assert.equal(profile.stage, 'r8');
  assert.ok(profile.dimensions, 'the profile is built from the analysis it was handed');
});

// --- C002 postcondition ----------------------------------------------------------

test('UT-2 / C002 postcondition: the profile is five dimensions, each stating what can and cannot be proved', () => {
  const analysis = {
    stagesRun: ['r0', 'r1', 'r2', 'r2.5', 'r3.5', 'r5'],
    ledger: { claims: specClaims(), byClass: { observed: 1, inferred: 0, normative: 0, unresolved: 1 } },
    gaps: { gap_count: 0, by_kind: {} },
    surface: { entrypoints: [], mechanisms: [] },
    structure: { directoryCount: 2 },
  };

  const profile = buildCapabilityProfile(analysis);

  assert.equal(CAPABILITY_DIMENSIONS.length, 5);
  assert.equal(Object.isFrozen(CAPABILITY_DIMENSIONS), true);
  assert.deepEqual(Object.keys(profile.dimensions).sort(), [...CAPABILITY_DIMENSIONS].sort());
  for (const name of CAPABILITY_DIMENSIONS) {
    const dimension = profile.dimensions[name];
    assert.equal(dimension.dimension, name);
    assert.ok(dimension.question.length > 0, `${name} must ask a question a reader can answer`);
    assert.ok(dimension.can_prove.length > 0, `${name} must state what can be proved`);
    assert.ok(dimension.cannot_prove.length > 0, `${name} must state what cannot be proved`);
    assert.ok(dimension.evidence.length > 0, `${name} must show the material it rests on`);
    assert.equal(typeof dimension.determined, 'boolean');
  }
});

test('UT-2: the five dimension names are the five questions the design names', () => {
  assert.deepEqual(
    [...CAPABILITY_DIMENSIONS],
    ['provable', 'unprovable', 'observability', 'falsifiability', 'risk_concentration'],
  );
});

test('UT-6: a profile dimension that cannot be determined says so rather than being omitted', () => {
  const analysis = {
    stagesRun: ['r0', 'r1'],
    ledger: { claims: [], byClass: { observed: 0, inferred: 0, normative: 0, unresolved: 0 } },
    surface: null,
  };

  const profile = buildCapabilityProfile(analysis);

  assert.equal(profile.dimensions.observability.determined, false);
  assert.ok(profile.dimensions.observability.undetermined_reason.length > 0);
  assert.ok(profile.dimensions.observability.cannot_prove.length > 0);
  assert.equal(
    Object.keys(profile.dimensions).length,
    5,
    'an undetermined dimension is stated, never dropped',
  );
});

// --- C002 invariant --------------------------------------------------------------

test('UT-10 / C002 invariant: the capability profile never carries an eligible key', () => {
  const analysis = {
    stagesRun: ['r0', 'r1', 'r2', 'r2.5', 'r3.5', 'r5'],
    ledger: { claims: specClaims(), byClass: { observed: 1, inferred: 0, normative: 0, unresolved: 1 } },
    gaps: { gap_count: 2, by_kind: { stub: 2 } },
  };

  const profile = buildCapabilityProfile(analysis);

  const keys = [];
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
  (function walk(node) {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      keys.push(key);
      walk(value);
    }
  }(profile));

  assert.equal(keys.includes('eligible'), false, 'eligibility is a human decision');
  assert.equal(JSON.stringify(profile).includes('eligible'), false);
  assert.equal('verdict' in profile, false);
  assert.equal('recommendedMenu' in profile, false, 'no fixed threshold may route the run');
  assert.equal('menu' in profile, false);
});

test('UT-11: no code path routes on a threshold — the profile is material for a human', () => {
  const analysis = {
    stagesRun: ['r0', 'r1', 'r2', 'r2.5', 'r3.5', 'r5'],
    ledger: { claims: specClaims(), byClass: { observed: 1, inferred: 0, normative: 0, unresolved: 1 } },
    gaps: { gap_count: 5000, by_kind: { stub: 5000 } },
  };

  const profile = buildCapabilityProfile(analysis);

  assert.equal('routing' in profile, false);
  assert.equal('recommendation' in profile, false);
  assert.equal(/threshold/i.test(JSON.stringify(profile).replace(/"[^"]*threshold[^"]*"/gi, '')), false);
  const markdown = renderCapabilityProfile(profile);
  assert.match(markdown, /human/i, 'the reader is told the decision is theirs');
});

// --- C003 precondition -----------------------------------------------------------

test('C003 precondition: the JSON sidecar has been generated and is canonical', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const spec = specOver(tree);
    const sidecar = canonicalSerialize(spec);

    assert.equal(typeof sidecar, 'string');
    assert.ok(sidecar.endsWith('\n'), 'the sidecar is canonical JSON');
    const reloaded = JSON.parse(sidecar);
    assert.equal(reloaded.kind, ORIGIN_SPEC_KIND);
    assert.equal(reloaded.schema_version, ORIGIN_SPEC_SCHEMA_VERSION);
    assert.equal(Array.isArray(reloaded.claims), true);
  } finally {
    tree.dispose();
  }
});

// --- C003 postcondition ----------------------------------------------------------

test('UT-3 / C003 postcondition: the Markdown carries ATX headings and re-parses to the structure it rendered', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const spec = specOver(tree);
    const markdown = renderOriginSpec(spec);

    assert.match(markdown, /^# /m, 'the document opens with an ATX heading');
    assert.match(markdown, /^## /m, 'the document sections with ATX headings');
    assert.match(markdown, /^### /m, 'each claim hangs from an ATX heading');

    const reparsed = parseOriginSpec(markdown);
    assert.deepEqual(reparsed, spec, 'the Markdown re-parses to the structure it was rendered from');
  } finally {
    tree.dispose();
  }
});

test('UT-3 / C001: the round trip carries a normative clause and its whole provenance chain', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const span = { source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' };
    const clause = {
      claim_id: 'clm-normative-001',
      claim_type: 'normative',
      scope: 'src/api',
      statement: 'the crossing into src/db is an intended boundary',
      falsification: 'a caller that reaches src/db without passing the boundary',
      evidence: [span],
      support: ['ev-login-004'],
      counterevidence: [],
      grill_question: null,
      normative_decision_id: 'nd-001',
      residual_id: 'res-001',
      evidence_bundle_hash: 'sha256:abc',
      evidence_records: [span],
      basis: [],
      review_state: null,
      normative_authority: null,
    };
    const spec = { ...specOver(tree), claims: [clause] };

    const checked = validateOriginSpec(spec, { root: tree.root });
    assert.equal(checked.claims[0].claim_type, 'normative', 'a whole chain keeps its classification');

    const reparsed = parseOriginSpec(renderOriginSpec(checked));
    assert.deepEqual(
      reparsed,
      checked,
      'a published spec must carry the chain back, or the norm loses the decision it rests on',
    );
  } finally {
    tree.dispose();
  }
});

test('UT-3 / C001: an inferred claim keeps the basis that makes it admissible', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const inferred = {
      claim_id: 'clm-inferred-001',
      claim_type: 'inferred',
      scope: 'src/api',
      statement: 'a caller may rely on the failure at src/api/login.rs:4',
      falsification: 'a caller that ignores the failure and still resolves',
      evidence: [{ source_span: { file: 'src/api/login.rs', line: 4 }, evidence_mode: 'source_static' }],
      support: [],
      counterevidence: [],
      grill_question: null,
      normative_decision_id: null,
      residual_id: null,
      evidence_bundle_hash: null,
      evidence_records: [],
      basis: ['the error return at src/api/login.rs:4 exists in the text; that a caller may rely on it is an inference from that text'],
      review_state: null,
      normative_authority: null,
    };
    const ledger = { root: tree.root, claims: [inferred] };

    const spec = buildOriginSpec({ root: tree.root, ledger, treeHash: 'sha256:deadbeef' });

    assert.deepEqual(
      spec.claims[0].basis,
      inferred.basis,
      'an inference published without what it infers from is an assertion',
    );
    assert.deepEqual(parseOriginSpec(renderOriginSpec(spec)), spec, 'the basis must survive the document');
  } finally {
    tree.dispose();
  }
});

test('UT-3: the round trip holds for an empty spec and for one carrying demotions', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const empty = { ...specOver(tree), claims: [] };
    assert.deepEqual(parseOriginSpec(renderOriginSpec(empty)), empty);

    const demoted = {
      ...specOver(tree),
      claims: [specClaims()[1]],
      demotions: [{
        claim_id: 'clm-norm-003',
        from: 'normative',
        to: 'unresolved',
        reason: 'broken_provenance_chain',
        missing: 'residual_id',
      }],
    };
    assert.deepEqual(parseOriginSpec(renderOriginSpec(demoted)), demoted);
  } finally {
    tree.dispose();
  }
});

// --- C003 invariant --------------------------------------------------------------

test('UT-12 / C003 invariant: the round-trip proof modifies neither input', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const spec = specOver(tree);
    const frozen = canonicalSerialize(spec);
    const snapshot = JSON.parse(frozen);

    const proof = assertRoundTrip(spec);

    assert.equal(proof.equal, true);
    assert.equal(proof.headings, true);
    assert.deepEqual(spec, snapshot, 'the round trip must not mutate its input');
    assert.equal(canonicalSerialize(spec), frozen);
  } finally {
    tree.dispose();
  }
});

test('UT-12: a spec that would not re-parse is refused rather than rendered', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const broken = {
      ...specOver(tree),
      claims: [{ ...specClaims()[0], statement: 'a value\nspanning two lines' }],
    };

    assert.throws(() => renderOriginSpec(broken), /single line|re-parse|round trip/i);
  } finally {
    tree.dispose();
  }
});

// --- The origin spec a run builds from the ledger --------------------------------

test('UT-3: buildOriginSpec carries located evidence and hands the unresolved claim over', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const ledger = { root: tree.root, claims: specClaims(), candidates: [] };

    const spec = buildOriginSpec({ root: tree.root, ledger, stagesRun: ['r0', 'r3.5', 'r8'], treeHash: 'sha256:deadbeef' });

    assert.equal(spec.kind, ORIGIN_SPEC_KIND);
    assert.equal(spec.root, tree.root);
    assert.equal(spec.claims.length, 2);
    assert.equal(spec.claims.every((claim) => claim.evidence.length > 0), true);
    assert.deepEqual(parseOriginSpec(renderOriginSpec(spec)), spec);
  } finally {
    tree.dispose();
  }
});

test('UT-7: an empty ledger produces an explicit empty origin spec rather than a short one', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const spec = buildOriginSpec({ root: tree.root, ledger: { root: tree.root, claims: [] }, stagesRun: ['r0'], treeHash: 'sha256:deadbeef' });

    assert.deepEqual(spec.claims, []);
    const markdown = renderOriginSpec(spec);
    assert.match(markdown, /empty/i, 'the document states plainly that it holds nothing');
    assert.deepEqual(parseOriginSpec(markdown), spec);
  } finally {
    tree.dispose();
  }
});

// --- The oracle candidate the last comparison consumes ---------------------------

test('IT-5 shape: the r8 candidate names the RFC headings its claims reach and the regions it did not look at', () => {
  const tree = createSyntheticTree(SPEC_TREE);
  try {
    const spec = specOver(tree);
    const candidate = buildOriginSpecCandidate(spec);

    assert.equal(candidate.stage, 'r8');
    assert.ok(Array.isArray(candidate.entries));
    for (const entry of candidate.entries) {
      assert.equal(typeof entry.name, 'string');
      assert.ok(entry.name.length > 0);
    }
    for (const region of candidate.unobserved) {
      assert.ok(region.region.length > 0);
      assert.ok(region.stoppedAtPhase.length > 0);
      assert.ok(region.reason.length > 0);
    }
  } finally {
    tree.dispose();
  }
});
