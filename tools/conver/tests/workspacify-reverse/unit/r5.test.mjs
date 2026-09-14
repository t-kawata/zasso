// @verifies C002
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
// R5 enumerates gaps and contradictions. Discovery and classification are separate
// so each can be tested alone, and a small number of gaps is never read as quality.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GAP_KINDS,
  GAP_KIND_MEANINGS,
  GAPS_CAVEAT,
  ZERO_GAPS_INTERPRETATION,
  findAbsentRed,
  findCircularReasoning,
  findCommentCodeDrift,
  findDeadCode,
  findStubs,
  findUnobservedSurface,
  enumerateGaps,
  classifyGaps,
  buildGapCandidate,
  renderGapsReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/gaps.mjs';
import { createSyntheticTree } from '../helpers/scratch.mjs';

// --- The vocabulary -------------------------------------------------------------

// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
test('C002 postcondition: the gap kinds are exactly the six the contract names', () => {
  assert.deepEqual(
    [...GAP_KINDS].sort(),
    ['absent_red', 'circular_reasoning', 'comment_code_drift', 'dead_code', 'stub', 'unobserved_surface'],
  );
  assert.equal(Object.isFrozen(GAP_KINDS), true);
  for (const kind of GAP_KINDS) {
    assert.equal(typeof GAP_KIND_MEANINGS[kind], 'string', `${kind} needs plain English for a reader`);
    assert.ok(GAP_KIND_MEANINGS[kind].length > 0);
  }
});

// --- Discovery ------------------------------------------------------------------

test('UT-2: findStubs counts every incomplete implementation the design names', () => {
  const { root, dispose } = createSyntheticTree({
    'src/a.rs': [
      'pub fn done() -> u32 { 1 }',
      '',
      '// [::STUB::] P9-9: the guard is not written yet',
      'pub fn guarded() -> u32 { 0 }',
      '',
      '// TODO: handle the empty case',
      'pub fn empty() {}',
      '',
      'pub fn exploding() { unimplemented!() }',
      '',
    ].join('\n'),
  });
  try {
    const gaps = findStubs(root, ['src/a.rs']);

    assert.ok(gaps.length >= 4, `expected at least four incomplete implementations, found ${gaps.length}`);
    assert.ok(gaps.every((gap) => gap.kind === 'stub'));
    for (const gap of gaps) {
      assert.equal(gap.file, 'src/a.rs');
      assert.ok(Number.isInteger(gap.line) && gap.line > 0);
      assert.equal(gap.provenance, 'observed');
      assert.equal(typeof gap.marker, 'string');
      assert.ok(gap.evidence.length > 0);
    }
    const markers = gaps.map((gap) => gap.marker).join(' ');
    assert.match(markers, /\[::STUB::\]/);
    assert.match(markers, /TODO/);
    assert.match(markers, /unimplemented/);
  } finally {
    dispose();
  }
});

test('UT-2: findDeadCode reports a package nothing imports, and says the reading is inferred', () => {
  const dependencies = {
    packages: ['src', 'orphan'],
    edges: [
      {
        from: 'orphan',
        to: 'src',
        kind: 'syntactic_import',
        count: 1,
        locations: [{ file: 'orphan/lib.rs', line: 1, spelling: 'src::api' }],
      },
    ],
  };

  const gaps = findDeadCode(dependencies, ['src', 'orphan']);

  // `orphan` imports `src`, so `src` is referenced and `orphan` is reached by nothing.
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'dead_code');
  assert.equal(gaps[0].file, 'orphan');
  // The syntax layer resolves no names, so this cannot be called observed.
  assert.equal(gaps[0].provenance, 'inferred');
  assert.match(gaps[0].evidence.join(' '), /no inbound/i);
});

test('UT-2: the population is matched by containment, because the graph names directories', () => {
  // The boundary names files and the dependency graph names directories. An
  // equality comparison would put every package outside the population and
  // report no dead code at all, which is a silent zero rather than a finding.
  const dependencies = { packages: ['src', 'orphan'], edges: [] };

  const gaps = findDeadCode(dependencies, ['src/lib.rs', 'src/api/mod.rs', 'orphan/thing.rs']);

  assert.deepEqual(gaps.map((gap) => gap.file), ['orphan', 'src']);
  assert.ok(!gaps.some((gap) => gap.file === 'src/lib.rs'), 'a file is not a package');

  // A package with no file inside the analysed population is not a finding: the
  // analysis never looked at it, so it is unobserved rather than unreferenced.
  assert.ok(!findDeadCode({ packages: ['src', 'absent'], edges: [] }, ['src/lib.rs']).some((gap) => gap.file === 'absent'));
});

