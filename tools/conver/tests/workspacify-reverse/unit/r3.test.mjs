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
  LANGUAGE_STATE_NAME_PATTERN,
  NAME_FILTERS,
  REMOVED_NAME_FILTERS,
  SEMANTIC_FAMILIES,
  TABLE_EXERCISE_CODES,
  VOCABULARY_TABLE_IDS,
  assertCandidateIsSourceFalsifiable,
  assertDecidedFact,
  assertKindPartition,
  assertSpanResolves,
  buildStateMachineCandidate,
  enumerateSourceFacts,
  extractSemantics,
  generateCandidates,
  isDecidedFact,
  vocabularyExerciseFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/semantics.mjs';
import { TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import {
  CANDIDATE_CLASSIFICATION,
  EXTRACTOR_CLASSES,
  PROVENANCE_CLASSES,
  RELATION_STRENGTHS,
} from '../../../.claude/scripts/workspacify-reverse/lib/provenance.mjs';
import { EVIDENCE_MODES, emptyCoverage, validateLimitation } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

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

// ---------------------------------------------------------------------------
// P24-4 — the six vocabularies exercised, and the entries that could not fire
// ---------------------------------------------------------------------------

// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
/**
 * The project root, so each language's representative can be reached by path.
 *
 * Rust's representative is the fixture this file already tests against; the
 * other five are the trees P24-1 declared, reached through the same table every
 * later ticket reads rather than by five more literal paths here.
 */
const PROJECT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The extraction of one representative, ready for the assertions below. */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
function semanticsOverRepresentative(language) {
  const root = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
  return extractSemantics({ root, dependencies: r2GraphFor(root) });
}

/** The fact kinds a language declares: a kind with no node type is not declared. */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
function declaredKindsOf(language) {
  return FACT_KINDS.filter((kind) => (FACT_VOCABULARY[language][kind] ?? []).length > 0).sort();
}

/**
 * The snippets that must make a declared name filter fire.
 *
 * Each is the construct the entry names, written in the language's own form, so
 * an entry that yields nothing over its own snippet is a no-op — a pattern that
 * reads as coverage and covers nothing. The table is deliberately built out of
 * the entries that could not fire before this ticket: the repair is asserted by
 * the entry firing over a file written to satisfy it, not by the pattern's text.
 */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
const NAME_FILTER_PROBES = Object.freeze({
  typescript: Object.freeze({
    error_return: { 'src/a.ts': 'export function f(x: number): number {\n  if (x < 0) {\n    throw new TypeError("neg");\n  }\n  return x;\n}\n' },
    io_read: { 'src/a.ts': 'import fs from "node:fs";\nexport function f(p: string): string {\n  return fs.readFileSync(p, "utf8");\n}\n' },
    io_write: { 'src/a.ts': 'import fs from "node:fs";\nexport function f(p: string): void {\n  fs.writeFileSync(p, "x");\n}\n' },
    assert: { 'src/a.ts': 'import assert from "node:assert";\nexport function f(x: number): void {\n  assert(x > 0);\n}\n' },
  }),
  javascript: Object.freeze({
    error_return: { 'src/a.js': 'export function f(x) {\n  if (x < 0) {\n    throw new RangeError("neg");\n  }\n  return x;\n}\n' },
    io_read: { 'src/a.js': 'import fs from "node:fs";\nexport function f(p) {\n  return fs.readFileSync(p, "utf8");\n}\n' },
    io_write: { 'src/a.js': 'import fs from "node:fs";\nexport function f(p) {\n  fs.writeFileSync(p, "x");\n}\n' },
  }),
  go: Object.freeze({
    error_return: { 'pkg/a.go': 'package a\nimport "fmt"\nfunc f(x int) error {\n\treturn fmt.Errorf("bad %d", x)\n}\n' },
    io_read: { 'pkg/a.go': 'package a\nimport "os"\nfunc f(p string) []byte {\n\tb, _ := os.ReadFile(p)\n\treturn b\n}\n' },
    io_write: { 'pkg/a.go': 'package a\nimport "os"\nfunc f(p string) {\n\tos.WriteFile(p, nil, 0)\n}\n' },
    assert: { 'pkg/a.go': 'package a\nfunc f(t *T, x int) {\n\tif x < 0 {\n\t\tt.Fatal("neg")\n\t}\n}\n' },
    unwrap_expect: { 'pkg/a.go': 'package a\nfunc f(s string) int {\n\treturn MustParse(s)\n}\n' },
  }),
  python: Object.freeze({
    assert: { 'src/a.py': 'def check(x):\n    assert x > 0\n    return x\n' },
    error_return: { 'src/a.py': 'def load(x):\n    raise ValueError("bad")\n' },
    io_read: { 'src/a.py': 'def load(path):\n    return open(path).read()\n' },
    io_write: { 'src/a.py': 'def save(path):\n    open(path, "w")\n' },
    test_expected_exception: { 'tests/test_a.py': 'import unittest\nclass T(unittest.TestCase):\n    def test_x(self):\n        self.assertRaises(ValueError, int, "x")\n' },
  }),
  c_cpp: Object.freeze({
    state_field: { 'src/a.cpp': 'struct Machine {\n  int state;\n};\n' },
    argument_read: { 'src/a.cpp': 'int addone(int n) {\n  return n + 1;\n}\n' },
    public_item: { 'src/a.cpp': 'int addone(int n) {\n  return n + 1;\n}\n' },
    assert: { 'src/a.cpp': '#include <cassert>\nint f(int n) {\n  assert(n > 0);\n  return n;\n}\n' },
  }),
});

/** The fact kinds a snippet produced, with the snippet thrown away after reading. */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
function kindsOver(files) {
  const subject = createSyntheticTree(files);
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });
  subject.dispose();
  return new Set(semantics.facts.map((fact) => fact.kind));
}

