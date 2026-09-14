// @verifies C001
// @verifies C002
// @verifies C003
/**
 * E1-E4 across the six target languages.
 *
 * The subject is the *shape and honesty* of the extraction rather than its
 * recall: that the four items are produced for every language with one
 * language-independent record shape, that every `file:line` resolves to a line
 * that exists, that each language's cell carries its own reason for being
 * `partial`, and that "could not analyse" and "analysed and found nothing"
 * stay distinguishable in the ledger. Whether a query set finds *every* item a
 * language can express is not decidable from a fixture population and is not
 * claimed — which is exactly why every cell is `partial` rather than `success`.
 *
 * The Rust records are pinned as a golden captured before this ticket ran, so
 * the refactor that moved five collectors onto a shared path is proved
 * behaviour-preserving rather than asserted to be.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSyntheticTree } from '../helpers/scratch.mjs';

import {
  CAPABILITY_MATRIX,
  EXTRACTION_ITEMS,
  LANGUAGES_WITH_EXTRACTORS,
  TARGET_LANGUAGES,
  buildAttemptLedger,
  capabilityNoteFor,
  findCapabilityGaps,
  renderCapabilityMatrixMarkdown,
  renderCapabilityReasonsMarkdown,
  renderCouplingReasonsMarkdown,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import {
  GRAMMAR_BY_LANGUAGE,
  QUERIES_BY_LANGUAGE,
  STRUCTURE_FAMILIES,
  collectErrorTypes,
  collectModules,
  collectPublicSurface,
  collectTypeDefinitions,
  measureStructure,
  parseSourceFile,
  syntaxLanguageOf,
} from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ANALYSIS_TECH_DOC = join(PROJECT_ROOT, 'docs', 'P22-ANALYSIS-TECH.md');

/** The six languages, in the order the matrix renders them. */
const SIX = Object.freeze([...TARGET_LANGUAGES]);

/** The five languages this ticket writes an extractor for. */
const NEW_FIVE = Object.freeze(SIX.filter((language) => language !== 'rust'));

/** The field names each item's record carries, uniform across the six languages. */
const RECORD_FIELDS = Object.freeze({
  E1: Object.freeze(['declaredModules', 'directory', 'files', 'language']),
  E2: Object.freeze(['cfgGated', 'file', 'itemKind', 'line', 'spelling', 'symbol', 'visibility']),
  E3: Object.freeze(['cfgGated', 'file', 'line', 'symbol', 'typeKind', 'visibility']),
  E4: Object.freeze(['cfgGated', 'file', 'line', 'signals', 'symbol', 'typeKind', 'variants']),
});

/**
 * The Rust E1-E4 records over `syntheticCrateTree`, captured before this ticket.
 *
 * A characterization golden: it is green before the change and must stay green
 * after it, which is the only way "the refactor changed nothing" can be a
 * proved statement rather than a hopeful one.
 */
const RUST_GOLDEN = JSON.parse('{"packages":[{"directory":".","language":"rust","files":["build.rs"],"declaredModules":[]},{"directory":"src","language":"rust","files":["src/empty.rs","src/lib.rs"],"declaredModules":["api","empty"]},{"directory":"src/api","language":"rust","files":["src/api/login.rs","src/api/mod.rs","src/api/transport.rs"],"declaredModules":["login","transport"]},{"directory":"src/config","language":"rust","files":["src/config/mod.rs"],"declaredModules":[]},{"directory":"tests","language":"rust","files":["tests/verify_feature.rs","tests/verify_spec_4b35a676.rs"],"declaredModules":[]}],"publicItems":[{"symbol":"Client","itemKind":"struct","file":"src/api/login.rs","line":4,"visibility":"pub","cfgGated":false,"spelling":"pub struct Client { inner: Box<dyn crate::Handler> }"},{"symbol":"login","itemKind":"function","file":"src/api/login.rs","line":10,"visibility":"pub","cfgGated":false,"spelling":"pub fn login(settings: &Settings) -> Result<Client, Error> {"},{"symbol":"dial","itemKind":"function","file":"src/api/transport.rs","line":3,"visibility":"pub","cfgGated":false,"spelling":"pub fn dial(_: &Settings) {}"},{"symbol":"Settings","itemKind":"struct","file":"src/config/mod.rs","line":3,"visibility":"pub","cfgGated":false,"spelling":"pub struct Settings { pub host: String }"},{"symbol":"Handler","itemKind":"trait","file":"src/lib.rs","line":8,"visibility":"pub","cfgGated":false,"spelling":"pub trait Handler {"},{"symbol":"Session","itemKind":"struct","file":"src/lib.rs","line":13,"visibility":"pub","cfgGated":false,"spelling":"pub struct Session { pub token: String }"},{"symbol":"Error","itemKind":"enum","file":"src/lib.rs","line":16,"visibility":"pub","cfgGated":false,"spelling":"pub enum Error {"},{"symbol":"connect","itemKind":"function","file":"src/lib.rs","line":21,"visibility":"pub","cfgGated":false,"spelling":"pub fn connect() -> Result<Session, Error> {"},{"symbol":"shared","itemKind":"function","file":"tests/verify_feature.rs","line":1,"visibility":"pub","cfgGated":false,"spelling":"pub fn shared() -> u8 { 7 }"},{"symbol":"read_spec","itemKind":"function","file":"tests/verify_spec_4b35a676.rs","line":1,"visibility":"pub","cfgGated":false,"spelling":"pub fn read_spec() -> u8 { 1 }"}],"types":[{"symbol":"Client","typeKind":"struct","file":"src/api/login.rs","line":4,"visibility":"pub","cfgGated":false},{"symbol":"NoopHandler","typeKind":"struct","file":"src/api/login.rs","line":16,"visibility":null,"cfgGated":false},{"symbol":"Settings","typeKind":"struct","file":"src/config/mod.rs","line":3,"visibility":"pub","cfgGated":false},{"symbol":"Handler","typeKind":"trait","file":"src/lib.rs","line":8,"visibility":"pub","cfgGated":false},{"symbol":"Session","typeKind":"struct","file":"src/lib.rs","line":13,"visibility":"pub","cfgGated":false},{"symbol":"Error","typeKind":"enum","file":"src/lib.rs","line":16,"visibility":"pub","cfgGated":false}],"errorTypes":[{"symbol":"Error","file":"src/lib.rs","signals":["name_matches_error","appears_as_result_error_type"],"typeKind":"enum","line":16,"variants":[{"symbol":"Missing","line":17},{"symbol":"Denied","line":18}],"cfgGated":false}]}');