test('UT-2: an edge with no observed location is not a reference', () => {
  const dependencies = {
    packages: ['src', 'orphan'],
    edges: [{ from: 'orphan', to: 'src', kind: 'syntactic_import', count: 0, locations: [] }],
  };

  // The edge exists in the graph but was observed nowhere, so it does not make
  // `src` referenced — counting it would report dead code as live.
  const gaps = findDeadCode(dependencies, ['src', 'orphan']);
  assert.deepEqual(gaps.map((gap) => gap.file), ['orphan', 'src']);
});

test('UT-2: findAbsentRed reports a public surface with no test that could fail for it', () => {
  const structure = {
    publicItems: [
      { file: 'src/lib.rs', line: 3, symbol: 'parse', visibility: 'pub' },
      { file: 'src/lib.rs', line: 9, symbol: 'covered', visibility: 'pub' },
    ],
  };

  const gaps = findAbsentRed(structure, ['src/lib.rs', 'tests/only_covered.rs'], {
    root: '/nonexistent',
    readFile: (path) => (path.endsWith('only_covered.rs') ? 'fn t() {\n    covered();\n}\n' : ''),
  });

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'absent_red');
  assert.equal(gaps[0].symbol, 'parse');
  assert.equal(gaps[0].provenance, 'inferred');
  assert.match(gaps[0].evidence.join(' '), /no test file/i);
});

// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
test('UT-2: findAbsentRed matches identifiers whole, so a short symbol is not shadowed by a longer one', () => {
  // A substring test reports `id` as covered because a test says `valid`, and
  // `get` because one says `forget`. Short public names would then be
  // permanently invisible, which is the opposite of this stage's purpose.
  const structure = {
    publicItems: [
      { file: 'src/lib.rs', line: 1, symbol: 'id', visibility: 'pub' },
      { file: 'src/lib.rs', line: 2, symbol: 'get', visibility: 'pub' },
      { file: 'src/lib.rs', line: 3, symbol: 'parse_v2', visibility: 'pub' },
    ],
  };

  const gaps = findAbsentRed(structure, ['tests/t.rs'], {
    root: '/nonexistent',
    readFile: () => 'fn t() { let valid = parse_v2(); /* forgot the getter */ }\n',
  });

  assert.deepEqual(gaps.map((gap) => gap.symbol).sort(), ['get', 'id']);
});

test('UT-2: findStubs reports an empty body the tree can see and not one a string merely spells', () => {
  const { root, dispose } = createSyntheticTree({
    'src/empty.rs': [
      'pub fn done() -> u32 { 1 }',
      'pub fn inline_empty() {}',
      'pub fn spread_over_lines() {',
      '}',
      'pub fn documented() {',
      '    // nothing yet',
      '}',
      '',
    ].join('\n'),
  });
  try {
    const gaps = findStubs(root, ['src/empty.rs']);
    const lines = gaps.map((gap) => gap.line).sort((left, right) => left - right);

    // The body whose braces are on separate lines is found; the one with a
    // statement in it is not.
    assert.deepEqual(lines, [2, 3, 5], 'inline, spread and comment-only bodies are empty; the returning one is not');
    assert.ok(gaps.every((gap) => gap.marker === 'empty-body'));
    assert.ok(gaps.every((gap) => gap.reading === 'syntax_tree'));
    assert.deepEqual(gaps.map((gap) => gap.function_name).sort(), ['documented', 'inline_empty', 'spread_over_lines']);
  } finally {
    dispose();
  }
});

test('UT-2: findStubs keeps a marker in its own locus, so a word in a string is not a marker', () => {
  const { root, dispose } = createSyntheticTree({
    'src/loci.rs': [
      '// TODO: this one is a note the author left',
      'pub fn f() -> u32 {',
      '    let quoted = "TODO: this one is data";',
      '    let commented = 1; // TODO: and this one is a note too',
      '    unimplemented!()',
      '}',
      '',
    ].join('\n'),
  });
  try {
    const gaps = findStubs(root, ['src/loci.rs']);

    const todoLines = gaps.filter((gap) => gap.marker === 'TODO').map((gap) => gap.line);
    assert.deepEqual(todoLines, [1, 4], 'the word inside the string literal is not a marker');
    // A macro is code, so the one in the comment does not count and the real one does.
    const macroLines = gaps.filter((gap) => gap.marker === 'unimplemented!()').map((gap) => gap.line);
    assert.deepEqual(macroLines, [5]);
  } finally {
    dispose();
  }
});

