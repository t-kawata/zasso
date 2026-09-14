// @verifies C001
// @verifies C002
/**
 * The security lane — authorization, tenancy, secrets, deletion and audit.
 *
 * The lane exists because for these propositions the code records what happens,
 * not what should happen: a missing or incorrect check is invisible in the code
 * that is present, so "the code does this" is the weakest possible evidence and
 * must never be enough to canonise one (F15).
 *
 * Two disciplines run through this file and are deliberately kept apart. The
 * first is that the lane is a *structural* separation rather than a flag: the
 * security claims and the ordinary claims live in two lists, so the ordinary
 * canonisation path has nothing to accept a lane claim from. A test asserts the
 * separation by trying to merge the two and requiring the attempt to be refused.
 *
 * The second is that a claim the classifier cannot settle is *reported*, never
 * defaulted to the ordinary lane. Silence there would read as "no risk found"
 * when the truth is "the risk was not readable", which is the one direction of
 * error this lane cannot afford.
 *
 * The authority predicate is not re-implemented here. G5 and this lane share one
 * definition of who may hold authority, imported from the grill that records it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CROSS_CUTTING_RISK_CATEGORIES,
  LANE_MEMBERSHIP,
  LANE_FALSIFICATION_BUDGET,
  RISK_CATEGORIES,
  SOURCE_STATIC_MODE,
  assertAuthorityRecorded,
  assertLanesAreSeparate,
  blockCanonisation,
  classifySecurityLane,
  isStrongFalsification,
  renderLaneReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/security-lane.mjs';
import {
  isStableAuthorityIdentifier,
  recordAuthority,
} from '../../../.claude/scripts/grill-me-for-rfc/normative-decision.js';

/**
 * A subject tree the classifier reads anchor lines from.
 *
 * The ledger names its root and the risk a claim carries is read from the source
 * text at its anchor, so a classification always needs both halves. The scratch
 * tree keeps them together without touching the real corpus.
 */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'wsp-security-lane-'));
  const subjectRoot = join(root, 'subject');
  mkdirSync(subjectRoot);
  return { root, subjectRoot };
}

/** Write one source member and return its root-relative path. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function writeSource(subjectRoot, relativePath, lines) {
  const fullPath = join(subjectRoot, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${lines.join('\n')}\n`, 'utf8');
  return relativePath;
}

/**
 * One claim of the shape the ledger emits, anchored at a file and line.
 *
 * The falsification condition is present because the ledger refuses a claim
 * without one, and the lane must not be able to classify a claim the ledger
 * itself would have rejected.
 */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function claimAt({ id, file, line, provider = null, scope = 'src' }) {
  return {
    claim_id: id,
    subjectKind: 'invariant',
    claim_type: 'inferred',
    scope,
    provider,
    statement: `the condition asserted at ${file}:${line} holds`,
    evidence: [
      {
        evidence_id: `ev-${id}`,
        evidence_mode: 'source_static',
        source_kind: 'impl',
        lineage_edges: [],
        independence_assessment: 'unknown',
        source_span: { file, line },
      },
    ],
    basis: [`the assertion at ${file}:${line} exists in the text`],
    counterevidence: ['the same shape appears in defensive checks'],
    falsification: `mutate the condition at ${file}:${line} and observe whether any test fails`,
    grill_question: '',
    normative_decision_id: null,
  };
}

/** The ledger one scratch tree and its claims make. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function ledgerOf(subjectRoot, claims) {
  return {
    root: subjectRoot,
    claims,
    byClass: {},
    independence_policy: 'folded elsewhere; the lane reads the claims, not the fold',
  };
}

/** One anchor line per risk category, none of which names a second category. */
const CATEGORY_ANCHORS = Object.freeze({
  authorization: { file: 'src/gate.rs', line: 3, text: 'let allowed = check_auth_header(&headers);' },
  tenancy: { file: 'src/scope.rs', line: 5, text: 'assert_eq!(row.tenant, current_tenant());' },
  secrets: { file: 'src/store.rs', line: 9, text: 'let secret = SecretString::new(raw);' },
  deletion: { file: 'src/life.rs', line: 11, text: 'purge_expired_records();' },
  audit: { file: 'src/trail.rs', line: 13, text: 'journal.append(entry);' },
});

