// @verifies C001
// @verifies C002
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * R3 — the semantic material, in two separated stages.
 *
 * The subject of these tests is the boundary between a fact and a meaning. A
 * guard, an assert and an error path are conditions that exist in the
 * implementation; none of them establishes whether it is a precondition, a
 * postcondition or an invariant, and the extractor is forbidden from deciding.
 * Most of what follows therefore asserts what the extractor *refuses*: to
 * promote a candidate, to accept a proposition that restates intent, to pass a
 * candidate where a decided fact is required, and to call a runtime fact
 * `observed` on source evidence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSyntheticTree } from '../helpers/scratch.mjs';

import {
  FACT_KINDS,
  FACT_VOCABULARY,
  SEMANTIC_FAMILIES,
  assertCandidateIsSourceFalsifiable,
  assertDecidedFact,
  assertSpanResolves,
  buildStateMachineCandidate,
  enumerateSourceFacts,
  extractSemantics,
  generateCandidates,
  isDecidedFact,
} from '../../../.claude/scripts/workspacify-reverse/lib/semantics.mjs';
import {
  CANDIDATE_CLASSIFICATION,
  EXTRACTOR_CLASSES,
  PROVENANCE_CLASSES,
  RELATION_STRENGTHS,
} from '../../../.claude/scripts/workspacify-reverse/lib/provenance.mjs';
import { EVIDENCE_MODES, emptyCoverage } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

/** Where the Rust subject lives on disk. */
const R3_SUBJECT_ROOT = fileURLToPath(new URL('../fixtures/r3-subject/', import.meta.url));

/** The fixture's files, keyed by the path the analysis will read them at. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function r3SubjectFiles(relativePaths) {
  return Object.fromEntries(
    relativePaths.map((relativePath) => [relativePath, readFileSync(join(R3_SUBJECT_ROOT, relativePath), 'utf8')]),
  );
}

/**
 * The Rust subject, read from `fixtures/r3-subject/`.
 *
 * It lives on disk rather than as strings in this file because it is Rust
 * source, and the project's quality checks look for the panicking unwrapping
 * calls that Rust code must not ship. Those checks read a `.mjs` and cannot tell
 * a fixture from a shipped path, so keeping Rust text here would report a
 * defect the project does not have. Every other Rust subject in this suite is a
 * directory for the same reason.
 */
const R3_FIXTURE_FILES = Object.freeze(r3SubjectFiles([
  'Cargo.toml',
  'src/api/login.rs',
  'src/api/session.rs',
  'src/error.rs',
  'src/api/gated.rs',
  'tests/login_test.rs',
]));

/** A tree whose single file carries no fact of any kind. */
const R3_EMPTY_FILES = Object.freeze({
  'src/api/ping.rs': 'pub fn ping() -> u8 { 1 }\n',
});

/**
 * The R2 graph this run is scoped by.
 *
 * R3 reads semantic material *within the boundary R2 measured*, so the graph is
 * a precondition rather than a decoration: without it there is no population to
 * enumerate over, and an extractor that silently walked the whole tree instead
 * would be measuring something nobody asked about.
 */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function r2GraphFor(root) {
  return {
    analysis_mode: 'syntax_only',
    coverage: emptyCoverage(),
    limitations: [],
    root,
  };
}

// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildFor(files) {
  const subject = createSyntheticTree(files);
  const semantics = extractSemantics({
    root: subject.root,
    dependencies: r2GraphFor(subject.root),
  });
  return { subject, semantics };
}

// --- C001 precondition: the R2 dependency graph exists --------------------------

test('C001 precondition: extractSemantics refuses a run with no R2 dependency graph', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);

  // The absence of the graph is a refusal, not an empty extraction: an empty
  // result reads as a tree with nothing in it, which is a different claim.
  assert.throws(
    () => extractSemantics({ root: subject.root, dependencies: null }),
    /R2 dependency graph/,
  );
  assert.throws(() => extractSemantics({ root: subject.root }), /R2 dependency graph/);

  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });
  assert.equal(semantics.analysis_mode, 'syntax_only');
  subject.dispose();
});

// --- C001 postcondition: eight families, each fact carrying file:line ------------

test('C001 postcondition: every family is enumerated and every fact carries a resolvable file:line', () => {
  const { subject, semantics } = buildFor(R3_FIXTURE_FILES);

  for (const family of SEMANTIC_FAMILIES) {
    assert.ok(Array.isArray(semantics.families[family]), `${family} is an enumerated family`);
  }

  const facts = SEMANTIC_FAMILIES.flatMap((family) => semantics.families[family]);
  assert.ok(facts.length > 0, 'a tree carrying code yields facts');
  for (const fact of facts) {
    assert.ok(FACT_KINDS.includes(fact.kind), `${fact.fact_id} carries a closed-vocabulary kind`);
    assert.ok(SEMANTIC_FAMILIES.includes(fact.family), `${fact.fact_id} names its family`);
    assert.equal(assertSpanResolves(subject.root, fact.source_span), true, `${fact.fact_id} resolves`);
    assert.equal(typeof fact.source_span.line, 'number');
  }
  subject.dispose();
});