/** The words a state field's name must contain, as the text a reader searches for. */
const STATE_WORD_PATTERN_TEXT = 'state|status|phase|mode';

/** The module's own text, so a claim about the declaration is read from it. */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
function semanticsSource() {
  return readFileSync(
    fileURLToPath(new URL('../../../.claude/scripts/workspacify-reverse/lib/semantics.mjs', import.meta.url)),
    'utf8',
  );
}

/**
 * The names each language has that are not the construct a filter may match.
 *
 * A pattern is allowed to miss — a miss is recorded as an unexercised kind and
 * published. A pattern that *matches* one of these reports material that is not
 * there, which is the failure the whole ticket is about: a name from another
 * language, a constructor read as an error return, a test framework's call read
 * as a guard.
 */
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
const FOREIGN_CONSTRUCTS = Object.freeze({
  rust: Object.freeze(['MustCompile', 'assertRaises', 'New', 'Fatal', 'should', 'chai']),
  typescript: Object.freeze(['unwrap', 'unwrap_or', 'expect', 'should', 'chai', 'panic', 'raise', 'assertRaises']),
  javascript: Object.freeze(['unwrap', 'unwrap_or', 'expect', 'should', 'chai', 'panic', 'raise', 'assertRaises']),
  go: Object.freeze(['unwrap', 'expect', 'assert', 'New', 'NewCache', 'NewServer', 'raise', 'assertRaises']),
  python: Object.freeze(['unwrap', 'expect', 'panic', 'Fatal', 'assert_', 'New', 'assertRaises']),
  c_cpp: Object.freeze(['unwrap', 'expect', 'panic', 'assert_', 'New', 'Errorf', 'should']),
});

// --- C001 precondition: both rows are declared --------------------------------

test('C001 precondition: a language is presented with its node vocabulary and its name-filter row', () => {
  for (const language of TARGET_LANGUAGES) {
    assert.ok(FACT_VOCABULARY[language], `${language} declares a node vocabulary row`);
    assert.ok(NAME_FILTERS[language], `${language} declares a name-filter row`);
  }
});

// --- C001 postcondition: five items for six languages -------------------------