/** A scratch subject carrying one risk-bearing anchor per cross-cutting category. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function categoryLedger(subjectRoot) {
  return ledgerOf(
    subjectRoot,
    CROSS_CUTTING_RISK_CATEGORIES.map((category) => {
      const anchor = CATEGORY_ANCHORS[category];
      // The anchor sits at its own line, as it does in a real ledger, so the
      // reader is exercised rather than handed line 1 every time.
      const padding = Array.from({ length: anchor.line - 1 }, (_, index) => `// line ${index + 1}`);
      writeSource(subjectRoot, anchor.file, [...padding, anchor.text]);
      return claimAt({ id: `clm-${category}-1`, file: anchor.file, line: anchor.line });
    }),
  );
}

/** The channels a falsification plan may name, one per evidence mode. */
// [::TICKET::] P22-22 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-22 --for-spec --no-implementation-order`.
function falsificationChannels() {
  return [
    { channel: 'sandbox execution', evidence_mode: 'runtime_dynamic' },
    { channel: 'cfg-evaluated build', evidence_mode: 'build_semantic' },
    { channel: 're-read the source', evidence_mode: SOURCE_STATIC_MODE },
  ];
}

const AUTHORITY = recordAuthority('security-domain-steward', { authorityKind: 'domain-steward' });

// ---------------------------------------------------------------------------
// UT-1 — the five cross-cutting categories are classified into the lane
// ---------------------------------------------------------------------------