test('UT-2: findStubs says so when it had to read the file as text', () => {
  // A manifest carries no grammar, so the reading is textual and must say so:
  // a word in this reading may be prose rather than a marker.
  const { root, dispose } = createSyntheticTree({
    'Cargo.toml': '[package]\n# TODO: pin the version\nname = "x"\n',
  });
  try {
    const gaps = findStubs(root, ['Cargo.toml']);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].marker, 'TODO');
    assert.equal(gaps[0].reading, 'textual');
    assert.equal(gaps[0].provenance, 'inferred', 'a textual reading is a weaker claim than a tree reading');
  } finally {
    dispose();
  }
});

test('UT-2: findCommentCodeDrift reads comment nodes and whole identifier names', () => {
  const { root, dispose } = createSyntheticTree({
    'src/drift.rs': [
      '/// Callers should mind the naming here.',
      '/// Returns the `tenant_id` for the caller.',
      'pub fn caller() -> u32 { 1 } // tenant_id used to live here',
      '',
    ].join('\n'),
    'src/agrees.rs': [
      '/// Returns the caller id.',
      'pub fn caller_id() -> u32 { 1 }',
      '',
    ].join('\n'),
  });
  try {
    const gaps = findCommentCodeDrift(root, ['src/drift.rs', 'src/agrees.rs']);

    // Prose that is not code-shaped is not a reference, and a name present in the
    // code is not drift. A name that survives only in a trailing inline comment
    // still is: the code no longer has it, and a reading that treated the whole
    // line as code would never find the comment that says so.
    assert.deepEqual(gaps.map((gap) => [gap.file, gap.line]), [['src/drift.rs', 2], ['src/drift.rs', 3]]);
    assert.ok(gaps.every((gap) => gap.reading === 'syntax_tree'));
    for (const gap of gaps) assert.deepEqual(gap.names, ['tenant_id']);
  } finally {
    dispose();
  }
});

test('UT-2: a nested doc comment is read once, not once per node that carries it', () => {
  // Rust nests a `doc_comment` inside the `line_comment` carrying its `///`, so a
  // walk that visited both would report one comment's drift twice under one id.
  const { root, dispose } = createSyntheticTree({
    'src/once.rs': '/// Returns the `tenant_id`.\npub fn caller() -> u32 { 1 }\n',
  });
  try {
    const gaps = findCommentCodeDrift(root, ['src/once.rs']);

    assert.equal(gaps.length, 1);
    assert.deepEqual(gaps.map((gap) => gap.gap_id), [...new Set(gaps.map((gap) => gap.gap_id))]);
  } finally {
    dispose();
  }
});

test('UT-2: findAbsentRed reports a tree with no test suite as gaps rather than raising', () => {
  const structure = { publicItems: [{ file: 'src/lib.rs', line: 1, symbol: 'handle', visibility: 'pub' }] };

  const gaps = findAbsentRed(structure, ['src/lib.rs'], { root: '/nonexistent', readFile: () => '' });

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].kind, 'absent_red');
  assert.equal(gaps[0].test_population, 0, 'a tree with no tests says the population was zero');
});

test('UT-2: findCircularReasoning reports a test written from the design', () => {
  const { root, dispose } = createSyntheticTree({
    'tests/verify_spec_a4ecaf0f.rs': [
      '// @verifies C001',
      '#[test]',
      'fn verifies_the_contract() { assert!(true); }',
      '',
    ].join('\n'),
    'tests/plain.rs': '#[test]\nfn finds_a_bug() {}\n',
  });
  try {
    const gaps = findCircularReasoning(root, ['tests/verify_spec_a4ecaf0f.rs', 'tests/plain.rs']);

    assert.equal(gaps.length, 1, 'only the test derived from the design is circular');
    assert.equal(gaps[0].kind, 'circular_reasoning');
    assert.equal(gaps[0].file, 'tests/verify_spec_a4ecaf0f.rs');
    assert.equal(gaps[0].provenance, 'inferred');
    assert.match(gaps[0].evidence.join(' '), /@verifies|ticket key/i);
  } finally {
    dispose();
  }
});