test('C001 postcondition: each of the eight families is reached by the fixture', () => {
  const { subject, semantics } = buildFor(R3_FIXTURE_FILES);

  const reached = SEMANTIC_FAMILIES.filter((family) => semantics.families[family].length > 0);
  assert.deepEqual(
    reached,
    [...SEMANTIC_FAMILIES],
    'the fixture exercises all eight families; a family that stayed empty would be an untested claim',
  );
  subject.dispose();
});

// --- the failure-shaped facts the design enumerates individually ---------------

test('C001 postcondition: each named fact kind is enumerated as its own kind', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  const kinds = new Set(semantics.facts.map((fact) => fact.kind));
  // Each of these is named separately in the design's enumeration, so each is
  // asserted separately: a vocabulary that stopped reaching one of them would
  // leave its family populated by its siblings and the gap would be invisible.
  for (const kind of ['assert', 'unwrap_expect', 'error_return', 'error_variant', 'early_return', 'conditional', 'loop_condition']) {
    assert.ok(kinds.has(kind), `${kind} is enumerated as its own kind`);
  }

  // An unwrapping call is read from a call expression, and its name filter is
  // the only thing distinguishing it from every other call in the file.
  const unwrapping = semantics.facts.filter((fact) => fact.kind === 'unwrap_expect');
  assert.equal(unwrapping.length, 1, 'the fixture carries exactly one unwrapping call');
  assert.match(unwrapping[0].text, /expect/);
  subject.dispose();
});

// --- C001 invariant: candidates are never settled here --------------------------

test('C001 invariant: no candidate leaves the extractor settled, and none is normative', () => {
  const { subject, semantics } = buildFor(R3_FIXTURE_FILES);

  assert.ok(semantics.candidates.length > 0, 'the fixture carries contract candidates');
  for (const candidate of semantics.candidates) {
    assert.ok(
      EXTRACTOR_CLASSES.includes(candidate.claim_type),
      `${candidate.candidate_id} is observed or unresolved, never ${candidate.claim_type}`,
    );
    assert.notEqual(candidate.claim_type, 'normative', 'a norm without a recorded decision is an invented authority');
    assert.ok(PROVENANCE_CLASSES.includes(candidate.claim_type));
  }
  subject.dispose();
});

// --- two separated stages -------------------------------------------------------

test('UT-4 stage separation: stage one is deterministic and stage two is what may mean', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);
  const facts = enumerateSourceFacts({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  for (const fact of facts.facts) {
    assert.equal(fact.evidence_mode, 'source_static', 'stage one reads the text and its syntax tree');
    assert.equal(assertSpanResolves(subject.root, fact.source_span), true);
  }

  const candidates = generateCandidates(facts).candidates;
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.equal(candidate.classification, CANDIDATE_CLASSIFICATION);
    assert.equal(candidate.requires_human_approval, true);
    assert.equal(isDecidedFact(candidate), false, 'a candidate is not a decided fact');
    assert.throws(
      () => assertDecidedFact(candidate),
      /candidate/,
      'a candidate cannot be passed where a decided fact is required',
    );
  }
  subject.dispose();
});

test('UT-4 stage separation: generateCandidates refuses a fact list it was not given', () => {
  // Stage two consumes stage one's output and nothing else, so a caller that
  // hands it a bare object must be told rather than silently given nothing.
  assert.throws(() => generateCandidates(null), /facts/);
  assert.throws(() => generateCandidates({}), /facts/);
});

// --- UT-2 / UT-16: what the extractor refuses ----------------------------------

test('UT-16: a source-falsifiable proposition is accepted and an intent restatement is refused', () => {
  const accepted = {
    candidate_id: 'cand-send-not-connected-001',
    classification: CANDIDATE_CLASSIFICATION,
    claim_type: 'observed',
    requires_human_approval: true,
    source_span: { file: 'src/api/login.rs', line: 5 },
    proposition:
      'the body of the send path contains a branch that returns the not-connected error when the '
      + 'carrier state is not connected',
    undecided: 'whether that is a caller obligation or an internal defence',
  };
  const rejected = {
    ...accepted,
    candidate_id: 'cand-send-not-connected-002',
    proposition: 'the precondition is that the connection is established',
  };

  assert.equal(assertCandidateIsSourceFalsifiable(accepted), true);
  assert.throws(() => assertCandidateIsSourceFalsifiable(rejected), /restates intent/);
});