test('C001 postcondition: E7-E11 are extracted for each of the six over its representative', () => {
  for (const language of TARGET_LANGUAGES) {
    const semantics = semanticsOverRepresentative(language);

    assert.ok(semantics.facts.length > 0, `${language}: the representative yields facts`);
    for (const fact of semantics.facts) {
      assert.ok(FACT_KINDS.includes(fact.kind), `${language}: ${fact.fact_id} carries a closed kind`);
      assert.ok(SEMANTIC_FAMILIES.includes(fact.family), `${language}: ${fact.fact_id} names a declared family`);
      assert.equal(fact.evidence_mode, 'source_static', `${language}: ${fact.fact_id} says how it was read`);
      assert.equal(
        assertSpanResolves(join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]), fact.source_span),
        true,
        `${language}: ${fact.fact_id} resolves`,
      );
    }

    // E10 is what the run read of a test, and a representative that holds no
    // test reports the kind unexercised rather than reporting zero tests.
    const exercise = semantics.vocabularyExercise[language];
    assert.ok(Array.isArray(exercise.observedKinds), `${language}: the observed kinds are published`);
    assert.ok(Array.isArray(exercise.unexercisedKinds), `${language}: the unexercised kinds are published`);
  }
});

test('C001 postcondition: a declared kind with no record is reported unexercised, with the kind named', () => {
  const semantics = semanticsOverRepresentative('go');
  const exercise = semantics.vocabularyExercise.go;

  assert.ok(
    exercise.unexercisedKinds.includes('dominating_branch'),
    'a kind the representative holds no construct for is named among the unexercised',
  );
  assert.equal(
    exercise.unexercisedKinds.includes('conditional'),
    false,
    'a kind the representative does carry is not reported unexercised',
  );
});

// --- C001 invariant: the two sets are the declaration -------------------------

test('C001 invariant: observed and unexercised partition the declared kinds, for every language', () => {
  for (const language of TARGET_LANGUAGES) {
    const semantics = semanticsOverRepresentative(language);
    const declared = declaredKindsOf(language);
    const { observedKinds, unexercisedKinds } = semantics.vocabularyExercise[language];

    assert.deepEqual(
      [...new Set([...observedKinds, ...unexercisedKinds])].sort(),
      declared,
      `${language}: the two sets are the declaration, nothing more and nothing less`,
    );
    assert.deepEqual(
      observedKinds.filter((kind) => unexercisedKinds.includes(kind)),
      [],
      `${language}: and a kind is in one set, not both`,
    );
  }
});

test('C001 invariant: a kind in neither set is a finding, and the failure names the kind and the language', () => {
  // The declaration is passed in rather than derived, because deriving it is
  // what makes the partition hold by construction — and a check that cannot
  // fail is not a check.
  assert.throws(
    () => assertKindPartition({
      language: 'go',
      declared: ['conditional', 'throw'],
      observed: [],
      unexercised: ['conditional'],
    }),
    /go: declared fact kind throw is in neither the observed nor the unexercised set/,
  );
  assert.equal(
    assertKindPartition({ language: 'go', declared: ['conditional'], observed: ['conditional'], unexercised: [] }),
    true,
  );
});

test('C001 invariant [Boundary]: a representative with no matching construct reports every kind unexercised', () => {
  const subject = createSyntheticTree({ 'src/ping.py': '# a module with no construct of any declared kind\n' });
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  assert.deepEqual(semantics.vocabularyExercise.python.observedKinds, [], 'nothing was observed');
  assert.deepEqual(
    semantics.vocabularyExercise.python.unexercisedKinds,
    declaredKindsOf('python'),
    'and an empty representative is distinguishable from a vocabulary never attempted',
  );
  subject.dispose();
});

// --- C002 precondition --------------------------------------------------------

test('C002 precondition: the entry is declared and the construct it names is one the language has', () => {
  for (const [language, byKind] of Object.entries(NAME_FILTER_PROBES)) {
    for (const kind of Object.keys(byKind)) {
      assert.ok(
        (FACT_VOCABULARY[language][kind] ?? []).length > 0,
        `${language}/${kind} is declared, so the probe tests a live vocabulary entry`,
      );
    }
  }
});

// --- C002 postcondition -------------------------------------------------------

test('C002 postcondition: every entry that could not fire in its language is now either repaired or removed', () => {
  for (const [language, byKind] of Object.entries(NAME_FILTER_PROBES)) {
    for (const [kind, files] of Object.entries(byKind)) {
      assert.ok(
        kindsOver(files).has(kind),
        `${language}/${kind} cannot fire over a file that contains the construct it names`,
      );
    }
  }
});