/** The synthetic crate the Rust golden was captured over, byte for byte. */
const SYNTHETIC_CRATE = Object.freeze({
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
});

/**
 * One snippet per language that makes all four families non-empty.
 *
 * A shape asserted over an empty list asserts nothing, and two of the frozen
 * representatives have no class or no error type at all. Each snippet carries a
 * function, a type and a type named for an error, which is the least material
 * every family can be read from.
 */
const SHAPE_FIXTURES = Object.freeze({
  rust: Object.freeze({ path: 'src/shape.rs', text: 'pub fn only() {}\n\npub struct Shape { pub width: u8 }\n\npub enum ShapeError { Empty }\n' }),
  typescript: Object.freeze({ path: 'src/shape.ts', text: 'export function only(): void {}\nexport interface Shape { width: number }\nexport class ShapeError extends Error {}\n' }),
  javascript: Object.freeze({ path: 'src/shape.js', text: 'function only() {}\nclass Shape {}\nclass ShapeError extends Error {}\nmodule.exports = { only, Shape, ShapeError };\n' }),
  go: Object.freeze({ path: 'src/shape.go', text: 'package shape\n\nfunc Only() {}\n\ntype Shape struct{ Width int }\n\ntype ShapeError struct{}\n\nfunc (e ShapeError) Error() string { return "" }\n' }),
  python: Object.freeze({ path: 'src/shape.py', text: 'def only():\n    return 1\n\nclass Shape:\n    pass\n\nclass ShapeError(Exception):\n    pass\n' }),
  c_cpp: Object.freeze({ path: 'src/shape.h', text: 'typedef struct Shape { int width; } Shape;\n\nstruct ShapeError { int code; };\n\nint only(void);\n' }),
});

