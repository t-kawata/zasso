// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R0 to R2.5 — the analysis scope, the static skeleton, the dependency
 * hypothesis and the execution surface.
 *
 * The subject of most of these tests is the *instrument's honesty* rather than
 * the accuracy of any extraction: that a scope states its exclusions, that a
 * gap is published as a property of the instrument, that "found nothing" and
 * "could not run" are different records, and that a proposition touching a
 * dynamic mechanism cannot be called `observed` without dynamic evidence.
 * Those are the properties a later session can actually rely on, and they are
 * decidable. Exhaustiveness of the execution surface is not decidable and is
 * deliberately not asserted here (see the ticket's Exceptions).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

import {
  ANALYSIS_MODES,
  ATTEMPT_PHASES,
  ATTEMPT_STATUSES,
  CAPABILITY_MATRIX,
  CAPABILITY_VALUES,
  COVERAGE_FIELDS,
  EVIDENCE_MODES,
  EXCLUSION_RULES,
  EXTRACTION_ITEMS,
  REPORT_LIST_LIMIT,
  TARGET_LANGUAGES,
  assertAdapterResult,
  buildAttemptLedger,
  renderCappedList,
  findCapabilityGaps,
  recordAttempt,
  renderCapabilityMatrixMarkdown,
  validateLimitation,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import {
  ARTEFACT_KINDS,
  COVERAGE_STATES,
  EXTERNAL_TRANSMISSION_NONE,
  AnalysisScopeError,
  analyzeProject,
  classifyArtefacts,
  renderBoundaryReport,
  renderScopeReport,
  resolveScope,
} from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  measureStructure,
  parseSourceFile,
  renderStructureReport,
  syntaxErrorTexts,
} from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import {
  CALL_SITES_ABSENT_REASON,
  DENSITY_MAXIMUM,
  DENSITY_MINIMUM,
  NOT_MEASURED,
  countBoundaryCrossings,
  externalDependenciesIn,
  findPackageCycles,
  measureCohesion,
  measureDependencies,
  measureDependencyDensity,
  renderDependencyReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/dependencies.mjs';
import {
  MECHANISM_KINDS,
  classifyWithDynamicEvidence,
  measureExecutionSurface,
  renderExecutionSurfaceReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/execution-surface.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ANALYSIS_TECH_DOC = join(PROJECT_ROOT, 'docs', 'P22-ANALYSIS-TECH.md');

/**
 * Where this suite's analyses stop.
 *
 * `analyzeProject` defaults to the last declared stage, as the command line
 * always has. A suite whose subject is R0 to R2.5 names its own boundary rather
 * than inheriting a default that moves whenever a stage is added — and it keeps
 * these tests from reading, and failing on, a file a fixture deliberately makes
 * unreadable part-way through.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
const THROUGH_R2_5 = 'r2.5';

/**
 * A miniature Rust crate carrying one artefact of every kind R1 must classify
 * and every dynamic mechanism class R2.5 must enumerate.
 *
 * `src/gone.rs` is a dangling symlink, so the walk meets an entry it cannot
 * stat. It is here because "the walker skipped it" and "the walker recorded
 * that it could not read it" are different reports, and only the second is
 * usable.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function syntheticCrate() {
  return {
    'Cargo.toml': ['[package]', 'name = "synthetic"', 'version = "0.1.0"', '', '[features]', 'ffi = []', ''].join('\n'),
    'README.md': '# Synthetic\n',
    'build.rs': ['fn main() {', '    let out_dir = std::env::var("OUT_DIR").unwrap_or_default();', '    let _ = out_dir;', '}', ''].join('\n'),
    'wrapper.h': '#pragma once\n',
    'src/lib.rs': [
      '//! Synthetic crate root.',
      'pub mod api;',
      'mod empty;',
      '',
      'use crate::api::login;',
      '',
      '/// A public trait: implementations are resolved by the compiler, not here.',
      'pub trait Handler {',
      '    fn handle(&self) -> Result<(), Error>;',
      '}',
      '',
      '#[derive(Debug)]',
      'pub struct Session { pub token: String }',
      '',
      '#[derive(Debug)]',
      'pub enum Error {',
      '    Missing,',
      '    Denied { reason: String },',
      '}',
      '',
      'pub fn connect() -> Result<Session, Error> {',
      '    let notes = include_str!("README.md");',
      '    assert!(!notes.is_empty());',
      '    Ok(Session { token: String::new() })',
      '}',
      '',
      'fn private_helper() {}',
      '',
    ].join('\n'),
    'src/empty.rs': '',
    'src/api/mod.rs': ['pub mod login;', 'pub mod transport;', ''].join('\n'),
    'src/api/login.rs': [
      'use crate::config::Settings;',
      'use crate::Error;',
      '',
      'pub struct Client { inner: Box<dyn crate::Handler> }',
      '',
      'extern "C" {',
      '    fn pjsua_login(user: *const u8) -> i32;',
      '}',
      '',
      'pub fn login(settings: &Settings) -> Result<Client, Error> {',
      '    let host = std::env::var("SIP_HOST").unwrap_or_default();',
      '    let _ = host;',
      '    Ok(Client { inner: Box::new(NoopHandler) })',
      '}',
      '',
      'struct NoopHandler;',
      '',
      'impl crate::Handler for NoopHandler {',
      '    fn handle(&self) -> Result<(), Error> { Ok(()) }',
      '}',
      '',
    ].join('\n'),
    'src/api/transport.rs': ['use crate::config::Settings;', '', 'pub fn dial(_: &Settings) {}', ''].join('\n'),
    'src/config/mod.rs': ['use crate::api::login;', '', 'pub struct Settings { pub host: String }', ''].join('\n'),
    'tests/verify_spec_4b35a676.rs': ['pub fn read_spec() -> u8 { 1 }', ''].join('\n'),
    'tests/verify_feature.rs': ['pub fn shared() -> u8 { 7 }', ''].join('\n'),
    'vendor/pjsip/pjlib.h': '/* vendored third-party source, not this project\'s own */\n',
    'target/debug/artifact.bin': 'build output\n',
  };
}

/** Materialise the synthetic crate with `src/gone.rs` as a dangling symlink. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function syntheticCrateTree() {
  const tree = createSyntheticTree(syntheticCrate(), { prefix: 'wsp-r0r2-' });
  symlinkSync(join(tree.root, 'src', 'does-not-exist.rs'), join(tree.root, 'src', 'gone.rs'));
  return tree;
}

/** A fresh empty directory to publish sidecars into. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function outputDirectory() {
  return createSyntheticTree({ 'placeholder.txt': '' }, { prefix: 'wsp-out-' });
}

// ---------------------------------------------------------------------------
// C001 — the scope is fixed, and the analysis is read-only
// ---------------------------------------------------------------------------

test('C001 precondition — a target root that cannot be read is refused by name', () => {
  const tree = syntheticCrateTree();
  const missing = join(tree.root, 'no-such-project');
  assert.throws(
    () => resolveScope(missing),
    (error) => {
      assert.ok(error instanceof AnalysisScopeError);
      assert.match(error.message, /no-such-project/);
      assert.match(error.message, /cannot be read/);
      return true;
    },
  );
  assert.throws(() => resolveScope(join(tree.root, 'README.md')), /not a directory/);
  tree.dispose();
});

test('C001 postcondition — ANALYSIS-SCOPE.json fixes commit, exclusions, permissions and transmission policy', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  analyzeProject({ root: tree.root, out: out.root, through: 'r0.5' });

  const scope = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-SCOPE.json'), 'utf8'));
  for (const key of ['target_commit', 'exclusion_rules', 'permissions', 'external_transmission']) {
    assert.ok(key in scope, `ANALYSIS-SCOPE.json must fix ${key}`);
  }
  assert.deepEqual(scope.exclusion_rules, [...EXCLUSION_RULES]);
  assert.equal(scope.external_transmission.policy, EXTERNAL_TRANSMISSION_NONE);
  assert.ok(Array.isArray(scope.permissions));
  assert.match(renderScopeReport(scope), /exclusion/i);
  tree.dispose();
  out.dispose();
});

test('C001 invariant — a full run leaves the target byte-identical', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  const before = hashTree(tree.root);
  analyzeProject({ root: tree.root, out: out.root , through: THROUGH_R2_5 });
  assert.deepEqual(hashTree(tree.root), before, 'the analysis must leave every byte as it found it');
  tree.dispose();
  out.dispose();
});

test('C001 invariant — publishing inside the target is refused rather than allowed to dirty it', () => {
  const tree = syntheticCrateTree();
  assert.throws(
    () => analyzeProject({ root: tree.root, out: join(tree.root, 'analysis') , through: THROUGH_R2_5 }),
    /inside the target/,
  );
  assert.equal(existsSync(join(tree.root, 'analysis')), false);
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C002 — three-valued coverage, and out_of_scope is not absence
// ---------------------------------------------------------------------------

test('C002 precondition — a scope that has not been fixed is refused', () => {
  const tree = syntheticCrateTree();
  assert.throws(() => classifyArtefacts({ root: tree.root, scope: null }), /scope has not been fixed/);
  assert.doesNotThrow(() => classifyArtefacts({ root: tree.root, scope: resolveScope(tree.root) }));
  tree.dispose();
});

test('C002 postcondition — every artefact is classified as in_scope, out_of_scope or undetermined', () => {
  const tree = syntheticCrateTree();
  const boundary = classifyArtefacts({ root: tree.root, scope: resolveScope(tree.root) });

  assert.ok(boundary.artefacts.length > 0);
  for (const artefact of boundary.artefacts) {
    assert.ok(COVERAGE_STATES.includes(artefact.coverage), `${artefact.path} carries ${artefact.coverage}`);
    assert.ok(ARTEFACT_KINDS.includes(artefact.kind), `${artefact.path} carries kind ${artefact.kind}`);
  }
  assert.equal(new Set(boundary.artefacts.map((a) => a.path)).size, boundary.artefacts.length);
  tree.dispose();
});

test('C002 invariant — an out-of-scope artefact is recorded as out_of_scope, never as absent', () => {
  const tree = syntheticCrateTree();
  const boundary = classifyArtefacts({ root: tree.root, scope: resolveScope(tree.root) });

  const vendored = boundary.artefacts.filter((a) => a.path.startsWith('vendor/'));
  const buildOutput = boundary.artefacts.filter((a) => a.path.startsWith('target/'));

  assert.ok(vendored.length > 0, 'the vendored tree exists and must appear in the record');
  assert.ok(buildOutput.length > 0, 'build output exists and must appear in the record');
  for (const artefact of [...vendored, ...buildOutput]) {
    assert.equal(artefact.coverage, 'out_of_scope');
    assert.notEqual(artefact.coverage, 'undetermined');
  }

  const report = renderBoundaryReport(boundary);
  assert.match(report, /out_of_scope/);
  assert.match(report, /undetermined/);
  assert.doesNotMatch(report, /does not exist|absent from the project|not present in the project/);
  tree.dispose();
});

test('C002 boundary — an empty scope is reported as empty rather than as a clean result', () => {
  const tree = createSyntheticTree({ 'notes.txt': 'nothing to analyse\n' }, { prefix: 'wsp-r0r2-empty-' });
  const scope = resolveScope(tree.root);
  const boundary = classifyArtefacts({ root: tree.root, scope });
  assert.equal(boundary.inScopeCount, 0);
  assert.match(renderBoundaryReport(boundary), /empty|zero in-scope/i);
  tree.dispose();
});

test('C002 boundary — an undetermined artefact is never merged into out_of_scope', () => {
  const tree = syntheticCrateTree();
  const scope = resolveScope(tree.root);
  // A source-shaped file whose language this instrument cannot classify is
  // undetermined: it is not excluded and it is not claimed either.
  const boundary = classifyArtefacts({ root: tree.root, scope, undeterminedPaths: ['src/empty.rs'] });
  const undetermined = boundary.artefacts.filter((a) => a.path === 'src/empty.rs');
  assert.equal(undetermined.length, 1);
  assert.equal(undetermined[0].coverage, 'undetermined');
  assert.notEqual(undetermined[0].coverage, 'out_of_scope');
  // The counts include it among the undetermined and exclude it from both other
  // states; the fixture holds other undetermined artefacts, so the assertion is
  // about which state carries it and not about how many share the state.
  assert.ok(boundary.counts.undetermined >= 1);
  assert.equal(
    boundary.counts.in_scope + boundary.counts.out_of_scope + boundary.counts.undetermined,
    boundary.artefacts.length,
  );
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C003 — dynamic mechanisms block `observed`
// ---------------------------------------------------------------------------

test('C003 precondition — the execution surface is enumerated before coupling is classified', () => {
  const tree = syntheticCrateTree();
  const bare = measureDependencies({ root: tree.root });
  assert.equal(bare.coupling_claim, 'hypothesis');
  assert.equal(bare.represents_runtime_binding, false);

  const surface = measureExecutionSurface({ root: tree.root });
  assert.ok(Array.isArray(surface.mechanisms));
  assert.ok(surface.mechanisms.length > 0, 'the synthetic crate carries dynamic mechanisms');
  tree.dispose();
});

test('C003 postcondition — a proposition touching a dynamic mechanism is refused observed without dynamic evidence', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });

  const mechanism = surface.mechanisms.find((m) => m.kind === 'compile_time_embedding');
  assert.ok(mechanism, 'the crate embeds a file at compile time');
  assert.ok(mechanism.file.length > 0 && mechanism.line > 0, 'a mechanism is evidence with a location');

  const withoutDynamic = classifyWithDynamicEvidence({
    proposition: { file: mechanism.file, line: mechanism.line, mechanisms: [mechanism.id] },
    evidence: [{ evidence_mode: 'source_static' }],
    surface,
  });
  assert.equal(withoutDynamic.classification, 'inferred');
  assert.notEqual(withoutDynamic.classification, 'observed');
  assert.match(withoutDynamic.reason, /dynamic evidence/);

  const withDynamic = classifyWithDynamicEvidence({
    proposition: { file: mechanism.file, line: mechanism.line, mechanisms: [mechanism.id] },
    evidence: [{ evidence_mode: 'runtime_dynamic' }],
    surface,
  });
  assert.equal(withDynamic.classification, 'observed');
  tree.dispose();
});

test('C003 postcondition — a proposition touching no dynamic mechanism may be observed from source alone', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const verdict = classifyWithDynamicEvidence({
    proposition: { file: 'src/lib.rs', line: 12, mechanisms: [] },
    evidence: [{ evidence_mode: 'source_static' }],
    surface,
  });
  assert.equal(verdict.classification, 'observed');
  tree.dispose();
});

test('C003 invariant — the import graph is explicitly recorded as not representing runtime binding', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const dependencies = measureDependencies({ root: tree.root, surface });

  assert.equal(dependencies.coupling_claim, 'hypothesis');
  assert.equal(dependencies.represents_runtime_binding, false);
  assert.match(dependencies.runtime_binding_caveat, /not.{0,20}runtime binding/i);

  const report = renderDependencyReport(dependencies);
  assert.match(report, /not.{0,20}runtime binding/i);
  assert.match(report, /hypothesis/i);
  tree.dispose();
});

test('C003 evidence — every mechanism is recorded with its file and line', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  for (const mechanism of surface.mechanisms) {
    assert.ok(MECHANISM_KINDS.includes(mechanism.kind), `unknown mechanism kind ${mechanism.kind}`);
    assert.match(mechanism.file, /^[^/].*\.rs$/);
    assert.ok(Number.isInteger(mechanism.line) && mechanism.line > 0, `${mechanism.id} has no line`);
  }
  const report = renderExecutionSurfaceReport(surface);
  assert.match(report, /evidence of presence/i);
  assert.match(report, /not.{0,20}proof of absence/i);
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C004 — the capability matrix is complete and publishes its gaps
// ---------------------------------------------------------------------------

test('C004 precondition — the capability matrix has been recorded', () => {
  assert.equal(TARGET_LANGUAGES.length, 6);
  assert.equal(EXTRACTION_ITEMS.length, 16);
  assert.equal(Object.keys(CAPABILITY_MATRIX).length, TARGET_LANGUAGES.length);
  assert.deepEqual(EXTRACTION_ITEMS, Array.from({ length: 16 }, (_, index) => `E${index + 1}`));
});

test('C004 postcondition — every language and every extraction item carries one of the five permitted values', () => {
  assert.deepEqual(CAPABILITY_VALUES, ['success', 'partial', 'not_attempted', 'failed', 'unsupported_in_principle']);
  for (const language of TARGET_LANGUAGES) {
    assert.deepEqual(
      Object.keys(CAPABILITY_MATRIX[language]).sort(),
      [...EXTRACTION_ITEMS].sort(),
      `${language} must carry one cell per extraction item`,
    );
    for (const item of EXTRACTION_ITEMS) {
      assert.ok(
        CAPABILITY_VALUES.includes(CAPABILITY_MATRIX[language][item]),
        `${language}/${item} carries ${CAPABILITY_MATRIX[language][item]}`,
      );
    }
  }
});

test('C004 invariant — a gap is a limitation of the instrument, never an absence of the thing sought', () => {
  const gaps = findCapabilityGaps(CAPABILITY_MATRIX);
  assert.ok(gaps.length > 0, 'the matrix must be able to say a cell is a gap');
  for (const gap of gaps) {
    assert.equal(gap.readsAs, 'instrument_limitation');
    assert.notEqual(gap.readsAs, 'absence_of_subject');
    assert.ok(TARGET_LANGUAGES.includes(gap.language));
    assert.ok(EXTRACTION_ITEMS.includes(gap.item));
  }
});

test('C004 invariant — the recorded decision document carries the matrix and the permitted values verbatim', () => {
  assert.ok(existsSync(ANALYSIS_TECH_DOC), 'docs/P22-ANALYSIS-TECH.md is the recorded decision');
  const document = readFileSync(ANALYSIS_TECH_DOC, 'utf8');
  assert.ok(
    document.includes(renderCapabilityMatrixMarkdown()),
    'the document must embed the rendered matrix so code and prose cannot drift',
  );
  for (const value of CAPABILITY_VALUES) {
    assert.ok(document.includes(value), `the decision must name the value ${value}`);
  }
  for (const language of TARGET_LANGUAGES) {
    assert.ok(document.includes(language), `the decision must name the language ${language}`);
  }
});

// ---------------------------------------------------------------------------
// C005 — the attempt ledger separates "found nothing" from "could not run"
// ---------------------------------------------------------------------------

test('C005 precondition — an attempt is made against a target and a configuration', () => {
  assert.throws(() => recordAttempt({}), /target/);
  assert.throws(() => recordAttempt({ target: 'src/lib.rs' }), /configuration/);
  const row = recordAttempt({ target: 'src/lib.rs', configuration: 'cargo-default', tool: 'tree-sitter-rust' });
  assert.equal(row.target, 'src/lib.rs');
  assert.equal(row.configuration, 'cargo-default');
  assert.ok(ATTEMPT_PHASES.includes(row.phase));
  assert.ok(ATTEMPT_STATUSES.includes(row.status));
});

test('C005 postcondition — the attempt is recorded with phase, status, diagnostics, extracted count and reason', () => {
  const row = recordAttempt({
    target: 'src/broken.rs',
    configuration: 'cargo-default',
    tool: 'tree-sitter-rust',
    outcome: {
      phase: 'parse',
      status: 'failed',
      diagnostics: [{ severity: 'error', message: 'unexpected token' }],
      extractedCount: 0,
      reason: 'parser_error',
    },
  });
  for (const key of ['phase', 'status', 'diagnostics', 'extracted_count', 'reason']) {
    assert.ok(key in row, `an attempt row must carry ${key}`);
  }
  assert.equal(row.extracted_count, 0);
  assert.equal(row.diagnostics.length, 1);
});

test('C005 invariant — an attempt that extracted nothing is distinguishable from an attempt that could not run', () => {
  const foundNothing = recordAttempt({
    target: 'src/lib.rs', configuration: 'cargo-default', tool: 'tree-sitter-rust',
    outcome: {
      phase: 'parse',
      status: 'success',
      diagnostics: [],
      extractedCount: 0,
      reason: null,
    },
  });
  const couldNotRun = recordAttempt({
    target: 'src/broken.rs', configuration: 'cargo-default', tool: 'tree-sitter-rust',
    outcome: {
      phase: 'parse',
      status: 'failed',
      diagnostics: [{ severity: 'error' }],
      extractedCount: 0,
      reason: 'parser_error',
    },
  });

  assert.notDeepEqual(foundNothing, couldNotRun);
  assert.equal(foundNothing.status, 'success');
  assert.equal(foundNothing.reason, null);
  assert.equal(couldNotRun.status, 'failed');
  assert.equal(couldNotRun.reason, 'parser_error');

  const ledger = buildAttemptLedger([foundNothing, couldNotRun]);
  assert.equal(ledger.rows.length, 2);
  assert.equal(ledger.extractedNothingCount, 1);
  assert.equal(ledger.couldNotRunCount, 1);
  // The two facts are reported in separate fields. Their counts may coincide —
  // one of each is exactly that case — so what has to hold is that a reader
  // cannot collapse them into a single number, not that the numbers differ.
  assert.deepEqual(Object.keys(ledger).sort(), ['couldNotRunCount', 'extractedNothingCount', 'rows']);
});

test('C005 invariant — the run records a real "found nothing" row beside a real "could not run" row', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  analyzeProject({ root: tree.root, out: out.root , through: THROUGH_R2_5 });

  const ledger = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-ATTEMPTS.json'), 'utf8'));
  const empty = ledger.rows.find((row) => row.target === 'src/empty.rs');
  const unreachable = ledger.rows.find((row) => row.target === 'src/gone.rs');

  assert.ok(empty, 'the empty source file must have been attempted');
  assert.equal(empty.status, 'success');
  assert.equal(empty.extracted_count, 0);
  assert.equal(empty.reason, null);

  assert.ok(unreachable, 'the unreachable entry must be recorded, not silently skipped');
  assert.notEqual(unreachable.status, 'success');
  assert.ok(unreachable.reason.length > 0);

  assert.notDeepEqual(empty, unreachable);
  tree.dispose();
  out.dispose();
});

test('C005 invariant — an adapter that could not run is visible in the ledger, not only in the absence of output', () => {
  const tree = syntheticCrateTree();
  const withoutGrammar = measureStructure({ root: tree.root, grammar: null });

  assert.ok(withoutGrammar.attempts.length > 0);
  const rows = withoutGrammar.attempts.filter((row) => row.target.endsWith('.rs'));
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.status, 'failed');
    assert.equal(row.reason, 'grammar_unavailable');
    assert.equal(row.extracted_count, 0);
  }
  assert.notEqual(withoutGrammar.analysis_mode, 'configured_semantic');
  assert.ok(withoutGrammar.limitations.some((limitation) => limitation.code === 'TREE_SITTER_GRAMMAR_ABSENT'));
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C006 — the adapter output contract
// ---------------------------------------------------------------------------

test('C006 precondition — every adapter emits a result carrying the three-part contract', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const results = [
    measureStructure({ root: tree.root }),
    measureDependencies({ root: tree.root, surface }),
    surface,
  ];
  assert.equal(results.length, 3);
  for (const result of results) assertAdapterResult(result);
  tree.dispose();
});

test('C006 postcondition — the result carries an analysis mode, a coverage block and a list of limitations', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  for (const result of [measureStructure({ root: tree.root }), measureDependencies({ root: tree.root, surface }), surface]) {
    assert.ok(ANALYSIS_MODES.includes(result.analysis_mode), `mode ${result.analysis_mode}`);
    for (const field of COVERAGE_FIELDS) {
      assert.equal(typeof result.coverage[field], 'number', `coverage.${field}`);
    }
    assert.ok(Array.isArray(result.limitations));
  }
  assert.throws(() => assertAdapterResult({ coverage: {}, limitations: [] }), /analysis_mode/);
  assert.throws(() => assertAdapterResult({ analysis_mode: 'syntax_only', limitations: [] }), /coverage/);
  // The limitations check is only reachable once the coverage block is valid:
  // an adapter missing both is refused for the first thing it is missing.
  const validCoverage = Object.fromEntries(COVERAGE_FIELDS.map((field) => [field, 0]));
  assert.throws(() => assertAdapterResult({ analysis_mode: 'syntax_only', coverage: validCoverage }), /limitations/);
  tree.dispose();
});

test('C006 invariant — a limitation names the code, the scope and the effect it has on the conclusion', () => {
  assert.throws(() => validateLimitation({ code: '', scope: 'src/**', effect: 'x' }), /code/);
  assert.throws(() => validateLimitation({ code: 'X', scope: '', effect: 'x' }), /scope/);
  assert.throws(() => validateLimitation({ code: 'X', scope: 'src/**', effect: '' }), /effect/);
  assert.doesNotThrow(() => validateLimitation({
    code: 'TREE_SITTER_GRAMMAR_ABSENT',
    scope: 'src/**/*.rs',
    effect: 'no syntax extraction was attempted for this language',
  }));

  const degraded = measureStructure({ root: syntheticCrateTree().root, grammar: null });
  assert.ok(degraded.limitations.length > 0);
  for (const limitation of degraded.limitations) validateLimitation(limitation);
  assert.notEqual(degraded.analysis_mode, 'configured_semantic');
});