test('C002 postcondition: a removal is recorded with its language, its entry and its reason', () => {
  const expected = [
    ['typescript', 'unwrap_expect'],
    ['javascript', 'unwrap_expect'],
    ['python', 'unwrap_expect'],
  ];
  for (const [language, entry] of expected) {
    assert.equal(NAME_FILTERS[language][entry], undefined, `${language} carries no ${entry} entry`);
    const removal = REMOVED_NAME_FILTERS.find((row) => row.language === language && row.entry === entry);
    assert.ok(removal !== undefined, `${language}/${entry} is a recorded removal, not a silent absence`);
    assert.equal(typeof removal.reason, 'string');
    assert.ok(removal.reason.length > 40, `${language}/${entry} states why the pattern cannot fire there`);
  }
});

// --- C002 invariant: the three measured defects -------------------------------

test('C002 invariant, defect one: no non-Rust row carries the Rust idiom', () => {
  for (const language of TARGET_LANGUAGES.filter((name) => name !== 'rust')) {
    for (const [entry, pattern] of Object.entries(NAME_FILTERS[language])) {
      for (const probe of ['unwrap', 'unwrap_or', 'unwrap_or_else', 'expect']) {
        assert.equal(
          pattern.test(probe),
          false,
          `${language}/${entry} must not match ${probe}, which is not this language's construct`,
        );
      }
    }
  }
});

test('C002 invariant, defect two: go.error_return matches no constructor name', () => {
  // Every one of these is a Go constructor, and a filter that fired on them
  // would report error returns that are not error returns.
  for (const name of ['New', 'NewCache', 'NewServer', 'NewClient', 'NewReader', 'MustCompile']) {
    assert.equal(NAME_FILTERS.go.error_return.test(name), false, `go.error_return must not match ${name}`);
  }
  assert.equal(NAME_FILTERS.go.error_return.test('Errorf'), true, "and it still matches Go's error constructor");
});

test('C002 invariant, defect three: the state read is one declaration, not four copied literals', () => {
  const rowsCarryingAStateFilter = TARGET_LANGUAGES.filter(
    (language) => NAME_FILTERS[language].state_field !== undefined
      || NAME_FILTERS[language].state_assignment !== undefined,
  );
  assert.deepEqual(
    rowsCarryingAStateFilter,
    [],
    'the state fields are read by node type and the name pattern, not by a duplicated row entry',
  );
  assert.ok(LANGUAGE_STATE_NAME_PATTERN instanceof RegExp, 'the single declaration is exported and named');

  // Counted by splitting rather than by a regex, because the pattern is itself
  // mostly regex metacharacters and a hand-escaped matcher is one more thing
  // that can be wrong about the text it is supposed to be reading.
  const written = semanticsSource().split(STATE_WORD_PATTERN_TEXT).length - 1;
  assert.equal(written, 1, 'the literal is written once, so a fifth language copies a name and not a literal');
  assert.equal(LANGUAGE_STATE_NAME_PATTERN.source, STATE_WORD_PATTERN_TEXT);
});

test('C002 invariant: a failure kind read from a call or a returned expression carries a name filter', () => {
  // A call and a returned expression say what they are only through the name
  // they carry. A file-read and a cache lookup are one node type; a wrapped
  // error and a plain value are one statement. So a kind read from such a node
  // type and left unfiltered does not miss entries — it reports every call and
  // every returning statement in the file, which is a false positive the size
  // of the file. Declaring no node type for it is the honest alternative.
  const NAME_NARROWED_KINDS = Object.freeze(['assert', 'panic', 'unwrap_expect', 'error_return', 'io_read', 'io_write']);
  const SHARED_EXPRESSION_NODE_TYPES = Object.freeze([
    'call_expression', 'call', 'return_statement', 'throw_statement', 'raise_statement',
  ]);

  for (const language of TARGET_LANGUAGES) {
    for (const kind of NAME_NARROWED_KINDS) {
      const nodeTypes = FACT_VOCABULARY[language][kind] ?? [];
      const readFromAnExpression = nodeTypes.some((nodeType) => SHARED_EXPRESSION_NODE_TYPES.includes(nodeType));
      if (!readFromAnExpression) continue;
      assert.ok(
        NAME_FILTERS[language][kind] instanceof RegExp,
        `${language}/${kind} is read from ${nodeTypes.join('/')} and must carry a name filter`,
      );
    }
  }
});