test('UT-16: a candidate with no resolvable span is refused rather than stored', () => {
  const root = createSyntheticTree(R3_FIXTURE_FILES);
  const anonymous = {
    candidate_id: 'cand-nowhere-001',
    classification: CANDIDATE_CLASSIFICATION,
    claim_type: 'observed',
    requires_human_approval: true,
    source_span: { file: 'src/api/absent.rs', line: 3 },
    proposition: 'the body of the absent path contains a branch that returns an error',
    undecided: 'whether the branch is reachable',
  };

  assert.throws(() => assertCandidateIsSourceFalsifiable(anonymous, { root: root.root }), /does not resolve/);
  root.dispose();
});

// --- UT-6 / UT-7: spans, and the empty case ------------------------------------

test('UT-6: a file:line that does not resolve is reported rather than stored as if valid', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);

  assert.equal(assertSpanResolves(subject.root, { file: 'src/api/login.rs', line: 4 }), true);
  assert.equal(assertSpanResolves(subject.root, { file: 'src/api/absent.rs', line: 1 }), false);
  assert.throws(
    () => assertSpanResolves(subject.root, { file: 'src/api/login.rs', line: 9001 }),
    /does not resolve/,
  );
  subject.dispose();
});

test('UT-7: a file with zero extractable candidates contributes nothing and does not error', () => {
  const subject = createSyntheticTree(R3_EMPTY_FILES);
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  assert.deepEqual(semantics.candidates, []);
  assert.ok(semantics.families.public_surface.length > 0, 'the file still declares a public surface');
  assert.ok(semantics.coverage.files_parsed >= 1, 'the file was parsed; it simply held no candidate');
  subject.dispose();
});

// --- UT-13: observed is a narrow word ------------------------------------------

test('UT-13: source_static evidence cannot carry a claim about runtime behaviour', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  // The instrument reads syntax only, so every channel that would be needed to
  // observe runtime behaviour is recorded as one this run did not use.
  const unavailable = semantics.unavailable_channels;
  assert.ok(Array.isArray(unavailable) && unavailable.length > 0);
  for (const channel of unavailable) {
    assert.ok(EVIDENCE_MODES.includes(channel.channel), `${channel.channel} is a declared evidence mode`);
    assert.equal(channel.used, false);
    assert.ok(channel.reason.length > 0, `${channel.channel} says why it was not used`);
  }
  assert.ok(
    unavailable.some((channel) => channel.channel === 'runtime_dynamic'),
    'runtime behaviour is not observable here and the ledger says so',
  );
  subject.dispose();
});

// --- UT-17: a state machine declares what it could not follow ------------------

test('UT-17: an unresolved transition is declared in missing rather than dropped', () => {
  const machine = buildStateMachineCandidate({
    carrier: 'src/api/session.rs:Session',
    states_seen: ['Disconnected', 'Connecting', 'Connected'],
    transitions_seen: [
      { from: 'Disconnected', to: 'Connecting', at: 'src/api/session.rs:41' },
      { from: 'Connecting', to: 'Connected', at: 'src/api/session.rs:57' },
    ],
    missing: [
      {
        reason: 'dynamic_callback_target',
        at: 'src/api/session.rs:64',
        detail: 'the transition out of Connected is installed through a boxed callback',
      },
    ],
  });

  assert.deepEqual(machine.states_seen, ['Disconnected', 'Connecting', 'Connected']);
  assert.equal(machine.transitions_seen.length, 2);
  assert.equal(machine.missing.length, 1, 'a silently omitted transition is worse than a declared one');
  assert.equal(machine.classification, CANDIDATE_CLASSIFICATION);
  assert.equal(machine.requires_human_approval, true);
});

test('UT-17: a state machine candidate with nothing missing declares an empty list, not an absent one', () => {
  const machine = buildStateMachineCandidate({
    carrier: 'src/api/session.rs:Session',
    states_seen: ['Idle'],
    transitions_seen: [],
    missing: [],
  });

  assert.deepEqual(machine.missing, [], 'an empty missing list says the analysis followed every transition it saw');
});

// --- the vocabulary is six languages wide --------------------------------------

test('premise 10: the fact vocabulary covers all six target languages, not one', () => {
  const languages = Object.keys(FACT_VOCABULARY).sort();
  assert.deepEqual(languages, ['c_cpp', 'go', 'javascript', 'python', 'rust', 'typescript']);

  for (const language of languages) {
    const vocabulary = FACT_VOCABULARY[language];
    const declared = FACT_KINDS.filter((kind) => (vocabulary[kind] ?? []).length > 0);
    assert.ok(
      declared.length > 0,
      `${language} declares at least one fact kind; a table with no entries is not a vocabulary`,
    );
  }
  assert.equal(RELATION_STRENGTHS.length, 3, 'a relation has one of three declared strengths');
});