test('UT-2: findCommentCodeDrift reports a comment naming a symbol the code no longer has', () => {
  const { root, dispose } = createSyntheticTree({
    'src/drift.rs': [
      '/// Returns the resolved `tenant_id` for the caller.',
      'pub fn caller() -> u32 { 1 }',
      '',
    ].join('\n'),
    'src/agrees.rs': [
      '/// Returns the caller identifier.',
      'pub fn caller_id() -> u32 { 1 }',
      '',
    ].join('\n'),
  });
  try {
    const gaps = findCommentCodeDrift(root, ['src/drift.rs', 'src/agrees.rs']);

    assert.equal(gaps.length, 1, 'only the file whose comment names an absent symbol is reported');
    assert.equal(gaps[0].kind, 'comment_code_drift');
    assert.equal(gaps[0].file, 'src/drift.rs');
    assert.equal(gaps[0].line, 1);
    assert.equal(gaps[0].provenance, 'inferred');
    assert.match(gaps[0].evidence.join(' '), /tenant_id/);
  } finally {
    dispose();
  }
});

test('UT-2: findUnobservedSurface never reports an unexamined region as absent', () => {
  const boundary = {
    artefacts: [
      { path: 'src/lib.rs', coverage: 'in_scope' },
      { path: 'docker/Dockerfile', coverage: 'out_of_scope' },
    ],
  };
  const surface = { limitations: [{ code: 'TREE_SITTER_GRAMMAR_ABSENT', scope: '*.go', effect: 'not examined' }] };

  const gaps = findUnobservedSurface(surface, boundary, { unavailable_channels: [] });

  assert.ok(gaps.length >= 2);
  for (const gap of gaps) {
    assert.equal(gap.kind, 'unobserved_surface');
    // The distinction F12 turns on: not examined is not the same as not there.
    assert.doesNotMatch(gap.evidence.join(' '), /\babsent\b|\bdoes not exist\b/i);
    assert.match(gap.evidence.join(' '), /not examined|never observed|out of scope|out_of_scope/i);
  }
  const docker = gaps.find((gap) => gap.file === 'docker/Dockerfile');
  assert.ok(docker, 'the out-of-scope entry is recorded as unobserved rather than dropped');
  assert.equal(docker.provenance, 'unresolved');
});

// --- The composed enumeration ---------------------------------------------------

test('C002 precondition: enumerateGaps refuses a run whose analysis has not completed', () => {
  const { root, dispose } = createSyntheticTree({ 'src/lib.rs': 'pub fn f() {}\n' });
  try {
    assert.throws(
      () => enumerateGaps({ root, paths: ['src/lib.rs'] }),
      /the analysis must have completed/,
    );
  } finally {
    dispose();
  }
});

test('UT-2 and C002 postcondition: a completed analysis enumerates gaps that each carry a classification', () => {
  const { root, dispose } = createSyntheticTree({
    'src/lib.rs': '// TODO: finish this\npub fn handle() {}\n',
  });
  try {
    const source = {
      root,
      paths: ['src/lib.rs'],
      boundary: { artefacts: [{ path: 'src/lib.rs', coverage: 'in_scope' }] },
      structure: { publicItems: [{ file: 'src/lib.rs', line: 2, symbol: 'handle', visibility: 'pub' }] },
      dependencies: { packages: ['src'], edges: [] },
      surface: { limitations: [] },
      ledger: { unavailable_channels: [] },
    };

    const gaps = enumerateGaps(source);
    assert.ok(gaps.length >= 1);

    const classified = classifyGaps(gaps);
    assert.equal(classified.gap_count, gaps.length);
    assert.equal(classified.unclassifiedCount, 0, 'every gap produced here is one of the six kinds');
    for (const gap of classified.gaps) {
      assert.ok(GAP_KINDS.includes(gap.kind), `unclassified kind: ${gap.kind}`);
      assert.equal(typeof gap.file, 'string');
      assert.ok(Number.isInteger(gap.line) && gap.line > 0);
      assert.ok(['observed', 'inferred', 'normative', 'unresolved'].includes(gap.provenance));
      assert.equal(typeof gap.gap_id, 'string');
    }
    assert.deepEqual(
      Object.keys(classified.by_kind).sort(),
      [...new Set(gaps.map((gap) => gap.kind))].sort(),
    );
    assert.equal(classified.caveat, GAPS_CAVEAT);
  } finally {
    dispose();
  }
});