test('C006 invariant — the coverage block counts files discovered, parsed and badly parsed', () => {
  const tree = syntheticCrateTree();
  const structure = measureStructure({ root: tree.root });
  assert.ok(structure.coverage.files_discovered > 0);
  assert.ok(structure.coverage.files_parsed <= structure.coverage.files_discovered);
  assert.ok(structure.coverage.files_with_error_nodes >= 0);
  assert.ok(structure.coverage.files_semantically_resolved <= structure.coverage.files_parsed);
  tree.dispose();
});

// ---------------------------------------------------------------------------
// UT — the acceptance criteria and the invariants
// ---------------------------------------------------------------------------

test('UT-1 resolveScope records a target commit that is honest about not being its own repository', () => {
  const tree = syntheticCrateTree();
  const scope = resolveScope(tree.root);
  assert.equal(scope.target_commit.is_own_repository, false);
  assert.equal(scope.target_commit.commit, null);
  assert.match(scope.target_commit.reason, /not.{0,30}(git|repository)/i);
  assert.ok(scope.target_commit.root.endsWith(tree.root.split('/').pop()));
  tree.dispose();
});

test('UT-2 source files are in scope and dependency directories never are', () => {
  const tree = syntheticCrateTree();
  const boundary = classifyArtefacts({ root: tree.root, scope: resolveScope(tree.root) });
  const byPath = new Map(boundary.artefacts.map((artefact) => [artefact.path, artefact]));

  assert.equal(byPath.get('src/lib.rs').coverage, 'in_scope');
  assert.equal(byPath.get('src/lib.rs').kind, 'handwritten');
  assert.equal(byPath.get('vendor/pjsip/pjlib.h').coverage, 'out_of_scope');
  assert.equal(byPath.get('target/debug/artifact.bin').coverage, 'out_of_scope');
  assert.equal(byPath.get('Cargo.toml').kind, 'config');
  tree.dispose();
});