/** Measure one language's representative. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function measureRepresentative(language) {
  return measureStructure({ root: join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]) });
}

/** Parse one representative file, so a collector can be called the way the measurement calls it. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function parseRepresentativeFile(language, relativePath) {
  return parseSourceFile(join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]), relativePath);
}

/** The distinct field names a list of records carries. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function fieldNames(records) {
  return [...new Set(records.flatMap((record) => Object.keys(record)))].sort();
}

/** Order records the way a reader would go to them, for a comparison that ignores walk order. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function byLocation(left, right) {
  return `${left.file}:${String(left.line).padStart(6, '0')}:${left.symbol}`
    .localeCompare(`${right.file}:${String(right.line).padStart(6, '0')}:${right.symbol}`);
}

/** The reason attached to one language's cell for one item. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function reasonFor(language, item) {
  const gap = findCapabilityGaps(CAPABILITY_MATRIX).find(
    (candidate) => candidate.language === language && candidate.item === item,
  );
  assert.ok(gap, `${language}/${item} must be a gap with a reason`);
  return gap.reason;
}

/** Every E1-E4 record of a structure result, keyed by the family that produced it. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function recordsOf(structure) {
  return { E1: structure.packages, E2: structure.publicItems, E3: structure.types, E4: structure.errorTypes };
}

// ---------------------------------------------------------------------------
// C001 — measureStructure produces E1-E4 for every target language
// ---------------------------------------------------------------------------

test('UT: [Normal] C001 precondition — each of the six declares a grammar and a query row, and its representative parses', () => {
  for (const language of SIX) {
    assert.ok(GRAMMAR_BY_LANGUAGE[language], `${language} declares a grammar`);
    assert.ok(QUERIES_BY_LANGUAGE[language], `${language} carries a query row`);
    const structure = measureRepresentative(language);
    assert.ok(structure.coverage.files_parsed > 0, `${language} must parse at least one file`);
  }
});

test('UT: [Error] C003 over a frozen representative — the Python tree carries one file the grammar must recover from', () => {
  // P24-1's provenance annotation was injected at column zero inside an indented
  // Python block, which the grammar cannot accept. The instrument records the
  // file as a failed attempt with its diagnostic rather than reporting an
  // extraction that silently skipped part of it.
  const python = measureRepresentative('python');
  assert.equal(python.coverage.files_with_error_nodes, 1);
  const failed = python.attempts.find((attempt) => attempt.status === 'failed');
  assert.equal(failed.target, 'src/tracing.py');
  assert.ok(failed.diagnostics.length > 0);
  // The row is `failed` because the file could not be read whole, and it still
  // carries what the recovered parse did read. The two facts are kept apart:
  // the count says what was found, the status says how much of the file was
  // legible, and a consumer that read either as the other would be wrong.
  assert.ok(failed.extracted_count > 0);

  for (const language of SIX.filter((candidate) => candidate !== 'python')) {
    assert.equal(measureRepresentative(language).coverage.files_with_error_nodes, 0, `${language} parses cleanly`);
  }
});

test('UT: [Normal] C001 postcondition — TypeScript E1, E2, E3 and E4 are produced with file:line', () => {
  const structure = measureRepresentative('typescript');
  const source = structure.packages.find((pkg) => pkg.directory === 'src');
  assert.ok(source, 'E1 names the module boundary');
  assert.ok(source.files.includes('src/model.ts'), 'E1 owns the files below it');

  const names = structure.publicItems.map((item) => item.symbol);
  assert.ok(names.includes('describe'), 'E2 names an exported function');
  assert.ok(names.includes('ALPHA'), 'E2 names an exported constant');
  assert.ok(
    structure.publicItems.some((item) => item.itemKind === 're_export_all' && item.file === 'src/index.ts' && item.line === 10),
    'E2 records the export * statement at the line that performs it',
  );
  assert.ok(
    structure.types.some((type) => type.symbol === 'Box' && type.typeKind === 'interface'),
    'E3 names the interface',
  );
  assert.deepEqual(structure.errorTypes, [], 'the TypeScript representative declares no error type');
});

test('UT: [Normal] C001 postcondition — JavaScript, Go, Python and C/C++ each produce their four items', () => {
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
  const javascript = measureRepresentative('javascript');
  assert.ok(javascript.publicItems.some((item) => item.symbol === 'Widget' && item.file === 'src/widget.js'), 'JS E2 reads module.exports');
  assert.ok(javascript.publicItems.some((item) => item.symbol === 'loadModule'), 'JS E2 reads the second module');

  const go = measureRepresentative('go');
  assert.ok(go.types.some((type) => type.symbol === 'Widget' && type.typeKind === 'struct'), 'Go E3 names the struct');
  assert.ok(go.publicItems.some((item) => item.symbol === 'Render' && item.itemKind === 'method'), 'Go E2 names an exported method');
  // The module holds two packages since P24-3 gave it a dependency to measure,
  // so each is named by its own clause rather than every package being assumed
  // to declare the one this test was written for.
  assert.ok(
    go.packages.some((pkg) => pkg.directory === 'pkg/widget' && pkg.declaredModules.includes('widget')),
    'Go E1 declares the widget package',
  );
  assert.ok(
    go.packages.some((pkg) => pkg.directory === 'pkg/label' && pkg.declaredModules.includes('label')),
    'Go E1 declares the second package of the module, which E5 resolves an import against',
  );

  const python = measureRepresentative('python');
  assert.ok(python.types.some((type) => type.symbol === 'Widget' && type.typeKind === 'class'), 'Python E3 names the class');
  assert.ok(python.publicItems.some((item) => item.symbol === 'render'), 'Python E2 names the decorated function');

  const cCpp = measureRepresentative('c_cpp');
  assert.ok(cCpp.types.some((type) => type.symbol === 'Widget' && type.typeKind === 'struct'), 'C/C++ E3 names the typedef struct');
  assert.ok(cCpp.publicItems.some((item) => item.symbol === 'widget_label'), 'C/C++ E2 names the declared function');
  assert.ok(cCpp.publicItems.some((item) => item.symbol === 'MAX_OF' && item.itemKind === 'macro'), 'C/C++ E2 names the function-like macro');
});

test('UT: [Normal] C001 invariant — the field-name set of every E1-E4 record is identical across the six languages', () => {
  // The frozen representatives do not exercise every family in every language —
  // JavaScript declares no class, so it has no E3 — and a shape asserted over an
  // empty list asserts nothing. Each language is therefore measured over
  // material chosen to make all four families non-empty.
  for (const language of SIX) {
    const fixture = SHAPE_FIXTURES[language];
    const tree = createSyntheticTree({ [fixture.path]: fixture.text }, { prefix: `wsp-p24-2-shape-${language}-` });
    const measured = recordsOf(measureStructure({ root: tree.root }));
    for (const item of STRUCTURE_FAMILIES) {
      assert.ok(measured[item].length > 0, `${language} ${item} must produce a record for its shape to be asserted`);
      assert.deepEqual(fieldNames(measured[item]), [...RECORD_FIELDS[item]], `${language} ${item} field names`);
    }
    tree.dispose();
  }

  // And over the frozen representatives, whatever a language does produce
  // carries the same field names — so a language-specific shape cannot appear.
  for (const language of SIX) {
    const measured = recordsOf(measureRepresentative(language));
    for (const item of STRUCTURE_FAMILIES) {
      if (measured[item].length === 0) continue;
      assert.deepEqual(fieldNames(measured[item]), [...RECORD_FIELDS[item]], `${language} ${item} over its representative`);
    }
  }
});

test('UT: [Error] C001 invariant — a language-specific extra field fails the field-name-set equality', () => {
  const structure = measureRepresentative('typescript');
  const smuggled = [
    ...structure.types,
    { symbol: 'X', typeKind: 'interface', file: 'src/model.ts', line: 10, visibility: 'export', cfgGated: false, decorators: ['@sealed'] },
  ];
  assert.notDeepEqual(fieldNames(smuggled), [...RECORD_FIELDS.E3], 'a language-specific shape cannot be smuggled in');
});

test('UT: [Invariant] every E2, E3 and E4 file:line resolves to a line that exists in the file it names', () => {
  for (const language of SIX) {
    const root = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
    const structure = measureRepresentative(language);
    const records = [...structure.publicItems, ...structure.types, ...structure.errorTypes];
    assert.ok(records.length > 0, `${language} must produce at least one located record`);
    for (const record of records) {
      const lines = readFileSync(join(root, record.file), 'utf8').split('\n');
      assert.ok(record.line >= 1 && record.line <= lines.length, `${language}: ${record.file}:${record.line} must resolve`);
    }
  }
});

test('UT: [Normal] the collectors dispatch on the table and produce what measureStructure publishes', () => {
  assert.deepEqual(STRUCTURE_FAMILIES, ['E1', 'E2', 'E3', 'E4']);
  for (const language of SIX) {
    assert.deepEqual(
      Object.keys(QUERIES_BY_LANGUAGE[language]).sort(),
      [...STRUCTURE_FAMILIES].sort(),
      `${language} declares one query group per item`,
    );
  }

  const relativePath = 'pkg/widget/widget.go';
  const parsed = parseRepresentativeFile('go', relativePath);
  assert.equal(parsed.ok, true);
  const published = measureRepresentative('go');

  assert.deepEqual(
    collectPublicSurface('go', parsed.tree, relativePath).sort(byLocation),
    published.publicItems.filter((item) => item.file === relativePath).sort(byLocation),
    'E2 is exactly what measureStructure publishes for this file',
  );
  assert.deepEqual(
    collectTypeDefinitions('go', parsed.tree, relativePath).sort(byLocation),
    published.types.filter((type) => type.file === relativePath).sort(byLocation),
    'E3 is exactly what measureStructure publishes for this file',
  );
  assert.deepEqual(collectErrorTypes('go', parsed.tree, relativePath), []);
  assert.deepEqual(
    collectModules('go', parsed.tree, relativePath).map((module) => module.symbol),
    ['widget'],
    'E1 reads the package clause',
  );
});

test('UT: [Boundary] a component with a single exported item produces exactly one E2 record', () => {
  const tree = createSyntheticTree({ 'src/one.ts': 'export function only(): number { return 1 }\n' }, { prefix: 'wsp-p24-2-one-' });
  const structure = measureStructure({ root: tree.root });
  assert.deepEqual(structure.publicItems.map((item) => item.symbol), ['only']);
  assert.deepEqual(structure.types, [], 'a function is not a type definition');
  tree.dispose();
});

test('UT: [Boundary] a C/C++ header included from two translation units is owned once', () => {
  const structure = measureRepresentative('c_cpp');
  const owner = structure.packages.filter((pkg) => pkg.files.includes('src/widget.h'));
  assert.equal(owner.length, 1, 'a file is owned by exactly one package whatever includes it');
});

test('UT: [Boundary] a file holding only comments produces empty E2-E4 and a success attempt with extracted_count 0', () => {
  const tree = createSyntheticTree({ 'src/quiet.go': '// nothing but a comment\npackage widget\n' }, { prefix: 'wsp-p24-2-quiet-' });
  const structure = measureStructure({ root: tree.root });
  assert.deepEqual(structure.types, []);
  assert.deepEqual(structure.errorTypes, []);
  const row = structure.attempts.find((attempt) => attempt.target === 'src/quiet.go');
  assert.equal(row.status, 'success');
  assert.equal(row.extracted_count, 0);
  tree.dispose();
});

test('UT: [Error] a source file no grammar carries is not parsed with a default grammar', () => {
  const tree = createSyntheticTree({ 'src/notes.txt': 'no grammar carries this\n' }, { prefix: 'wsp-p24-2-unknown-' });
  const structure = measureStructure({ root: tree.root });
  assert.deepEqual(structure.attempts, [], 'a file outside the syntax population leaves no attempt row');
  assert.equal(syntaxLanguageOf('src/notes.txt'), 'unknown');
  // `EXTRACTOR_NOT_WRITTEN` is about a language the syntax layer reaches and no
  // extractor covers. A file no grammar carries is not one of those — it was
  // never in the population — and reporting it as an unextracted language would
  // describe a gap in the instrument where the file is simply not its material.
  assert.equal(
    structure.limitations.some((limitation) => limitation.code === 'EXTRACTOR_NOT_WRITTEN'),
    false,
    'a file outside the population is not a language the instrument failed to reach',
  );
  tree.dispose();
});

// ---------------------------------------------------------------------------
// C002 — the cell is partial, and the reason is that language's own
// ---------------------------------------------------------------------------

test('UT: [Normal] C002 precondition + postcondition — E1-E4 read partial for the six and name that language\'s invisible constructs', () => {
  for (const language of SIX) {
    for (const item of STRUCTURE_FAMILIES) {
      assert.equal(CAPABILITY_MATRIX[language][item], 'partial', `${language}/${item} must be partial, never success`);
    }
  }
  assert.equal(LANGUAGES_WITH_EXTRACTORS.E1.length, SIX.length);
  assert.match(reasonFor('typescript', 'E2'), /export \*/);
  assert.match(reasonFor('typescript', 'E3'), /merg/i);
  assert.match(reasonFor('javascript', 'E2'), /computed/i);
  assert.match(reasonFor('go', 'E2'), /build tag/i);
  assert.match(reasonFor('go', 'E3'), /embed/i);
  assert.match(reasonFor('python', 'E2'), /__getattr__/);
  assert.match(reasonFor('python', 'E3'), /metaclass/i);
  assert.match(reasonFor('c_cpp', 'E2'), /preprocessor/i);
  assert.match(reasonFor('rust', 'E2'), /macro-generated/i);
});