test('C002 invariant: no filter matches a construct its language does not have', () => {
  for (const [language, foreign] of Object.entries(FOREIGN_CONSTRUCTS)) {
    for (const [entry, pattern] of Object.entries(NAME_FILTERS[language])) {
      for (const name of foreign) {
        assert.equal(pattern.test(name), false, `${language}/${entry} must not match ${name}`);
      }
    }
  }
});

// --- C002 boundary ------------------------------------------------------------

test('C002 invariant [Boundary]: an absent entry is not a defect, because absence means every node of the listed types counts', () => {
  // C/C++ declares no panic filter and no unwrap_expect filter: the language
  // carries neither construct, and an entry naming one would read as coverage.
  assert.equal(NAME_FILTERS.c_cpp.panic, undefined);
  assert.equal(NAME_FILTERS.c_cpp.unwrap_expect, undefined);
  assert.deepEqual((FACT_VOCABULARY.c_cpp.panic ?? []).length, 0);
  assert.deepEqual((FACT_VOCABULARY.c_cpp.unwrap_expect ?? []).length, 0);
});

// --- C003 precondition / postcondition / invariant ----------------------------

test('C003 precondition: a run has performed the R3 extraction and the declared tables are known', () => {
  assert.deepEqual([...VOCABULARY_TABLE_IDS].sort(), ['FACT_VOCABULARY', 'NAME_FILTERS']);
  assert.deepEqual(
    Object.keys(TABLE_EXERCISE_CODES).sort(),
    ['exercised', 'unexercised'],
    'the table exercise record has two declared states',
  );
});

test('C003 postcondition: the limitations carry one entry per declared table, each with a code, a scope and an effect', () => {
  const semantics = semanticsOverRepresentative('go');

  const published = semantics.limitations
    .filter((limitation) => Object.values(TABLE_EXERCISE_CODES).includes(limitation.code))
    .map((limitation) => limitation.scope)
    .sort();
  const declared = TARGET_LANGUAGES
    .flatMap((language) => VOCABULARY_TABLE_IDS.map((table) => `${language}/${table}`))
    .sort();

  assert.deepEqual(published, declared, 'every declared table is published, whatever the run found');
  for (const limitation of semantics.limitations) {
    assert.doesNotThrow(() => validateLimitation(limitation), `${limitation.code} names a code, a scope and an effect`);
  }
});

test('C003 invariant: a table the run did not exercise is reported unexercised rather than omitted', () => {
  const subject = createSyntheticTree(R3_FIXTURE_FILES);
  const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });

  const records = semantics.limitations.filter(
    (limitation) => Object.values(TABLE_EXERCISE_CODES).includes(limitation.code),
  );
  assert.equal(
    records.length,
    TARGET_LANGUAGES.length * VOCABULARY_TABLE_IDS.length,
    'the count equals the declaration, so a table cannot vanish from the list',
  );

  const unexercised = records
    .filter((record) => record.code === TABLE_EXERCISE_CODES.unexercised)
    .map((record) => record.scope)
    .sort();
  assert.deepEqual(
    unexercised,
    TARGET_LANGUAGES
      .filter((language) => language !== 'rust')
      .flatMap((language) => VOCABULARY_TABLE_IDS.map((table) => `${language}/${table}`))
      .sort(),
    'the five the population does not hold are named, not dropped',
  );
  subject.dispose();
});

// --- the spec's remaining unit tests -----------------------------------------

test('C002 postcondition: a node type only one language has is declared in that language\'s row, not beside the shared ones', () => {
  // The row is the one place the value exists. A second, module-scope constant
  // holding the same string can only drift from it, and nothing read the one
  // this replaced — which is how a dead declaration passes for a live one.
  assert.deepEqual(FACT_VOCABULARY.rust.state_field, ['field_declaration']);
  assert.equal(
    /^const RUST_FIELD_DECLARATION\b/m.test(semanticsSource()),
    false,
    'the Rust node type has no second declaration at module scope to drift from the row',
  );
});