test('UT-3 measureStructure extracts packages, public items, types and error types with file:line', () => {
  const tree = syntheticCrateTree();
  const structure = measureStructure({ root: tree.root });

  assert.ok(structure.packages.some((pkg) => pkg.directory === 'src/api'));
  const names = structure.publicItems.map((item) => item.symbol);
  assert.ok(names.includes('connect'), 'a public function is public surface');
  assert.ok(names.includes('Session'), 'a public struct is public surface');
  assert.ok(names.includes('Handler'), 'a public trait is public surface');
  assert.ok(!names.includes('private_helper'), 'a private function is not public surface');

  assert.ok(structure.types.some((type) => type.symbol === 'Session' && type.typeKind === 'struct'));
  assert.ok(structure.types.some((type) => type.symbol === 'Error' && type.typeKind === 'enum'));
  assert.ok(structure.errorTypes.some((error) => error.symbol === 'Error'));

  for (const item of [...structure.publicItems, ...structure.types, ...structure.errorTypes]) {
    assert.match(item.file, /\.rs$/);
    assert.ok(Number.isInteger(item.line) && item.line > 0, `${item.symbol} has no file:line`);
  }
  assert.match(renderStructureReport(structure), /file:line|:1/);
  tree.dispose();
});

test('UT-4 measureExecutionSurface lists dynamic mechanisms with file:line', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const kinds = new Set(surface.mechanisms.map((mechanism) => mechanism.kind));

  assert.ok(kinds.has('compile_time_embedding'), 'include_str! embeds a file at compile time');
  assert.ok(kinds.has('dynamic_dispatch'), 'Box<dyn Trait> resolves at runtime');
  assert.ok(kinds.has('ffi'), 'extern "C" crosses the type system');
  assert.ok(kinds.has('config_driven'), 'std::env::var reads the environment');
  assert.ok(kinds.has('code_generation'), 'build.rs generates code');

  for (const mechanism of surface.mechanisms) {
    assert.match(mechanism.file, /\.rs$/);
    assert.ok(mechanism.line > 0, `${mechanism.id} is evidence and needs a location`);
    assert.ok(mechanism.spelling.length > 0);
  }
  tree.dispose();
});