test('UT: [Normal] C002 invariant — the reasons for one item are pairwise distinct across the six languages', () => {
  for (const item of STRUCTURE_FAMILIES) {
    const reasons = new Set(SIX.map((language) => reasonFor(language, item)));
    assert.equal(reasons.size, SIX.length, `${item} must carry ${SIX.length} pairwise distinct reasons`);
  }
  const rendered = renderCapabilityReasonsMarkdown();
  for (const language of SIX) assert.ok(rendered.includes(language), `the rendered reasons must name ${language}`);
  const renderedRows = rendered.split('\n').slice(2);
  assert.equal(renderedRows.length, SIX.length);
  assert.equal(new Set(renderedRows).size, SIX.length, 'no two languages may share a rendered reason');
});

test('UT: [Error] C002 invariant — a declaration naming a language with no query row is a finding', () => {
  for (const item of STRUCTURE_FAMILIES) {
    const declared = [...LANGUAGES_WITH_EXTRACTORS[item]].sort();
    const withQueries = Object.keys(QUERIES_BY_LANGUAGE)
      .filter((language) => Boolean(QUERIES_BY_LANGUAGE[language][item]))
      .sort();
    assert.deepEqual(declared, withQueries, `${item} must name exactly the languages that carry a query row`);
  }
  const overclaimed = { ...LANGUAGES_WITH_EXTRACTORS, E5: ['rust', 'go'] };
  const withE5Query = Object.keys(QUERIES_BY_LANGUAGE)
    .filter((language) => Boolean(QUERIES_BY_LANGUAGE[language].E5))
    .sort();
  assert.notDeepEqual([...overclaimed.E5].sort(), withE5Query, 'an overclaiming declaration is a finding');
});