test('UT-9: a tree with no test suite produces gaps rather than an exception', () => {
  const { root, dispose } = createSyntheticTree({ 'src/lib.rs': 'pub fn handle() {}\n' });
  try {
    const gaps = enumerateGaps({
      root,
      paths: ['src/lib.rs'],
      boundary: { artefacts: [{ path: 'src/lib.rs', coverage: 'in_scope' }] },
      structure: { publicItems: [{ file: 'src/lib.rs', line: 1, symbol: 'handle', visibility: 'pub' }] },
      dependencies: { packages: ['src'], edges: [] },
      surface: { limitations: [] },
      ledger: { unavailable_channels: [] },
    });

    assert.ok(gaps.some((gap) => gap.kind === 'absent_red'), 'the untested surface is the gap that matters most');
  } finally {
    dispose();
  }
});

// --- C002 invariant: a small number of gaps is never quality --------------------

test('UT-7: zero gaps is reported as requiring scrutiny, not as a pass', () => {
  const verdict = classifyGaps([]);

  assert.equal(verdict.gap_count, 0);
  assert.equal(verdict.requires_scrutiny, true);
  assert.equal(verdict.interpretation, ZERO_GAPS_INTERPRETATION);
  assert.match(verdict.interpretation, /F1/);

  // There is no field a consumer could read as a pass, and none could be added by accident.
  assert.equal('is_pass' in verdict, false);
  assert.equal('success' in verdict, false);
  assert.equal('score' in verdict, false);

  // A populated list is still not a success: the field is present either way.
  assert.equal(classifyGaps([{ gap_id: 'g1', kind: 'stub', file: 'a.rs', line: 1, provenance: 'observed' }]).requires_scrutiny, true);
});

test('UT-7: a gap outside the vocabulary is recorded as unclassified rather than dropped', () => {
  const verdict = classifyGaps([
    { gap_id: 'g1', kind: 'stub', file: 'a.rs', line: 1, provenance: 'observed' },
    { gap_id: 'g2', kind: 'a_kind_nobody_declared', file: 'b.rs', line: 2, provenance: 'inferred' },
  ]);

  assert.equal(verdict.gap_count, 2, 'the unknown gap is still counted');
  assert.equal(verdict.unclassifiedCount, 1);
  const unknown = verdict.gaps.find((gap) => gap.gap_id === 'g2');
  assert.equal(unknown.kind, 'unclassified');
  assert.equal(unknown.declared_kind, 'a_kind_nobody_declared');
  assert.equal(typeof unknown.unclassified_reason, 'string');
});

// --- The oracle comparison document ---------------------------------------------

test('the r5 candidate names the gap list and states what the comparison cannot see', () => {
  const verdict = classifyGaps([
    { gap_id: 'gap-src_lib.rs-stub-2', kind: 'stub', file: 'src/lib.rs', line: 2, provenance: 'observed' },
  ]);

  const candidate = buildGapCandidate(verdict, { language: 'rust' });

  assert.equal(candidate.stage, 'r5');
  assert.equal(candidate.corpus.language, 'rust');
  assert.deepEqual(candidate.entries.map((entry) => entry.name), ['gap-src_lib.rs-stub-2']);

  // The answer key exposes omission file names, not the omissions inside them, and
  // a comparison that stayed silent about that would read as a complete measurement.
  assert.ok(candidate.unobserved.length > 0);
  for (const entry of candidate.unobserved) {
    assert.equal(typeof entry.region, 'string');
    assert.equal(typeof entry.stoppedAtPhase, 'string');
    assert.equal(typeof entry.reason, 'string');
  }
  assert.match(candidate.unobserved.map((entry) => entry.reason).join(' '), /omission file/i);
});

// --- The Markdown a reader consumes ---------------------------------------------

test('the gap report states the caveat and caps its list rather than printing everything', () => {
  const many = Array.from({ length: 400 }, (_, index) => ({
    gap_id: `gap-${index}`,
    kind: 'stub',
    file: `src/file_${index}.rs`,
    line: 1,
    provenance: 'observed',
    marker: 'TODO',
    evidence: ['a comment marking unfinished work'],
  }));

  const markdown = renderGapsReport(classifyGaps(many), 25);

  assert.match(markdown, /^## Gaps and contradictions/m);
  assert.ok(markdown.includes(GAPS_CAVEAT));
  assert.match(markdown, /375|not printed|withheld/i, 'the report says how many it did not print');
  assert.ok(markdown.split('\n').filter((line) => line.startsWith('| `gap-')).length <= 25);
});

test('the gap report on an empty list carries the F1 reading rather than a clean bill of health', () => {
  const markdown = renderGapsReport(classifyGaps([]));

  assert.ok(markdown.includes(ZERO_GAPS_INTERPRETATION));
  assert.match(markdown, /scrutiny/i);
});