test('UT-5 a missing target root produces a descriptive error naming the path', () => {
  const tree = syntheticCrateTree();
  const missing = join(tree.root, 'absent');
  assert.throws(() => resolveScope(missing), (error) => {
    assert.match(error.message, /absent/);
    assert.match(error.message, /cannot be read/);
    return true;
  });
  tree.dispose();
});

test('UT-6 an unreadable entry is recorded rather than skipped silently', () => {
  const tree = syntheticCrateTree();
  const boundary = classifyArtefacts({ root: tree.root, scope: resolveScope(tree.root) });
  const gone = boundary.artefacts.find((artefact) => artefact.path === 'src/gone.rs');
  assert.ok(gone, 'the unreachable entry must appear in the record');
  assert.ok(['unreadable', 'undetermined'].includes(gone.readStatus), `read status ${gone.readStatus}`);
  assert.match(renderBoundaryReport(boundary), /gone\.rs/);
  tree.dispose();
});

test('UT-7 a proposition touching a dynamic mechanism is demoted when no dynamic evidence exists', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const verdict = classifyWithDynamicEvidence({
    proposition: { file: 'src/api/login.rs', line: 5, mechanisms: [surface.mechanisms[0].id] },
    evidence: [{ evidence_mode: 'source_static' }, { evidence_mode: EVIDENCE_MODES[0] }],
    surface,
  });
  assert.notEqual(verdict.classification, 'observed');
  assert.ok(['inferred', 'unresolved'].includes(verdict.classification));
  tree.dispose();
});

test('UT-8 an empty scope is reported as empty, not as a clean-looking empty report', () => {
  const tree = createSyntheticTree({ 'README.md': '# nothing\n' }, { prefix: 'wsp-r0r2-empty2-' });
  const out = outputDirectory();
  analyzeProject({ root: tree.root, out: out.root , through: THROUGH_R2_5 });
  const boundary = JSON.parse(readFileSync(join(out.root, 'SCOPE-BOUNDARY.json'), 'utf8'));
  assert.equal(boundary.inScopeCount, 0);
  assert.equal(boundary.isEmpty, true);
  assert.match(renderBoundaryReport(boundary), /empty|zero in-scope/i);
  tree.dispose();
  out.dispose();
});

test('UT-9 a root holding a single analysable file is analysable', () => {
  const tree = createSyntheticTree({
    'src/only.rs': 'pub fn only() -> u8 { 1 }\n',
  }, { prefix: 'wsp-r0r2-single-' });
  const structure = measureStructure({ root: tree.root });
  assert.equal(structure.coverage.files_discovered, 1);
  assert.equal(structure.coverage.files_parsed, 1);
  assert.ok(structure.publicItems.some((item) => item.symbol === 'only'));
  tree.dispose();
});

test('UT-10 an undetermined artefact is never merged into out_of_scope', () => {
  const tree = syntheticCrateTree();
  const boundary = classifyArtefacts({
    root: tree.root,
    scope: resolveScope(tree.root),
    undeterminedPaths: ['src/empty.rs'],
  });
  const empty = boundary.artefacts.find((artefact) => artefact.path === 'src/empty.rs');
  assert.equal(empty.coverage, 'undetermined');
  assert.notEqual(empty.coverage, 'out_of_scope');
  // The three states partition the record: every artefact is in exactly one, so
  // the counts must account for all of them and none may be merged away.
  assert.equal(
    boundary.counts.in_scope + boundary.counts.out_of_scope + boundary.counts.undetermined,
    boundary.artefacts.length,
  );
  assert.ok(boundary.counts.undetermined > 0);
  tree.dispose();
});