test('UT: [Boundary] C002 invariant — a family with no extractor reads not_attempted, which is not ran-and-found-nothing', () => {
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
  // P24-3 wrote the E5 and E6 extractors for the five, P24-4 did the same for
  // E7-E11, and P24-5 for E12 and E14, once each language's material had been
  // read over its own representative. E15 is where a family with no reader still
  // lives, and the boundary this test draws is asserted there: not_attempted is
  // this instrument declining to look, which is not the same record as a reader
  // that looked and found nothing.
  for (const language of NEW_FIVE) {
    assert.equal(CAPABILITY_MATRIX[language].E5, 'partial');
    assert.equal(CAPABILITY_MATRIX[language].E6, 'partial');
    assert.equal(CAPABILITY_MATRIX[language].E7, 'partial');
    assert.equal(CAPABILITY_MATRIX[language].E12, 'partial');
    assert.equal(CAPABILITY_MATRIX[language].E14, 'partial');
    assert.equal(CAPABILITY_MATRIX[language].E15, 'not_attempted');
    assert.notEqual(CAPABILITY_MATRIX[language].E15, CAPABILITY_MATRIX[language].E1);
  }
  const blank = createSyntheticTree({ 'src/empty.py': '' }, { prefix: 'wsp-p24-2-empty-' });
  const ledger = buildAttemptLedger(measureStructure({ root: blank.root }).attempts);
  assert.equal(ledger.extractedNothingCount, 1, 'a language whose extractor ran and found nothing is success/0');
  assert.equal(ledger.couldNotRunCount, 0);
  blank.dispose();
});