test('C003 postcondition: a limitation naming no scope or no effect is refused with the existing message', () => {
  // The new entries meet the same contract as the ones already published, and
  // that is what validateLimitation is for: an entry a reader cannot bound or
  // weigh is noise however true it is.
  assert.throws(
    () => validateLimitation({ code: TABLE_EXERCISE_CODES.exercised, scope: '', effect: 'the table was read' }),
    /must name a scope/,
  );
  assert.throws(
    () => validateLimitation({ code: TABLE_EXERCISE_CODES.exercised, scope: 'go/FACT_VOCABULARY', effect: '  ' }),
    /must name the effect/,
  );
});

test('C001 invariant [Error]: a language with no vocabulary row is a finding naming the language', () => {
  // The representative is presented and the table is not. Extracting nothing
  // and reporting an empty result would read as a language with no guards,
  // which is the opposite of the fact.
  assert.throws(
    () => vocabularyExerciseFor('ruby', []),
    /ruby presented a representative and declares no fact vocabulary/,
  );
});

test('C001 postcondition [Boundary]: a test-framework-only TypeScript file contributes to E10 and not to E7', () => {
  const kinds = kindsOver({
    'src/__tests__/model.spec.ts': 'import { test, expect } from "vitest";\ntest("adds", () => {\n  expect(1).toBe(1);\n});\n',
  });

  assert.ok(kinds.has('test_boundary_value'), 'the literal the test asserts on is E10 material');
  assert.equal(kinds.has('assert'), false, 'a test framework\'s expect is not a guard the program carries');
  assert.equal(kinds.has('unwrap_expect'), false, 'and it is not an unwrapping call either');
});

test('C003 invariant, as a property: the table count holds over twenty run outcomes', () => {
  // The count is the invariant, not the value: a run over any subset of the six
  // must publish every declared table, because a table missing from the list
  // reads as a table that was exercised and found empty.
  const MINIMAL_FILE_BY_LANGUAGE = Object.freeze({
    rust: ['src/a.rs', 'pub fn f() {}\n'],
    typescript: ['src/a.ts', 'export function f(): void {}\n'],
    javascript: ['src/a.js', 'export function f() {}\n'],
    go: ['pkg/a.go', 'package a\n\nfunc F() {}\n'],
    python: ['src/a.py', 'def f():\n    pass\n'],
    c_cpp: ['src/a.cpp', 'int f() { return 0; }\n'],
  });

  for (let run = 0; run < 20; run += 1) {
    const present = TARGET_LANGUAGES.filter((language, index) => (run + index) % 3 !== 0);
    const files = Object.fromEntries(present.map((language) => MINIMAL_FILE_BY_LANGUAGE[language]));
    const subject = createSyntheticTree(files);
    const semantics = extractSemantics({ root: subject.root, dependencies: r2GraphFor(subject.root) });
    subject.dispose();

    const records = semantics.limitations.filter(
      (limitation) => Object.values(TABLE_EXERCISE_CODES).includes(limitation.code),
    );
    assert.equal(
      records.length,
      TARGET_LANGUAGES.length * VOCABULARY_TABLE_IDS.length,
      `run ${run} over [${present.join(', ')}] lost a declared table from its record`,
    );
    for (const language of present) {
      const own = records.filter((record) => record.scope === `${language}/FACT_VOCABULARY`);
      assert.deepEqual(own.map((record) => record.code), [TABLE_EXERCISE_CODES.exercised], `${language} was read`);
    }
  }
});

// --- the Rust row is the one the instrument validated -------------------------

test('C001 invariant: the Rust records are unchanged, so the repairs touched the unexercised rows', () => {
  const semantics = extractSemantics({ root: R3_SUBJECT_ROOT, dependencies: r2GraphFor(R3_SUBJECT_ROOT) });

  const kinds = new Set(semantics.facts.map((fact) => fact.kind));
  for (const kind of ['assert', 'unwrap_expect', 'error_return', 'error_variant', 'early_return', 'conditional', 'loop_condition']) {
    assert.ok(kinds.has(kind), `${kind} is still enumerated for Rust`);
  }
  const unwrapping = semantics.facts.filter((fact) => fact.kind === 'unwrap_expect');
  assert.equal(unwrapping.length, 1, 'the fixture carries exactly one unwrapping call, as it did before');
  assert.match(unwrapping[0].text, /expect/);
});