test('UT-11 the target tree is byte-identical after a full R0-R2.5 run', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  const before = hashTree(tree.root);
  analyzeProject({ root: tree.root, out: out.root, through: 'r2.5' });
  assert.deepEqual(hashTree(tree.root), before);
  tree.dispose();
  out.dispose();
});

test('UT-12 the import graph is never presented as runtime binding', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  analyzeProject({ root: tree.root, out: out.root , through: THROUGH_R2_5 });
  const dependencies = JSON.parse(readFileSync(join(out.root, 'DEPENDENCIES.json'), 'utf8'));
  assert.equal(dependencies.represents_runtime_binding, false);
  assert.equal(dependencies.coupling_claim, 'hypothesis');
  assert.ok(dependencies.runtime_binding_caveat.length > 0);
  tree.dispose();
  out.dispose();
});

test('UT-13 re-running with the same input yields identical output', () => {
  const tree = syntheticCrateTree();
  const first = outputDirectory();
  const second = outputDirectory();
  analyzeProject({ root: tree.root, out: first.root , through: THROUGH_R2_5 });
  analyzeProject({ root: tree.root, out: second.root , through: THROUGH_R2_5 });
  for (const name of ['ANALYSIS-SCOPE.json', 'SCOPE-BOUNDARY.json', 'STRUCTURE.json', 'DEPENDENCIES.json', 'EXECUTION-SURFACE.json', 'ANALYSIS-ATTEMPTS.json']) {
    assert.equal(
      readFileSync(join(first.root, name), 'utf8'),
      readFileSync(join(second.root, name), 'utf8'),
      `${name} must be a deterministic function of its input`,
    );
  }
  tree.dispose();
  first.dispose();
  second.dispose();
});

test('UT-14 the capability matrix is complete — asserted by counting keys, not by reading prose', () => {
  for (const language of TARGET_LANGUAGES) {
    const cells = Object.entries(CAPABILITY_MATRIX[language]);
    assert.equal(cells.length, EXTRACTION_ITEMS.length);
    for (const [, value] of cells) assert.ok(CAPABILITY_VALUES.includes(value));
  }
  const total = TARGET_LANGUAGES.reduce((sum, language) => sum + Object.keys(CAPABILITY_MATRIX[language]).length, 0);
  assert.equal(total, TARGET_LANGUAGES.length * EXTRACTION_ITEMS.length);
});

test('UT-15 found-nothing and failed-to-parse produce different ledger rows field by field', () => {
  const foundNothing = recordAttempt({
    target: 'a.rs', configuration: 'c', tool: 't',
    outcome: {
      phase: 'parse',
      status: 'success',
      diagnostics: [],
      extractedCount: 0,
      reason: null,
    },
  });
  const couldNotRun = recordAttempt({
    target: 'a.rs', configuration: 'c', tool: 't',
    outcome: {
      phase: 'parse',
      status: 'failed',
      diagnostics: [{ severity: 'error' }],
      extractedCount: 0,
      reason: 'parser_error',
    },
  });
  const differing = Object.keys(foundNothing).filter((key) => foundNothing[key] !== couldNotRun[key] && key !== 'target');
  assert.deepEqual(differing.filter((key) => ['status', 'reason', 'diagnostics'].includes(key)).sort(), ['diagnostics', 'reason', 'status']);
});

test('UT-16 an adapter returning a bare extraction list fails the contract assertion', () => {
  assert.throws(() => assertAdapterResult([{ kind: 'E2' }]), /analysis_mode/);
  assert.throws(() => assertAdapterResult({ analysis_mode: 'syntax_only', coverage: {}, limitations: [] }), /coverage block/);
  assert.throws(() => assertAdapterResult({ analysis_mode: 'syntax_only', coverage: new Proxy({}, { get: () => 0 }) }), /limitations/);
});

test('UT-17 a limitation that names no code, scope or effect fails validation', () => {
  assert.throws(() => validateLimitation({ code: '  ', scope: 'src/**', effect: 'x' }), /code/);
  assert.throws(() => validateLimitation({ code: 'X', scope: null, effect: 'x' }), /scope/);
  assert.throws(() => validateLimitation({ code: 'X', scope: 'src/**', effect: undefined }), /effect/);
});

test('UT — the analyze run records which stages ran and refuses a stage it does not know', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  const partial = analyzeProject({ root: tree.root, out: out.root, through: 'r1' });
  assert.deepEqual(partial.stagesRun, ['r0', 'r0.5', 'r1']);
  assert.equal(existsSync(join(out.root, 'DEPENDENCIES.json')), false);
  assert.equal(existsSync(join(out.root, 'EXECUTION-SURFACE.json')), false);

  assert.throws(() => analyzeProject({ root: tree.root, out: out.root, through: 'r9' }), /r9/);
  assert.throws(() => analyzeProject({ root: tree.root, out: out.root, through: 'R1' }), /R1/);
  tree.dispose();
  out.dispose();
});

test('UT — the run report is Markdown written for a reader, and states what it did not measure', () => {
  const tree = syntheticCrateTree();
  const out = outputDirectory();
  analyzeProject({ root: tree.root, out: out.root , through: THROUGH_R2_5 });
  const report = readFileSync(join(out.root, 'R0-R2-REPORT.md'), 'utf8');
  assert.match(report, /^# /m);
  assert.match(report, /analysis mode|analysis_mode/i);
  assert.match(report, /limitation/i);
  assert.match(report, /evidence of presence/i);
  tree.dispose();
  out.dispose();
});

// ---------------------------------------------------------------------------
// The measurements behind the reports
// ---------------------------------------------------------------------------

test('UT — a mutually reachable pair is reported as one cycle, and an acyclic graph as none', () => {
  const edges = [
    { from: 'src/api', to: 'src/config' },
    { from: 'src/config', to: 'src/api' },
    { from: 'src/api', to: 'src/state' },
    { from: 'src/state', to: 'src/state' },
  ];
  const cycles = findPackageCycles(edges, ['src/api', 'src/config', 'src/state', 'src/lonely']);

  assert.deepEqual(cycles, [['src/api', 'src/config'], ['src/state']]);
  // A one-way edge is not a cycle, and a package nothing links to is not one
  // either: reporting it would fill the list with packages that merely exist.
  assert.deepEqual(findPackageCycles([{ from: 'a', to: 'b' }], ['a', 'b']), []);
});

test('UT — the dependency report never renders a cycle as a path', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const dependencies = measureDependencies({ root: tree.root, surface });
  assert.ok(dependencies.cycles.length > 0, 'the fixture has a cycle for the report to describe');

  const report = renderDependencyReport(dependencies);
  assert.match(report, /not\*\* a path|is \*\*not\*\* a path/);
  assert.match(report, /mutually reachable/);
  tree.dispose();
});

test('UT — external dependencies are read from the manifest, and an unreadable one says so', () => {
  const tree = createSyntheticTree({
    'Cargo.toml': [
      '[package]',
      'name = "synthetic"',
      '',
      '[dependencies]',
      'serde = { version = "1", features = ["derive"] }',
      'tokio = "1.0"',
      '',
      '[dev-dependencies]',
      'criterion = "0.5"',
      '',
      '[features]',
      'ffi = []',
      '',
    ].join('\n'),
  }, { prefix: 'wsp-r0r2-manifest-' });

  const read = externalDependenciesIn(tree.root, 'Cargo.toml');
  assert.equal(read.reason, null);
  assert.deepEqual(read.dependencies.map((entry) => entry.name), ['criterion', 'serde', 'tokio']);
  assert.deepEqual(read.dependencies.find((entry) => entry.name === 'serde').requirement, '{ version = "1", features = ["derive"] }');
  assert.ok(!read.dependencies.some((entry) => entry.name === 'ffi'), 'a feature is not a dependency');

  const missing = externalDependenciesIn(tree.root, 'absent.toml');
  assert.ok(missing.dependencies.length === 0);
  assert.match(missing.reason, /could not be read/);
  tree.dispose();
});

test('UT — a capped list states the cap rather than truncating in silence', () => {
  const items = Array.from({ length: REPORT_LIST_LIMIT + 5 }, (_, index) => `item-${index}`);
  const rendered = renderCappedList(items, (item) => `- ${item}`);

  assert.equal(rendered.length, REPORT_LIST_LIMIT + 1);
  assert.match(rendered[rendered.length - 1], /5 more/);
  assert.match(rendered[rendered.length - 1], /recorded in the JSON/);
  assert.deepEqual(renderCappedList(items.slice(0, 3), (item) => `- ${item}`), ['- item-0', '- item-1', '- item-2']);
});