test('UT: [Invariant] no cell of the 96 reads success, and unsupported_in_principle is E13 alone', () => {
// [::TICKET::] P24-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-4 --for-spec --no-implementation-order`.
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
  const cells = TARGET_LANGUAGES.flatMap((language) => EXTRACTION_ITEMS.map((item) => [language, item, CAPABILITY_MATRIX[language][item]]));
  assert.equal(cells.length, TARGET_LANGUAGES.length * EXTRACTION_ITEMS.length);
  assert.deepEqual(cells.filter(([, , value]) => value === 'success').map(([language, item]) => `${language}/${item}`), []);
  assert.deepEqual(
    [...new Set(cells.filter(([, , value]) => value === 'unsupported_in_principle').map(([, item]) => item))],
    ['E13'],
  );
  // A family every language reaches carries a reason per language, because the
  // construct one language hides is not the construct another hides. E15 is what
  // a family no language reaches reads like: one shared reason, because there is
  // one fact to state — this instrument does not attempt it.
  assert.equal(
    capabilityNoteFor('c_cpp', 'E15'),
    capabilityNoteFor('go', 'E15'),
    'a family no language reaches carries one shared reason',
  );
  assert.notEqual(
    capabilityNoteFor('c_cpp', 'E12'),
    capabilityNoteFor('go', 'E12'),
    'E12 reaches the six, so its reason names each language\'s own invisible construct',
  );
  assert.notEqual(
    capabilityNoteFor('c_cpp', 'E7'),
    capabilityNoteFor('go', 'E7'),
    'a family the six reach carries a reason naming each language\'s own invisible construct',
  );
  assert.notEqual(
    capabilityNoteFor('c_cpp', 'E5'),
    capabilityNoteFor('go', 'E5'),
    'a family the six reach carries a reason naming each language\'s own hidden dependency form',
  );
});

// ---------------------------------------------------------------------------
// C003 — could-not-analyse and analysed-and-found-nothing stay apart
// ---------------------------------------------------------------------------

test('UT: [Error] C003 postcondition — a parse yielding error nodes records failed and increments files_with_error_nodes', () => {
  const broken = createSyntheticTree(
    { 'src/broken.rs': 'pub fn broken() -> &raw const u8 { 1 }\n' },
    { prefix: 'wsp-p24-2-broken-' },
  );
  const structure = measureStructure({ root: broken.root });
  const attempt = structure.attempts.find((row) => row.target === 'src/broken.rs');
  assert.equal(attempt.status, 'failed', 'a parse the grammar had to recover from could not be read whole');
  assert.ok(attempt.diagnostics.length > 0, 'the diagnostic names the construct the grammar recovered near');
  assert.equal(structure.coverage.files_with_error_nodes, 1);

  const blank = createSyntheticTree({ 'src/empty.rs': '' }, { prefix: 'wsp-p24-2-blank-' });
  const blankStructure = measureStructure({ root: blank.root });
  const blankRow = blankStructure.attempts.find((row) => row.target === 'src/empty.rs');
  assert.equal(blankRow.status, 'success', 'a clean parse that found nothing is not a failure');
  assert.equal(blankRow.extracted_count, 0);
  broken.dispose();
  blank.dispose();
});

test('UT: [Error] C003 invariant — the two counters move for their own fixture and not the other\'s, in both directions', () => {
  const failed = createSyntheticTree({ 'src/broken.rs': 'pub fn broken() -> &raw const u8 { 1 }\n' }, { prefix: 'wsp-p24-2-c1-' });
  const blank = createSyntheticTree({ 'src/empty.rs': '' }, { prefix: 'wsp-p24-2-c2-' });
  const failedLedger = buildAttemptLedger(measureStructure({ root: failed.root }).attempts);
  const blankLedger = buildAttemptLedger(measureStructure({ root: blank.root }).attempts);
  assert.equal(failedLedger.couldNotRunCount, 1, 'the error-node fixture is a could-not-run');
  assert.equal(failedLedger.extractedNothingCount, 0, 'and it is not a found-nothing');
  assert.equal(blankLedger.extractedNothingCount, 1, 'the empty fixture is a found-nothing');
  assert.equal(blankLedger.couldNotRunCount, 0, 'and it is not a could-not-run');
  failed.dispose();
  blank.dispose();
});