test('UT-1: a claim anchored on each cross-cutting risk category is classified into the security lane', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));

    for (const category of CROSS_CUTTING_RISK_CATEGORIES) {
      const entry = classification.lane.security.find((e) => e.claim_id === `clm-${category}-1`);
      assert.ok(entry, `the ${category} claim was not classified into the security lane`);
      assert.equal(entry.lane, LANE_MEMBERSHIP.SECURITY);
      assert.deepEqual(entry.risk_categories, [category]);
    }

    assert.equal(classification.counts.total, CROSS_CUTTING_RISK_CATEGORIES.length);
    assert.equal(classification.counts.security, CROSS_CUTTING_RISK_CATEGORIES.length);
    assert.equal(classification.empty, false);
    assert.equal(classification.root, subjectRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-1b: every declared risk category is reported, including the ones this run found none of', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));

    // A category the corpus does not carry must read as a measured zero rather than
    // as an absent key: a reader cannot tell a missing row from a clean result.
    for (const category of RISK_CATEGORIES) {
      assert.equal(
        Object.hasOwn(classification.categories, category),
        true,
        `the report omits the risk category "${category}" entirely`,
      );
    }
    for (const category of CROSS_CUTTING_RISK_CATEGORIES) {
      assert.equal(classification.categories[category], 1, `the ${category} count is wrong`);
    }
    assert.equal(classification.categories.money, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-1c: a claim inside a declared risk surface is classified even when its own line names no risk term', () => {
  const { subjectRoot, root } = scratch();
  try {
    writeSource(subjectRoot, 'src/security/policy.rs', ['let outcome = evaluate(&request);']);
    const ledger = ledgerOf(subjectRoot, [
      claimAt({ id: 'clm-surface-1', file: 'src/security/policy.rs', line: 1 }),
    ]);

    const classification = classifySecurityLane(ledger);

    const entry = classification.lane.security.find((e) => e.claim_id === 'clm-surface-1');
    assert.ok(entry, 'a claim inside src/security/ was not classified into the lane');
    assert.ok(entry.risk_categories.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-1d: a claim whose anchor names no risk term is left in the ordinary lane', () => {
  const { subjectRoot, root } = scratch();
  try {
    writeSource(subjectRoot, 'src/math.rs', ['let total = left + right;']);
    const ledger = ledgerOf(subjectRoot, [claimAt({ id: 'clm-neutral-1', file: 'src/math.rs', line: 1 })]);

    const classification = classifySecurityLane(ledger);

    assert.equal(classification.lane.security.length, 0);
    assert.equal(classification.lane.ordinary.length, 1);
    assert.equal(classification.lane.ordinary[0].claim_id, 'clm-neutral-1');
    assert.equal(classification.empty, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-2 / UT-3 — the two halves of the canonisation gate
// ---------------------------------------------------------------------------

test('UT-2: a lane claim without an authority record is blocked from canonisation', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security[0];

    const decision = blockCanonisation(laneClaim, {
      authorityRecord: null,
      falsificationPlan: falsificationChannels(),
    });

    assert.equal(decision.canonisation_blocked, true);
    assert.equal(decision.claim_id, laneClaim.claim_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-3: a lane claim carrying both an authority record and a strong falsification can be canonised', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security[0];

    const decision = blockCanonisation(laneClaim, {
      authorityRecord: AUTHORITY,
      falsificationPlan: falsificationChannels(),
    });

    assert.equal(decision.canonisation_blocked, false);
    assert.deepEqual(decision.missing, []);
    assert.equal(decision.authority.authority_ref, 'security-domain-steward');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-3b: a source-only falsification plan is not strong, however long it is', () => {
  const claim = claimAt({ id: 'clm-x', file: 'src/gate.rs', line: 1 });

  // Re-reading the text three times is still re-reading the text: for a security
  // proposition what matters is what happens when the check is absent.
  assert.equal(isStrongFalsification(claim, [{ channel: 'a', evidence_mode: SOURCE_STATIC_MODE },
    { channel: 'b', evidence_mode: SOURCE_STATIC_MODE },
    { channel: 'c', evidence_mode: SOURCE_STATIC_MODE }]), false);
  assert.equal(isStrongFalsification(claim, []), false);
  // One observing channel is enough only when the budget of distinct channels is met.
  assert.equal(
    isStrongFalsification(claim, [{ channel: 'a', evidence_mode: 'runtime_dynamic' }]),
    LANE_FALSIFICATION_BUDGET <= 1,
  );
  assert.equal(
    isStrongFalsification(claim, falsificationChannels()),
    LANE_FALSIFICATION_BUDGET <= 3,
  );
  // A claim that states no falsification condition cannot carry a strong one.
  assert.equal(isStrongFalsification({ ...claim, falsification: '' }, falsificationChannels()), false);
});

// ---------------------------------------------------------------------------
// UT-4 / UT-5 / UT-6 — the error paths
// ---------------------------------------------------------------------------

test('UT-4: a high-risk claim without an authority record is refused with the claim named', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security.find((e) => e.claim_id === 'clm-secrets-1');

    const decision = blockCanonisation(laneClaim, {
      authorityRecord: null,
      falsificationPlan: falsificationChannels(),
    });

    assert.equal(decision.canonisation_blocked, true);
    assert.equal(decision.claim_id, 'clm-secrets-1');
    assert.deepEqual(decision.missing, ['a human authority record']);
    assert.match(decision.reason, /clm-secrets-1|authority/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-4b: an authority that is present but weak is refused as firmly as a missing one', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security[0];

    const decision = blockCanonisation(laneClaim, {
      authorityRecord: AUTHORITY,
      falsificationPlan: [{ channel: 're-read the source', evidence_mode: SOURCE_STATIC_MODE }],
    });

    assert.equal(decision.canonisation_blocked, true);
    assert.deepEqual(decision.missing, ['a strong falsification']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-5: a claim whose anchor cannot be read is reported rather than placed in the ordinary lane', () => {
  const { subjectRoot, root } = scratch();
  try {
    const ledger = ledgerOf(subjectRoot, [
      claimAt({ id: 'clm-detached-1', file: 'src/absent.rs', line: 1 }),
    ]);

    const classification = classifySecurityLane(ledger);

    assert.equal(classification.lane.ordinary.length, 0);
    assert.equal(classification.reported.length, 1);
    assert.equal(classification.reported[0].claim_id, 'clm-detached-1');
    assert.equal(classification.reported[0].lane, LANE_MEMBERSHIP.UNCLASSIFIED);
    assert.match(classification.reported[0].reason, /anchor|read/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-5c: a claim whose anchor lies outside the population is reported, not classified from its own path', () => {
  const { subjectRoot, root } = scratch();
  try {
    // `passwd` is in the secrets vocabulary, so a classifier that trusted the path
    // string would put this in the lane on the strength of an anchor that names
    // nothing in the population. Whether the claim is a secret is not readable here.
    const ledger = ledgerOf(subjectRoot, [
      claimAt({ id: 'clm-outside-1', file: '../../../../etc/passwd', line: 1 }),
    ]);

    const classification = classifySecurityLane(ledger);

    assert.equal(classification.lane.security.length, 0);
    assert.equal(classification.lane.ordinary.length, 0);
    assert.equal(classification.reported.length, 1);
    assert.match(classification.reported[0].reason, /population/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-5d: a claim whose lane was never settled is refused, not waved through as ordinary', () => {
  // The gate applies to claims the classifier put in the lane. A claim that never
  // went through classification has no settled membership, and answering "the gate
  // does not apply" would let a high-risk claim bypass it by never being classified.
  const unsettled = { claim_id: 'clm-unsettled-1', falsification: 'mutate the check and observe' };
  const misspelled = { ...unsettled, claim_id: 'clm-unsettled-2', lane: 'secuirty' };

  for (const claim of [unsettled, misspelled]) {
    const decision = blockCanonisation(claim, {
      authorityRecord: AUTHORITY,
      falsificationPlan: falsificationChannels(),
    });
    assert.equal(decision.canonisation_blocked, true, `${claim.claim_id} was waved through the lane gate`);
    assert.equal(decision.claim_id, claim.claim_id);
    assert.equal(decision.missing.length, 1);
    assert.match(decision.reason, /lane/i);
  }

  // An explicitly ordinary claim is the one case the gate does not apply to.
  const ordinary = blockCanonisation({ claim_id: 'clm-plain-1', lane: LANE_MEMBERSHIP.ORDINARY }, {});
  assert.equal(ordinary.canonisation_blocked, false);
});

test('UT-5b: a claim carrying no anchor at all is reported rather than proved ordinary', () => {
  const { subjectRoot, root } = scratch();
  try {
    const detached = { ...claimAt({ id: 'clm-no-evidence', file: 'src/gate.rs', line: 1 }), evidence: [] };
    const classification = classifySecurityLane(ledgerOf(subjectRoot, [detached]));

    assert.equal(classification.lane.ordinary.length, 0);
    assert.equal(classification.reported.length, 1);
    assert.equal(classification.reported[0].claim_id, 'clm-no-evidence');
    assert.match(classification.reported[0].reason, /anchor/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-6: an authority recorded as a personal name is rejected, by the predicate the grill also uses', () => {
  assert.equal(isStableAuthorityIdentifier('ToshimiKawata'), false);
  assert.throws(() => assertAuthorityRecorded({ authority_ref: 'ToshimiKawata', authority_kind: 'role' }),
    /personal name/);
  assert.throws(() => assertAuthorityRecorded({ authority_ref: 'alice smith', authority_kind: 'role' }),
    /personal name/);
  assert.throws(() => assertAuthorityRecorded(null), /authority/);
  assert.throws(() => assertAuthorityRecorded({ authority_ref: '', authority_kind: 'role' }), /authority/);
  assert.throws(() => assertAuthorityRecorded({ authority_ref: 'security-domain-steward', authority_kind: 'a-person' }),
    /authority kind|not one of/i);

  // The accepted form is a stable identifier, and it survives the round trip.
  assert.equal(assertAuthorityRecorded(AUTHORITY).authority_ref, 'security-domain-steward');
});

// ---------------------------------------------------------------------------
// UT-7 / UT-8 / UT-9 — the boundary cases
// ---------------------------------------------------------------------------

test('UT-7: a run with no high-risk claims reports that there were none rather than an empty lane', () => {
  const { subjectRoot, root } = scratch();
  try {
    writeSource(subjectRoot, 'src/math.rs', ['let total = left + right;']);
    const classification = classifySecurityLane(
      ledgerOf(subjectRoot, [claimAt({ id: 'clm-neutral-1', file: 'src/math.rs', line: 1 })]),
    );

    assert.equal(classification.empty, true);
    assert.notEqual(classification.note, '');
    assert.match(classification.note, /none|no claim/i);
    // An empty lane must still report the categories it looked for.
    assert.equal(Object.keys(classification.categories).length, RISK_CATEGORIES.length);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-8: a single high-risk claim is classified and gated correctly', () => {
  const { subjectRoot, root } = scratch();
  try {
    writeSource(subjectRoot, 'src/gate.rs', ['let allowed = check_auth_header(&headers);']);
    const classification = classifySecurityLane(
      ledgerOf(subjectRoot, [claimAt({ id: 'clm-only-1', file: 'src/gate.rs', line: 1 })]),
    );

    assert.equal(classification.counts.security, 1);
    assert.equal(classification.counts.ordinary, 0);
    assert.equal(classification.empty, false);

    const blocked = blockCanonisation(classification.lane.security[0], { authorityRecord: null });
    assert.equal(blocked.canonisation_blocked, true);
    assert.equal(blocked.claim_id, 'clm-only-1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-9: a claim naming a risk term only in a string literal or a comment is reported, not silently placed', () => {
  const { subjectRoot, root } = scratch();
  try {
    // "destroy" here names a shutdown phase inside a message, not a deletion the
    // code performs. Whether it is a deletion proposition is a human's call.
    writeSource(subjectRoot, 'src/shutdown.rs', [
      'assert!(timeout_msg.contains("destroy"), "must mention the phase");',
      '// erase is handled by the caller, not here',
    ]);
    const classification = classifySecurityLane(
      ledgerOf(subjectRoot, [
        claimAt({ id: 'clm-prose-1', file: 'src/shutdown.rs', line: 1 }),
        claimAt({ id: 'clm-prose-2', file: 'src/shutdown.rs', line: 2 }),
      ]),
    );

    assert.equal(classification.lane.security.length, 0);
    assert.equal(classification.lane.ordinary.length, 0);
    assert.deepEqual(classification.reported.map((e) => e.claim_id).sort(), ['clm-prose-1', 'clm-prose-2']);
    assert.ok(classification.reported.every((e) => e.lane === LANE_MEMBERSHIP.UNCLASSIFIED));
    assert.ok(classification.reported.every((e) => /comment|literal|prose/i.test(e.reason)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// UT-10 / UT-11 / UT-12 — the invariants
// ---------------------------------------------------------------------------

test('UT-10: the lane classification is never merged with the ordinary lanes', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const { security, ordinary } = classification.lane;

    assert.notEqual(security, ordinary, 'the two lanes are the same list, so a flag is all that separates them');
    assert.equal(assertLanesAreSeparate(classification), true);

    // A lane claim must not be reachable through the ordinary lane: appending one
    // is the shape of the simplification this invariant exists to refuse.
    const merged = { ...classification, lane: { security, ordinary: [...ordinary, security[0]] } };
    assert.throws(() => assertLanesAreSeparate(merged), /ordinary/);

    // Neither may an ordinary claim carry a risk category where a later reader
    // would find it and treat the ordinary path as gated.
    const mislabelled = {
      ...classification,
      lane: {
        security,
        ordinary: [...ordinary, { claim_id: 'clm-sneak-1', lane: LANE_MEMBERSHIP.ORDINARY, risk_categories: ['secrets'] }],
      },
    };
    assert.throws(() => assertLanesAreSeparate(mislabelled), /risk categor/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-11: no authority is recorded as a personal name anywhere the lane emits one', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const recorded = classification.lane.security.map((entry) => {
      const decision = blockCanonisation(entry, {
        authorityRecord: AUTHORITY,
        falsificationPlan: falsificationChannels(),
      });
      return decision.authority;
    });

    assert.ok(recorded.length > 0);
    for (const authority of recorded) {
      assert.equal(isStableAuthorityIdentifier(authority.authority_ref), true);
      assert.equal(authority.authority_ref, authority.authority_ref.toLowerCase());
    }

    // The rejected form never reaches a decision at all.
    for (const personalName of ['ToshimiKawata', 'AliceSmith', 'alice smith']) {
      assert.throws(() => blockCanonisation(classification.lane.security[0], {
        authorityRecord: { authority_ref: personalName, authority_kind: 'role' },
        falsificationPlan: falsificationChannels(),
      }), /personal name/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UT-12: the lane classification does not modify the claim it classifies', () => {
  const { subjectRoot, root } = scratch();
  try {
    const ledger = categoryLedger(subjectRoot);
    const before = structuredClone(ledger);

    const classification = classifySecurityLane(ledger);

    assert.deepEqual(ledger, before, 'the classification mutated the ledger it was given');
    // The entries are copies, so annotating one cannot reach back into the ledger.
    const entry = classification.lane.security[0];
    assert.notEqual(entry, ledger.claims.find((c) => c.claim_id === entry.claim_id));
    assert.equal(ledger.claims.every((c) => c.lane === undefined), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// C001 / C002 — the contracts, restated as input schemas, assertions and predicates
// ---------------------------------------------------------------------------

test('C001 precondition: the claim ledger exists, and a classifier given none refuses rather than reporting a clean lane', () => {
  assert.throws(() => classifySecurityLane(null), /claim ledger/);
  assert.throws(() => classifySecurityLane(undefined), /claim ledger/);
  assert.throws(() => classifySecurityLane('a ledger'), /claim ledger/);
  assert.throws(() => classifySecurityLane({ claims: [], root: '' }), /root of the population/);
  assert.throws(() => classifySecurityLane({ claims: [], root: 42 }), /root of the population/);
  assert.throws(() => classifySecurityLane({ root: '/tmp' }), /no list of claims/);
});

test('C001 postcondition: claims naming authorization, tenancy, secrets, deletion or audit are classified into the security lane', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));

    for (const category of CROSS_CUTTING_RISK_CATEGORIES) {
      const entry = classification.lane.security.find((e) => e.risk_categories.includes(category));
      assert.ok(entry, `no claim was classified as ${category}`);
    }
    assert.equal(classification.counts.security, CROSS_CUTTING_RISK_CATEGORIES.length);

    const unclassified = classification.lane.security
      .filter((e) => !e.risk_categories.every((c) => RISK_CATEGORIES.includes(c)));
    assert.deepEqual(unclassified, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 invariant: the lane classification is never merged with the ordinary lanes', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const securityIds = new Set(classification.lane.security.map((e) => e.claim_id));
    const ordinaryIds = classification.lane.ordinary.map((e) => e.claim_id);

    assert.equal(ordinaryIds.some((id) => securityIds.has(id)), false);
    assert.equal(assertLanesAreSeparate(classification), true);
    assert.throws(
      () => assertLanesAreSeparate({ lane: { security: [], ordinary: null } }),
      /lane/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 precondition: a high-risk claim exists, and the lane gate applies to it and to nothing else', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security[0];

    assert.ok(laneClaim);
    assert.equal(laneClaim.lane, LANE_MEMBERSHIP.SECURITY);

    const outside = blockCanonisation({ claim_id: 'clm-plain-1', lane: LANE_MEMBERSHIP.ORDINARY });
    assert.equal(outside.canonisation_blocked, false);
    assert.equal(outside.missing.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 postcondition: a human authority record and a strong falsification are both required', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const laneClaim = classification.lane.security[0];

    const observed = falsificationChannels().filter((c) => c.evidence_mode !== SOURCE_STATIC_MODE);
    const sourceOnly = [{ channel: 're-read the source', evidence_mode: SOURCE_STATIC_MODE }];

    const withoutAuthority = blockCanonisation(laneClaim, { authorityRecord: null, falsificationPlan: observed });
    assert.equal(withoutAuthority.canonisation_blocked, true);
    assert.deepEqual(withoutAuthority.missing, ['a human authority record']);

    const withoutFalsification = blockCanonisation(laneClaim, { authorityRecord: AUTHORITY, falsificationPlan: sourceOnly });
    assert.equal(withoutFalsification.canonisation_blocked, true);
    assert.deepEqual(withoutFalsification.missing, ['a strong falsification']);

    const withNeither = blockCanonisation(laneClaim, {});
    assert.equal(withNeither.canonisation_blocked, true);
    assert.deepEqual(withNeither.missing, ['a human authority record', 'a strong falsification']);

    const withBoth = blockCanonisation(laneClaim, { authorityRecord: AUTHORITY, falsificationPlan: observed });
    assert.equal(withBoth.canonisation_blocked, false);
    assert.equal(withBoth.authority.authority_ref, 'security-domain-steward');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 invariant: canonisation never occurs without an authority record', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));

    for (const entry of classification.lane.security) {
      const decision = blockCanonisation(entry, {
        authorityRecord: null,
        falsificationPlan: falsificationChannels(),
      });
      assert.equal(decision.canonisation_blocked, true);
      assert.equal(decision.claim_id, entry.claim_id);
      assert.equal(decision.authority, undefined);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The report a human reads before deciding
// ---------------------------------------------------------------------------

test('renderLaneReport states the counts, the per-category zeros and the empty lane in plain English', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));
    const report = renderLaneReport(classification);

    assert.match(report, /security lane/i);
    for (const category of RISK_CATEGORIES) assert.match(report, new RegExp(category));
    assert.match(report, /clm-authorization-1/);

    writeSource(subjectRoot, 'src/math.rs', ['let total = left + right;']);
    const quiet = classifySecurityLane(
      ledgerOf(subjectRoot, [claimAt({ id: 'clm-neutral-1', file: 'src/math.rs', line: 1 })]),
    );
    const quietReport = renderLaneReport(quiet);
    assert.match(quietReport, /none|no claim/i);
    assert.ok(!/succeeded|failed|passed/i.test(quietReport), 'the report must not use a verdict vocabulary');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the classification carries the policy it was made under, so a human can correct it later', () => {
  const { subjectRoot, root } = scratch();
  try {
    const classification = classifySecurityLane(categoryLedger(subjectRoot));

    assert.equal(typeof classification.policy, 'string');
    assert.match(classification.policy, /authority/i);
    assert.match(classification.policy, /falsification/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