test('UT — the construct a grammar rejected is named, not summarised as an error', () => {
  const tree = createSyntheticTree({
    // `&raw` is Rust 2024 raw-reference syntax the pinned grammar does not accept,
    // so this file exercises the recovery path with a construct the instrument
    // must name rather than summarise.
    'src/broken.rs': 'pub fn broken() -> &raw const u8 { 1 }\n',
  }, { prefix: 'wsp-r0r2-broken-' });

  const parsed = parseSourceFile(tree.root, 'src/broken.rs');
  assert.equal(parsed.ok, true, 'tree-sitter recovers rather than failing');
  assert.equal(parsed.errorNodes, true);
  assert.ok(syntaxErrorTexts(parsed.tree).length > 0);
  for (const construct of syntaxErrorTexts(parsed.tree)) assert.ok(construct.length > 0);

  const structure = measureStructure({ root: tree.root });
  assert.ok(structure.limitations.some((limitation) => limitation.code === 'SOURCE_UNREADABLE')
    || structure.attempts.some((attempt) => attempt.status === 'partial'));
  const partial = structure.attempts.find((attempt) => attempt.target === 'src/broken.rs');
  assert.equal(partial.status, 'partial');
  assert.ok(partial.diagnostics.length > 0, 'a recovered parse carries the construct it recovered near');
  tree.dispose();
});

// ---------------------------------------------------------------------------
// P23-2 — the partition material: cohesion, dependency density and
// boundary-crossing call counts
// ---------------------------------------------------------------------------

// @verifies C001
// @verifies C002
// @verifies C003
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
/**
 * Two packages and four file-level edges, with the exact counts they must
 * produce.
 *
 * `src/a` is coupled to itself twice and across its boundary twice; `src/b` is
 * coupled only across its boundary. The fixture is a literal rather than a tree
 * on disk because these functions read no tree: handing them one would hide
 * whether the numbers came from the edge set they were given.
 */
const TWO_PACKAGE_NAMES = ['src/a', 'src/b'];
const TWO_PACKAGE_RECORDS = [
  { from: 'src/a', to: 'src/a', file: 'src/a/a1.rs', line: 3, spelling: 'crate::a::a2' },
  { from: 'src/a', to: 'src/a', file: 'src/a/a2.rs', line: 4, spelling: 'crate::a::a1' },
  { from: 'src/a', to: 'src/b', file: 'src/a/a1.rs', line: 5, spelling: 'crate::b::b1' },
  { from: 'src/b', to: 'src/a', file: 'src/b/b1.rs', line: 2, spelling: 'crate::a::a1' },
];

/** The crossings of the two-package fixture, at the granularity R2 publishes. */
const TWO_PACKAGE_EDGES = [
  {
    from: 'src/a',
    to: 'src/b',
    kind: 'syntactic_import',
    locations: [{ file: 'src/a/a1.rs', line: 5, spelling: 'crate::b::b1' }],
    count: 1,
  },
  {
    from: 'src/b',
    to: 'src/a',
    kind: 'syntactic_import',
    locations: [{ file: 'src/b/b1.rs', line: 2, spelling: 'crate::a::a1' }],
    count: 1,
  },
];

/** Three packages, every one of their six ordered pairs carrying an edge. */
const THREE_PACKAGE_NAMES = ['src/a', 'src/b', 'src/c'];
const EVERY_ORDERED_PAIR_EDGES = [
  ['src/a', 'src/b'], ['src/b', 'src/a'],
  ['src/a', 'src/c'], ['src/c', 'src/a'],
  ['src/b', 'src/c'], ['src/c', 'src/b'],
].map(([from, to]) => ({
  from,
  to,
  kind: 'syntactic_import',
  locations: [{ file: `${from}/mod.rs`, line: 1, spelling: `crate::${to.split('/')[1]}::item` }],
  count: 1,
}));

/**
 * One fixed edge set over four packages, used by the property tests.
 *
 * `src/d` carries only a self-edge, so a partition that includes it has a
 * package with internal coupling and nothing else.
 */
const PROPERTY_RECORDS = [
  { from: 'src/a', to: 'src/a', file: 'src/a/1.rs', line: 1, spelling: 'crate::a::x' },
  { from: 'src/a', to: 'src/b', file: 'src/a/2.rs', line: 2, spelling: 'crate::b::y' },
  { from: 'src/b', to: 'src/c', file: 'src/b/1.rs', line: 3, spelling: 'crate::c::z' },
  { from: 'src/c', to: 'src/a', file: 'src/c/1.rs', line: 4, spelling: 'crate::a::x' },
  { from: 'src/d', to: 'src/d', file: 'src/d/1.rs', line: 5, spelling: 'crate::d::w' },
];
// `src/e` carries no record at all, so a partition that includes it has a
// package no measured edge reaches — the boundary case the identity must hold on.
const PROPERTY_PACKAGES = ['src/a', 'src/b', 'src/c', 'src/d', 'src/e'];

/**
 * Twenty partitions of the one fixed edge set.
 *
 * The fifteen non-empty subsets of the four packages are cycled up to twenty so
 * that the property is asserted over partitions that include and exclude each
 * package rather than over one convenient shape.
 */
// [::TICKET::] P23-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-2 --for-spec --no-implementation-order`.
function partitionMaterialPartitions() {
  const subsets = [];
  for (let mask = 1; mask < (1 << PROPERTY_PACKAGES.length); mask += 1) {
    subsets.push(PROPERTY_PACKAGES.filter((_, position) => (mask & (1 << position)) !== 0));
  }
  return Array.from({ length: 20 }, (_, index) => subsets[index % subsets.length]);
}

test('UT: [Normal] Contract C001 precondition — a measured package set and the measured edge set are both present, and every edge names two members of the set', () => {
  const members = new Set(TWO_PACKAGE_NAMES);
  assert.ok(TWO_PACKAGE_RECORDS.every((edge) => members.has(edge.from) && members.has(edge.to)));
  assert.deepEqual(
    [...new Set(TWO_PACKAGE_RECORDS.flatMap((edge) => [edge.from, edge.to]))].sort(),
    TWO_PACKAGE_NAMES,
  );
});

test('UT: [Normal] Contract C001 postcondition — internal and external coupling are counted per package with the member files named and the external-to-total ratio stated beside both counts', () => {
  const { rows } = measureCohesion({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_RECORDS });

  assert.deepEqual(rows, [
    {
      package: 'src/a',
      internalCoupling: 2,
      externalCoupling: 2,
      incidentEdges: 4,
      externalRatio: 0.5,
      memberFiles: ['src/a/a1.rs', 'src/a/a2.rs'],
    },
    {
      package: 'src/b',
      internalCoupling: 0,
      externalCoupling: 2,
      incidentEdges: 2,
      externalRatio: 1,
      memberFiles: ['src/b/b1.rs'],
    },
  ]);
  // The ratio is stated beside the counts and not instead of them: both raw
  // numbers survive in the same row that carries the ratio.
  assert.equal(rows[0].externalRatio, rows[0].externalCoupling / rows[0].incidentEdges);
  assert.ok(rows[0].memberFiles.length > 0, 'the reader can see which files the coupling was measured over');
});

test('UT: [Invariant] Contract C001 invariant — internal plus external equals incident for every package, including one with no incident edge', () => {
  const { rows } = measureCohesion({ packages: PROPERTY_PACKAGES, edges: PROPERTY_RECORDS });
  assert.ok(rows.some((row) => row.incidentEdges === 0), 'the fixture carries a package no measured edge reaches');
  for (const row of rows) {
    assert.equal(row.internalCoupling + row.externalCoupling, row.incidentEdges, `${row.package} lost an edge`);
  }
});

test('UT: [Invariant] Contract C001 invariant as a property — over twenty generated partitions of one fixed edge set the identity holds for every package', () => {
  for (const partition of partitionMaterialPartitions()) {
    const { rows } = measureCohesion({ packages: partition, edges: PROPERTY_RECORDS });
    for (const row of rows) {
      assert.equal(row.internalCoupling + row.externalCoupling, row.incidentEdges, `${row.package} in ${partition.join('+')}`);
    }
  }
});