test('UT: [Error] C003 — a grammar that cannot be loaded names the load failure and produces no empty extraction', () => {
  const tree = createSyntheticTree({ 'src/lib.rs': 'pub fn f() {}\n' }, { prefix: 'wsp-p24-2-nogrammar-' });
  const structure = measureStructure({ root: tree.root, grammar: null });
  const row = structure.attempts.find((attempt) => attempt.target === 'src/lib.rs');
  assert.equal(row.status, 'failed');
  assert.equal(row.reason, 'grammar_unavailable');
  assert.equal(row.extracted_count, 0);
  assert.deepEqual(structure.packages, [], 'an unanalysable tree must not be reported as an analysed empty one');
  assert.ok(structure.limitations.some((limitation) => limitation.code === 'TREE_SITTER_GRAMMAR_ABSENT'));
  tree.dispose();
});

// ---------------------------------------------------------------------------
// Per-language constructs the frozen representatives do not carry
// ---------------------------------------------------------------------------

test('UT: [Normal] each language records its own conditional-compilation marker, not Rust\'s', () => {
  const goFile = 'pkg/widget/widget_linux.go';
  const go = parseRepresentativeFile('go', goFile);
  const goItems = collectPublicSurface('go', go.tree, goFile).concat(
    collectTypeDefinitions('go', go.tree, goFile).map((type) => ({ symbol: type.symbol, cfgGated: type.cfgGated })),
  );
  assert.equal(goItems.find((item) => item.symbol === 'linuxOnlyLabel'), undefined, 'an unexported name is not public surface');

  const goAllItems = measureRepresentative('go');
  assert.ok(
    goAllItems.publicItems.some((item) => item.symbol === 'Render' && item.cfgGated === false),
    'a file with no build tag is not gated',
  );

  const cCppFile = 'src/widget.cpp';
  const cCpp = parseRepresentativeFile('c_cpp', cCppFile);
  const separator = collectPublicSurface('c_cpp', cCpp.tree, cCppFile).find((item) => item.symbol === 'LABEL_SEPARATOR');
  assert.ok(separator, 'the macro inside #if is an item');
  assert.equal(separator.cfgGated, true, 'a C declaration inside #if is gated');

  const definition = collectPublicSurface('c_cpp', cCpp.tree, cCppFile).find((item) => item.symbol === 'widget_label');
  assert.equal(definition.cfgGated, false, 'a declaration after the #endif is not gated');

  const header = parseRepresentativeFile('c_cpp', 'src/widget.h');
  assert.equal(
    collectPublicSurface('c_cpp', header.tree, 'src/widget.h').find((item) => item.symbol === 'MAX_OF').cfgGated,
    true,
    'a declaration in a guarded header sits under a preprocessor conditional',
  );

  for (const language of ['typescript', 'javascript', 'python']) {
    const structure = measureRepresentative(language);
    assert.ok(
      [...structure.publicItems, ...structure.types].every((record) => record.cfgGated === false),
      `${language} has no conditional compilation and must not claim one`,
    );
  }
});

test('UT: [Normal] a Go declaration behind //go:build is recorded as gated', () => {
  const tree = createSyntheticTree(
    { 'pkg/w/base.go': 'package w\n\nfunc Shared() {}\n', 'pkg/w/linux.go': '//go:build linux\n\npackage w\n\nfunc LinuxOnly() {}\n' },
    { prefix: 'wsp-p24-2-buildtag-' },
  );
  const structure = measureStructure({ root: tree.root });
  assert.equal(structure.publicItems.find((item) => item.symbol === 'Shared').cfgGated, false);
  assert.equal(structure.publicItems.find((item) => item.symbol === 'LinuxOnly').cfgGated, true);
  tree.dispose();
});

test('UT: [Normal] E4 is exercised for each language over material carrying that language\'s error construct', () => {
  const fixtures = {
    typescript: { path: 'src/err.ts', line: 2, text: 'export enum ErrorKind { Ok, Bad }\nexport class ParseError extends Error {}\n' },
    javascript: { path: 'src/err.js', line: 1, text: 'class ParseError extends Error {}\nmodule.exports = { ParseError };\n' },
    go: { path: 'src/err.go', line: 3, text: 'package widget\n\ntype ParseError struct{}\n\nfunc (e ParseError) Error() string { return "" }\n' },
    python: { path: 'src/err.py', line: 1, text: 'class ParseError(Exception):\n    pass\n' },
    c_cpp: { path: 'src/err.h', line: 2, text: 'typedef struct ParseError { int code; } ParseError;\nenum ErrorCode { OK, ERR_IO };\n' },
  };
  for (const [language, fixture] of Object.entries(fixtures)) {
    const tree = createSyntheticTree({ [fixture.path]: fixture.text }, { prefix: `wsp-p24-2-e4-${language}-` });
    const structure = measureStructure({ root: tree.root });
    const errors = structure.errorTypes.filter((record) => record.file === fixture.path);
    assert.ok(errors.length > 0, `${language} must name its error type`);
    assert.deepEqual(fieldNames(errors), [...RECORD_FIELDS.E4], `${language} E4 shape`);
    for (const error of errors) {
      assert.match(error.symbol, /error/i, `${language} names a symbol that reads as an error`);
      assert.ok(error.signals.includes('name_matches_error'), `${language} carries the name signal`);
    }
    tree.dispose();
  }
});