test('UT: [Error] an edge naming a package outside the measured set is reported as an unresolved edge by name rather than attributed to a package that does not exist', () => {
  const { rows, unresolvedEdges } = measureCohesion({
    packages: ['src/a'],
    edges: [{ from: 'src/a', to: 'src/ghost', file: 'src/a/a1.rs', line: 1, spelling: 'crate::ghost::x' }],
  });

  assert.deepEqual(unresolvedEdges, [
    { from: 'src/a', to: 'src/ghost', reason: 'src/ghost is not in the measured package set' },
  ]);
  // The unresolved edge is not silently attributed to src/a: its external count
  // stays zero rather than gaining an edge it cannot have.
  assert.deepEqual(rows, [
    {
      package: 'src/a',
      internalCoupling: 0,
      externalCoupling: 0,
      incidentEdges: 0,
      externalRatio: NOT_MEASURED,
      memberFiles: [],
    },
  ]);
});

test('UT: [Boundary] Contract C001 boundary invariant — a package with one member file and no incident edge yields a null ratio, asserted as null rather than as zero', () => {
  const lonely = measureCohesion({ packages: ['src/lonely'], edges: [] });

  assert.equal(lonely.rows[0].externalRatio, null);
  assert.notEqual(lonely.rows[0].externalRatio, 0);
  assert.deepEqual(lonely.rows[0], {
    package: 'src/lonely',
    internalCoupling: 0,
    externalCoupling: 0,
    incidentEdges: 0,
    externalRatio: NOT_MEASURED,
    memberFiles: [],
  });
});

test('UT: [Boundary] a package named twice in the measured set is attributed once, so the package set is a set rather than a list', () => {
  const twice = measureCohesion({
    packages: ['src/a', 'src/a'],
    edges: [{ from: 'src/a', to: 'src/a', file: 'src/a/a1.rs', line: 1, spelling: 'crate::a::a2' }],
  });

  assert.equal(twice.rows.length, 1);
  assert.equal(twice.rows[0].internalCoupling, 1);

  // The two measurements consume one population and cannot disagree about how
  // many packages it holds: a name given twice is one package for both.
  const density = measureDependencyDensity({ packages: ['src/a', 'src/a'], edges: [] });
  assert.equal(density.population.packages.length, 1);
  assert.equal(density.possibleOrderedPairs, 1);
  assert.deepEqual(density.population.packages, twice.rows.map((row) => row.package));
});

test('UT: [Error] a call site that names no file or no callee is refused by name rather than throwing from inside the count', () => {
  const malformed = /countBoundaryCrossings needs every call site to carry the file it sits in and the callee it names/;

  assert.throws(
    () => countBoundaryCrossings({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_EDGES, callSites: [{ name: 'b1' }] }),
    malformed,
  );
  assert.throws(
    () => countBoundaryCrossings({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_EDGES, callSites: [{ file: 'src/a/a1.rs' }] }),
    malformed,
  );
  assert.throws(
    () => countBoundaryCrossings({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_EDGES, callSites: [null] }),
    malformed,
  );
  // An empty list is a measured run that saw no crossing call, and is not the
  // same input as a malformed one.
  assert.equal(
    countBoundaryCrossings({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_EDGES, callSites: [] }).length,
    TWO_PACKAGE_EDGES.length,
  );
});

test('UT: [Error] measureCohesion, measureDependencyDensity and countBoundaryCrossings each throw naming the input they needed rather than returning an empty result', () => {
  assert.throws(() => measureCohesion({ packages: null, edges: [] }), /measureCohesion needs the measured package set/);
  assert.throws(() => measureCohesion({ packages: 'src/a', edges: [] }), /measureCohesion needs the measured package set/);
  assert.throws(() => measureCohesion({ packages: [], edges: null }), /measureCohesion needs the measured edge set/);
  assert.throws(() => measureDependencyDensity({ packages: null, edges: [] }), /measureDependencyDensity needs the measured package set/);
  assert.throws(() => measureDependencyDensity({ packages: [], edges: null }), /measureDependencyDensity needs the measured edge set/);
  assert.throws(() => countBoundaryCrossings({ packages: null, edges: [] }), /countBoundaryCrossings needs the measured package set/);
  assert.throws(() => countBoundaryCrossings({ packages: [], edges: null }), /countBoundaryCrossings needs the measured edge set/);
});

test('UT: [Invariant] the measurement consumes the sets it was given and reads nothing else — two calls with the same input cannot disagree, and no path has to exist', () => {
  const tree = syntheticCrateTree();
  const onDisk = [join(tree.root, 'src', 'api'), join(tree.root, 'src', 'config')];
  const offDisk = ['there/is/no/such/a', 'there/is/no/such/b'];
  const records = (left, right) => [
    { from: left, to: left, file: 'a.rs', line: 1, spelling: 'crate::a' },
    { from: left, to: right, file: 'b.rs', line: 2, spelling: 'crate::b' },
  ];
  const relabel = (rows, names) => rows.map((row) => ({
    ...row,
    package: row.package === names[0] ? 'X' : 'Y',
  }));

  const here = measureCohesion({ packages: onDisk, edges: records(onDisk[0], onDisk[1]) });
  const again = measureCohesion({ packages: onDisk, edges: records(onDisk[0], onDisk[1]) });
  const there = measureCohesion({ packages: offDisk, edges: records(offDisk[0], offDisk[1]) });

  assert.deepEqual(here, again, 'two calls with the same input give the same output');
  assert.deepEqual(relabel(there.rows, offDisk), relabel(here.rows, onDisk), 'a directory that exists and one that does not are measured identically');
  tree.dispose();
});

test('UT: [Normal] Contract C002 precondition — the package set and the edge set are present and the package count is at least one, so the ordered pair count is defined', () => {
  assert.ok(Array.isArray(THREE_PACKAGE_NAMES) && THREE_PACKAGE_NAMES.length >= 1);
  assert.equal(EVERY_ORDERED_PAIR_EDGES.length, THREE_PACKAGE_NAMES.length * (THREE_PACKAGE_NAMES.length - 1));
});

test('UT: [Normal] Contract C002 postcondition — density is the measured edge count over the possible ordered pairs, with both numbers and the named population beside it', () => {
  const density = measureDependencyDensity({ packages: THREE_PACKAGE_NAMES, edges: EVERY_ORDERED_PAIR_EDGES });

  assert.equal(density.measuredEdges, 6);
  assert.equal(density.possibleOrderedPairs, 6);
  assert.equal(density.density, 6 / 6);
  assert.deepEqual(density.population.packages, THREE_PACKAGE_NAMES);
  assert.equal(density.population.measured, true);
  assert.equal(density.population.reason, null);
});

test('UT: [Error] Contract C002 invariant — a zero edge count reports a measured population and a density of zero, not an unmeasured population reported as zero', () => {
  const none = measureDependencyDensity({ packages: THREE_PACKAGE_NAMES, edges: [] });

  assert.equal(none.measuredEdges, 0);
  assert.equal(none.density, 0);
  assert.equal(none.population.measured, true);
  assert.equal(none.population.reason, null);
  assert.deepEqual(none.population.packages, THREE_PACKAGE_NAMES);
});

test('UT: [Boundary] Contract C002 invariant — density is exactly one when every ordered pair carries an edge and exactly zero when none does', () => {
  assert.equal(
    measureDependencyDensity({ packages: THREE_PACKAGE_NAMES, edges: EVERY_ORDERED_PAIR_EDGES }).density,
    DENSITY_MAXIMUM,
  );
  assert.equal(
    measureDependencyDensity({ packages: THREE_PACKAGE_NAMES, edges: [] }).density,
    DENSITY_MINIMUM,
  );
});

test('UT: [Boundary] a single-package project reports one possible ordered pair rather than zero, so the ratio is defined', () => {
  const alone = measureDependencyDensity({ packages: ['src/only'], edges: [] });

  assert.equal(alone.possibleOrderedPairs, 1);
  assert.notEqual(alone.possibleOrderedPairs, 0);
  assert.equal(alone.density, DENSITY_MINIMUM);
});

test('UT: [Invariant] Contract C002 invariant as a property — over the same partitions density stays inside the closed interval and reaches zero only when no edge was measured', () => {
  for (const partition of partitionMaterialPartitions()) {
    const density = measureDependencyDensity({ packages: partition, edges: PROPERTY_RECORDS });
    assert.ok(density.density >= DENSITY_MINIMUM && density.density <= DENSITY_MAXIMUM, `${density.density} left [0,1]`);
    assert.equal(density.density === DENSITY_MINIMUM, density.measuredEdges === 0);
  }
});

test('UT: [Normal] Contract C003 precondition — the call-site material carries a source file and a callee name, and the partition measured is the one R2 measured', () => {
  const callSites = [
    { file: 'src/a/a1.rs', name: 'b1' },
    { file: 'src/a/a2.rs', name: 'b1' },
    { file: 'src/a/a1.rs', name: 'elsewhere' },
  ];

  assert.ok(callSites.every((site) => typeof site.file === 'string' && typeof site.name === 'string'));
  assert.ok(TWO_PACKAGE_EDGES.every((edge) => TWO_PACKAGE_NAMES.includes(edge.from) && TWO_PACKAGE_NAMES.includes(edge.to)));
});

test('UT: [Normal] Contract C003 postcondition — three call sites in the source package naming the target of a crossing are reported as a count, and the row states where the count came from', () => {
  const rows = countBoundaryCrossings({
    packages: TWO_PACKAGE_NAMES,
    edges: TWO_PACKAGE_EDGES,
    callSites: [
      { file: 'src/a/a1.rs', name: 'b1' },
      { file: 'src/a/a2.rs', name: 'b1' },
      { file: 'src/a/a1.rs', name: 'b1' },
      // A call that names something else in the same package is not a crossing,
      // and a call in the target package is not one either.
      { file: 'src/a/a1.rs', name: 'elsewhere' },
      { file: 'src/b/b1.rs', name: 'b1' },
    ],
  });

  const crossing = rows.find((row) => row.from === 'src/a' && row.to === 'src/b');
  assert.equal(crossing.callSiteCount, 3);
  assert.equal(crossing.measured, true);
  assert.equal(crossing.reason, null);
});

test('UT: [Error] Contract C003 error path — when callSites is absent because R3 did not run, every crossing is not measured, the reason names R3, and no row reports a count of zero', () => {
  const unmeasured = countBoundaryCrossings({
    packages: TWO_PACKAGE_NAMES,
    edges: TWO_PACKAGE_EDGES,
    callSites: null,
  });

  assert.equal(unmeasured.length, TWO_PACKAGE_EDGES.length);
  assert.ok(unmeasured.every((row) => row.measured === false));
  assert.ok(unmeasured.every((row) => row.callSiteCount === NOT_MEASURED));
  assert.ok(unmeasured.every((row) => /R3/.test(row.reason)));
  assert.ok(unmeasured.every((row) => row.reason === CALL_SITES_ABSENT_REASON));
  assert.equal(unmeasured.some((row) => row.callSiteCount === 0), false);
});

test('UT: [Error] Contract C003 invariant — a crossing whose calls the syntax layer cannot see is reported as a count of zero and stays in the output', () => {
  const rows = countBoundaryCrossings({
    packages: TWO_PACKAGE_NAMES,
    edges: TWO_PACKAGE_EDGES,
    callSites: [],
  });

  assert.equal(rows.length, TWO_PACKAGE_EDGES.length);
  assert.ok(rows.some((row) => row.callSiteCount === 0), 'a zero row is present rather than dropped');
  assert.ok(rows.every((row) => row.measured === true));
  assert.ok(rows.every((row) => row.callSiteCount === 0));
});

test('UT: [Invariant] Contract C003 invariant as a property — every crossing edge appears exactly once in the output, whatever its call-site count', () => {
  const rows = countBoundaryCrossings({
    packages: THREE_PACKAGE_NAMES,
    edges: EVERY_ORDERED_PAIR_EDGES,
    callSites: [{ file: 'src/a/mod.rs', name: 'item' }],
  });

  assert.equal(rows.length, EVERY_ORDERED_PAIR_EDGES.length);
  assert.deepEqual(
    rows.map((row) => `${row.from}->${row.to}`).sort(),
    EVERY_ORDERED_PAIR_EDGES.map((edge) => `${edge.from}->${edge.to}`).sort(),
    'every crossing appears exactly once, whatever its call-site count',
  );
  assert.equal(new Set(rows.map((row) => `${row.from}->${row.to}`)).size, EVERY_ORDERED_PAIR_EDGES.length);
});

test('UT: [Boundary] a crossing whose source has one call site and one whose source has a hundred both report their count without a cap', () => {
  const one = countBoundaryCrossings({ packages: TWO_PACKAGE_NAMES, edges: TWO_PACKAGE_EDGES, callSites: [{ file: 'src/a/a1.rs', name: 'b1' }] });
  const hundred = countBoundaryCrossings({
    packages: TWO_PACKAGE_NAMES,
    edges: TWO_PACKAGE_EDGES,
    callSites: Array.from({ length: 100 }, () => ({ file: 'src/a/a1.rs', name: 'b1' })),
  });

  assert.equal(one.find((row) => row.from === 'src/a' && row.to === 'src/b').callSiteCount, 1);
  assert.equal(hundred.find((row) => row.from === 'src/a' && row.to === 'src/b').callSiteCount, 100);
  assert.equal(hundred.find((row) => row.from === 'src/a' && row.to === 'src/b').measured, true);
});

test('UT: [Normal] countBoundaryCrossings orders its rows deterministically, so two readings of one run cannot disagree about which crossing is which', () => {
  const read = () => countBoundaryCrossings({
    packages: TWO_PACKAGE_NAMES,
    edges: TWO_PACKAGE_EDGES,
    callSites: [{ file: 'src/a/a1.rs', name: 'b1' }],
  });

  assert.deepEqual(read(), read());
  assert.deepEqual(read().map((row) => `${row.from}->${row.to}`), ['src/a->src/b', 'src/b->src/a']);
});

test('UT: [Normal] measureDependencies carries cohesion, density and boundaryCrossings beside the keys it already carried, and every existing key keeps its name, type and meaning', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const dependencies = measureDependencies({ root: tree.root, surface });

  for (const key of [
    'analysis_mode', 'attempts', 'coverage', 'coupling_claim', 'cycles', 'declaredModules',
    'edges', 'external', 'limitations', 'packages', 'represents_runtime_binding', 'runtime_binding_caveat',
  ]) {
    assert.ok(Object.hasOwn(dependencies, key), `${key} was a key of the document before this ticket`);
  }
  assert.ok(Array.isArray(dependencies.cohesion.rows));
  assert.ok(Array.isArray(dependencies.cohesion.unresolvedEdges));
  assert.equal(typeof dependencies.density.density, 'number');
  assert.ok(Array.isArray(dependencies.boundaryCrossings));
  assert.ok(dependencies.cohesion.rows.length >= 2, 'the fixture spans more than one package');
  assert.equal(dependencies.coupling_claim, 'hypothesis');
  assert.equal(dependencies.represents_runtime_binding, false);
  tree.dispose();
});

test('UT: [Invariant] coupling_claim stays hypothesis and represents_runtime_binding stays false after the new measurements are attached, asserted on the returned object', () => {
  const tree = syntheticCrateTree();
  const dependencies = measureDependencies({ root: tree.root });

  assert.equal(dependencies.coupling_claim, 'hypothesis');
  assert.equal(dependencies.represents_runtime_binding, false);
  // The static measurements make no stronger claim than the graph they read.
  assert.ok(dependencies.boundaryCrossings.every((row) => row.measured === false));
  tree.dispose();
});

test('UT: [Normal] the dependency report renders the partition material as prose that names the packages, embeds file:line and states the question the reader must answer', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const report = renderDependencyReport(measureDependencies({ root: tree.root, surface }));

  assert.match(report, /## The partition material/);
  assert.match(report, /[A-Za-z0-9_./-]+\.(?:rs|ts|mjs):\d+/);
  assert.match(report, /Decide whether/i);
  assert.match(report, /cohesion/i);
  assert.match(report, /density/i);
  tree.dispose();
});

test('UT: [Normal] the report names a directory that reads as a boundary and says why, in the form ABOUT-REVERSE 5.2 requires', () => {
  const tree = syntheticCrateTree();
  const surface = measureExecutionSurface({ root: tree.root });
  const report = renderDependencyReport(measureDependencies({ root: tree.root, surface }));

  assert.match(report, /reads as a boundary/i);
  assert.match(report, /Because the terminal state|why it matters/i);
  assert.match(report, /not measured|R3/);
  assert.match(report, /static/i);
  tree.dispose();
});