test('UT: [Normal] an error enum is written with its variants, and a class-based error is not', () => {
  const tree = createSyntheticTree(
    { 'src/err.ts': 'export enum ErrorKind { Ok, Bad }\nexport class ParseError extends Error {}\n' },
    { prefix: 'wsp-p24-2-variants-' },
  );
  const structure = measureStructure({ root: tree.root });
  const kind = structure.errorTypes.find((error) => error.symbol === 'ErrorKind');
  const parse = structure.errorTypes.find((error) => error.symbol === 'ParseError');
  assert.deepEqual(kind.variants.map((variant) => variant.symbol), ['Ok', 'Bad']);
  assert.deepEqual(kind.variants.map((variant) => variant.line), [1, 1]);
  assert.deepEqual(parse.variants, [], 'a class carries no variants and must not borrow the enum\'s');
  tree.dispose();
});

test('UT: [Normal] a JavaScript class is a type definition, and E2 records the statement that publishes it', () => {
  const tree = createSyntheticTree(
    { 'src/err.js': 'class ParseError extends Error {}\nmodule.exports = { ParseError };\n' },
    { prefix: 'wsp-p24-2-jscee-' },
  );
  const structure = measureStructure({ root: tree.root });
  assert.ok(structure.types.some((type) => type.symbol === 'ParseError' && type.typeKind === 'class'));
  assert.ok(structure.publicItems.some((item) => item.symbol === 'ParseError' && item.file === 'src/err.js' && item.line === 2));
  tree.dispose();
});

// ---------------------------------------------------------------------------
// Behaviour preservation and the decision document
// ---------------------------------------------------------------------------

test('UT: [Characterization] the Rust reader produces the E2, E3 and E4 records it produced before this ticket', () => {
  const tree = createSyntheticTree(SYNTHETIC_CRATE, { prefix: 'wsp-p24-2-golden-' });
  const structure = measureStructure({ root: tree.root });
  assert.deepEqual(
    {
      publicItems: structure.publicItems,
      types: structure.types,
      errorTypes: structure.errorTypes,
    },
    {
      publicItems: RUST_GOLDEN.publicItems,
      types: RUST_GOLDEN.types,
      errorTypes: RUST_GOLDEN.errorTypes,
    },
    'the shared path must read Rust exactly as the Rust-only collectors did',
  );
  tree.dispose();
});

test('UT: [Normal] widening the declaration changes the package boundary only by the file the new extractor reaches', () => {
  const tree = createSyntheticTree(SYNTHETIC_CRATE, { prefix: 'wsp-p24-2-population-' });
  const structure = measureStructure({ root: tree.root });
  const widened = RUST_GOLDEN.packages.map((pkg) => (pkg.directory === '.'
    ? { ...pkg, files: [...pkg.files, 'wrapper.h'].sort() }
    : pkg));
  assert.deepEqual(
    structure.packages,
    widened,
    'the C/C++ extractor reaches wrapper.h, which was in the population and unextracted before',
  );
  tree.dispose();
});

test('UT: [Normal] Rust still produces E5 and E6 material, and the other five do not claim it', () => {
  const rust = measureRepresentative('rust');
  assert.ok(rust.uses.length > 0, 'Rust carries use declarations');
  const go = measureRepresentative('go');
  assert.deepEqual(go.uses, [], 'Go is not extracted for E5 in this version');
  assert.deepEqual(go.impls, [], 'Go is not extracted for E6 in this version');
});

test('UT: [Normal] the decision document carries the rendered matrix and the rendered reasons', () => {
  assert.ok(existsSync(ANALYSIS_TECH_DOC));
  const document = readFileSync(ANALYSIS_TECH_DOC, 'utf8');
  assert.ok(document.includes(renderCapabilityMatrixMarkdown()), 'the document must embed the rendered matrix verbatim');
  assert.ok(document.includes(renderCapabilityReasonsMarkdown()), 'the document must embed the rendered reasons verbatim');
  // P24-3's edge case turns on a reader of the recorded decision being able to
  // see that a JavaScript computed `require` is recorded by R2.5 as a mechanism
  // site and not by R2 as an edge. That statement lives in the E5 reason, so the
  // reason has to be in the document for the requirement to be met at all.
  assert.ok(
    document.includes(renderCouplingReasonsMarkdown()),
    'the document must embed the E5 and E6 reasons, which state which channel records a non-literal import',
  );
  assert.match(document, /mechanism site and not counted here/, 'the JavaScript E5 reason states the channel split by name');
});
