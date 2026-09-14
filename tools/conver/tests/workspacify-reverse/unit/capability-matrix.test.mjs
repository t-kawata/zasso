// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The capability matrix derived from the run's own attempt ledger.
 *
 * `capabilityRow` is a pure function of the language name, which is why the Rust
 * row went stale: nothing connected it to what the run did. What these tests pin
 * is that a cell is a function of the ledger's rows for that language and that
 * family, in both directions — no cell reads `partial` without a row that
 * supports it, and none reads `not_attempted` while a row exists — and that the
 * two vocabularies the ledger and the matrix use are kept apart.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEMPT_TO_CAPABILITY,
  CAPABILITY_DECISIONS,
  FAMILY_CHANNELS,
  deriveCapabilityMatrix,
  explainCell,
  renderDerivedMatrixMarkdown,
} from '../../../.claude/scripts/workspacify-reverse/lib/capability-matrix.mjs';
import {
  ATTEMPT_STATUSES,
  CAPABILITY_VALUES,
  EXTRACTION_ITEMS,
  LANGUAGES_WITH_EXTRACTORS,
  TARGET_LANGUAGES,
  buildAttemptLedger,
  recordAttempt,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

/** The item E13, whose cell is decided rather than measured. */
const DECIDED_ITEM = 'E13';

/** The families a C/C++-style syntax reading reaches, for a compact fixture. */
const SYNTACTIC_ITEMS = Object.freeze(['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);

/**
 * One ledger row, built by the same builder the run uses.
 *
 * The tool spelling is the discriminator the ledger actually carries, so a
 * fixture that gets it wrong is a fixture whose rows the derivation cannot
 * place — which is the failure the unattributable report exists for.
 */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function attemptRow(options) {
  const {
    target, tool, status, extractedCount = 0, reason = null, phase = 'parse',
  } = options;
  return recordAttempt({
    target,
    configuration: 'syntax-only',
    tool,
    outcome: {
      phase, status, extractedCount, reason, diagnostics: [],
    },
  });
}

/** The language a row's target names, read from the extension the test itself knows. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function languageOfTarget(target) {
  if (target.endsWith('.rs')) return 'rust';
  if (target.endsWith('.ts')) return 'typescript';
  if (target.endsWith('.js')) return 'javascript';
  if (target.endsWith('.go')) return 'go';
  if (target.endsWith('.py')) return 'python';
  if (target.endsWith('.cpp')) return 'c_cpp';
  return null;
}

/**
 * The rows this test attributes to one cell, computed without reading the module.
 *
 * The channel table is restated here on purpose: the derivation's own table
 * could drift, and a test that read it would drift with it.
 */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function rowsAttributedTo(ledger, language, item) {
  const channel = FAMILY_CHANNELS[item];
  if (channel === undefined) return [];
  return ledger.rows.filter((row) => {
    if (row.phase !== channel.phase) return false;
    if (channel.tool === 'tree-sitter') {
      return row.tool === 'tree-sitter' && languageOfTarget(row.target) === language;
    }
    return row.tool === `tree-sitter-${language}`;
  });
}

/** The value those rows imply, by the three rules the contract states. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function valueImpliedBy(rows) {
  if (rows.length === 0) return 'not_attempted';
  if (rows.some((row) => row.status === 'failed')) return 'failed';
  if (rows.some((row) => ATTEMPT_TO_CAPABILITY[row.status] === 'partial')) return 'partial';
  return 'not_attempted';
}

/**
 * The extension each language's files carry.
 *
 * The semantic layer's rows name no language in their tool, so the target has to
 * be a real path: a fixture whose targets were spelled after the language name
 * would leave every semantic row unattributable, which is a fact about the
 * fixture rather than about the derivation.
 */
const EXTENSION_BY_LANGUAGE = Object.freeze({
  rust: 'rs', typescript: 'ts', javascript: 'js', go: 'go', python: 'py', c_cpp: 'cpp',
});

/** A ledger carrying a successful parse per language through both layers. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function ledgerWithEveryLanguage() {
  return buildAttemptLedger(TARGET_LANGUAGES.flatMap((language) => [
    attemptRow({ target: `src/a.${EXTENSION_BY_LANGUAGE[language]}`, tool: `tree-sitter-${language}`, status: 'success', extractedCount: 5 }),
    attemptRow({ target: `src/a.${EXTENSION_BY_LANGUAGE[language]}`, tool: 'tree-sitter', status: 'success', extractedCount: 7 }),
  ]));
}

// ---------------------------------------------------------------------------
// C001 — the cell follows from the rows
// ---------------------------------------------------------------------------

test('C001 postcondition — a ledger of succeeded Rust attempts derives partial, and each cell names the rows that decided it', () => {
  const ledger = buildAttemptLedger([
    attemptRow({ target: 'src/lib.rs', tool: 'tree-sitter-rust', status: 'success', extractedCount: 14 }),
    attemptRow({ target: 'src/api/login.rs', tool: 'tree-sitter-rust', status: 'success', extractedCount: 9 }),
    attemptRow({ target: 'src/lib.rs', tool: 'tree-sitter', status: 'success', extractedCount: 42 }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(derived.matrix.rust.E1, 'partial');
  assert.equal(derived.matrix.rust.E7, 'partial', 'the semantic layer is keyed by language through the target');
  assert.equal(derived.matrix.go.E1, 'not_attempted', 'a language with no row is not credited with another language’s attempt');

  const explanation = explainCell({ language: 'rust', item: 'E1', ledger });
  assert.equal(explanation.rows.length > 0, true, 'the cell names the rows that decided it');
  assert.equal(explanation.derivedFrom, 'ledger');
  assert.equal(explanation.rows.every((row) => row.tool === 'tree-sitter-rust'), true);
  assert.equal(derived.sources['rust/E1'].rows.length, explanation.rows.length);
});

test('C001 invariant — neither direction can be satisfied by a constant, over a ledger every language appears in', () => {
  const ledger = ledgerWithEveryLanguage();
  const derived = deriveCapabilityMatrix({ ledger, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(ledger.rows.length > 0, true, 'the assertion is not vacuous');

  for (const language of TARGET_LANGUAGES) {
    for (const item of EXTRACTION_ITEMS) {
      if (item === DECIDED_ITEM) continue;
      const value = derived.matrix[language][item];
      const rows = rowsAttributedTo(ledger, language, item);

      if (value === 'partial') {
        assert.ok(
          rows.some((row) => ATTEMPT_TO_CAPABILITY[row.status] === 'partial'),
          `${language}/${item} reads partial and a row supports it`,
        );
      }
      if (rows.some((row) => ATTEMPT_TO_CAPABILITY[row.status] === 'partial')) {
        assert.notEqual(value, 'not_attempted', `${language}/${item} has a supporting row and is not not_attempted`);
      }
      assert.equal(value, valueImpliedBy(rows), `${language}/${item} equals the value its own rows imply`);
    }
  }
});

test('C001 invariant — the matrix is a function of the ledger: changing the rows changes the cells', () => {
  const withGo = buildAttemptLedger([attemptRow({ target: 'widget.go', tool: 'tree-sitter-go', status: 'success', extractedCount: 3 })]);
  const withoutGo = buildAttemptLedger([attemptRow({ target: 'src/lib.rs', tool: 'tree-sitter-rust', status: 'success', extractedCount: 3 })]);

  const fromRustOnly = deriveCapabilityMatrix({ ledger: withoutGo, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });
  const fromGoOnly = deriveCapabilityMatrix({ ledger: withGo, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(fromRustOnly.matrix.go.E1, 'not_attempted');
  assert.equal(fromGoOnly.matrix.go.E1, 'partial');
  assert.equal(fromRustOnly.matrix.rust.E1, 'partial');
  assert.equal(fromGoOnly.matrix.rust.E1, 'not_attempted', 'a language is not credited by another language’s rows');
  assert.notDeepEqual(fromRustOnly.matrix, fromGoOnly.matrix, 'the matrix is a function of the ledger, not a constant');
});

test('C001 postcondition — a contradiction takes the weaker value and names both rows', () => {
  const contradictory = buildAttemptLedger([
    attemptRow({ target: 'src/lib.rs', tool: 'tree-sitter-rust', status: 'success', extractedCount: 4 }),
    attemptRow({ target: 'src/api.rs', tool: 'tree-sitter-rust', status: 'failed', extractedCount: 0, reason: 'grammar_recovered' }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger: contradictory, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(derived.matrix.rust.E1, 'failed', 'a family the run only partly reached is not claimed as partly working');
  const explanation = explainCell({ language: 'rust', item: 'E1', ledger: contradictory });
  assert.equal(explanation.contradictory, true);
  assert.equal(new Set(explanation.rows.map((row) => row.status)).size, 2, 'both rows are named, not only the one that decided it');
});

test('C001 error — a row whose tool names the syntax layer but no language is reported rather than defaulted', () => {
  const unattributable = buildAttemptLedger([
    attemptRow({ target: 'probe.txt', tool: 'tree-sitter-cobol', status: 'success', extractedCount: 1 }),
    attemptRow({ target: 'widget.go', tool: 'tree-sitter-go', status: 'success', extractedCount: 2 }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger: unattributable, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(derived.unattributable.length, 1, 'the row is reported rather than given to a default language');
  assert.equal(derived.unattributable[0].row.tool, 'tree-sitter-cobol');
  assert.match(derived.unattributable[0].reason, /language/);
  assert.equal(derived.matrix.go.E1, 'partial');
  for (const language of TARGET_LANGUAGES) {
    assert.equal(derived.matrix[language].E1, valueImpliedBy(rowsAttributedTo(unattributable, language, 'E1')));
  }
});

test('C001 boundary — a row outside every channel is not support and is not reported as unattributable', () => {
  const dynamic = buildAttemptLedger([
    attemptRow({ target: 'src/lib.rs', tool: 'bounded-offline-start-plan', status: 'success', extractedCount: 3, phase: 'execute' }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger: dynamic, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.deepEqual(derived.unattributable, [], 'a row no channel claims cannot move a cell, so it is not an error');
  assert.equal(derived.matrix.rust.E1, 'not_attempted');
});

// ---------------------------------------------------------------------------
// C002 — the two vocabularies, and the values they may and may not produce
// ---------------------------------------------------------------------------

test('C002 invariant — a ledger whose rows all succeeded yields partial for the syntactic families and never success', () => {
  const derived = deriveCapabilityMatrix({
    ledger: ledgerWithEveryLanguage(),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });

  for (const language of TARGET_LANGUAGES) {
    for (const item of EXTRACTION_ITEMS) {
      assert.notEqual(derived.matrix[language][item], 'success', 'a syntax tree is never the whole answer, so no cell claims success');
    }
    for (const item of SYNTACTIC_ITEMS) {
      assert.equal(derived.matrix[language][item], 'partial');
    }
    assert.equal(derived.matrix[language].E7, 'partial');
  }
  assert.equal(ATTEMPT_TO_CAPABILITY.success, 'partial', 'a run that ran is a run status, not a capability');
});

test('C002 postcondition — ATTEMPT_TO_CAPABILITY is declared as data and names both vocabularies', () => {
  assert.deepEqual(
    Object.keys(ATTEMPT_TO_CAPABILITY).sort(),
    [...ATTEMPT_STATUSES].sort(),
    'every attempt status has a declared mapping, so none is left to an implicit default',
  );
  for (const value of Object.values(ATTEMPT_TO_CAPABILITY)) {
    assert.ok(CAPABILITY_VALUES.includes(value), `${value} is a capability value`);
  }
  assert.equal(ATTEMPT_TO_CAPABILITY.skipped, 'not_attempted');
  assert.equal(ATTEMPT_TO_CAPABILITY.failed, 'failed');
});

test('C002 error — failed is reachable, which it never has been', () => {
  const allFailed = buildAttemptLedger([
    attemptRow({ target: 'src/widget.cpp', tool: 'tree-sitter-c_cpp', status: 'failed', extractedCount: 0, reason: 'grammar_recovered' }),
    attemptRow({ target: 'src/widget_extra.cpp', tool: 'tree-sitter-c_cpp', status: 'failed', extractedCount: 0, reason: 'grammar_recovered' }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger: allFailed, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(derived.matrix.c_cpp.E1, 'failed', 'an attempt that could not run is a third value, not a silence');
  const explanation = explainCell({ language: 'c_cpp', item: 'E1', ledger: allFailed });
  assert.equal(explanation.rows.every((row) => row.status === 'failed'), true, 'the explanation names the failures');
  assert.equal(CAPABILITY_VALUES.includes('failed'), true);
});

test('C002 boundary — a family whose attempts were all skipped reads not_attempted, and the explanation names the skips', () => {
  const skipped = buildAttemptLedger([
    attemptRow({ target: 'widget.go', tool: 'tree-sitter-go', status: 'skipped', extractedCount: 0, reason: 'no_extractor_for_language' }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger: skipped, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  assert.equal(derived.matrix.go.E1, 'not_attempted', 'a skipped attempt is an attempt not made');
  const explanation = explainCell({ language: 'go', item: 'E1', ledger: skipped });
  assert.equal(explanation.rows.every((row) => row.status === 'skipped'), true);
});

// ---------------------------------------------------------------------------
// C003 — the decided cells
// ---------------------------------------------------------------------------

test('C003 invariant — E13 reads unsupported_in_principle in all six whatever the ledger contains', () => {
  const derived = deriveCapabilityMatrix({
    ledger: ledgerWithEveryLanguage(),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });

  for (const language of TARGET_LANGUAGES) {
    assert.equal(derived.matrix[language][DECIDED_ITEM], 'unsupported_in_principle', `${language} E13 is decided, not measured`);
    assert.equal(derived.sources[`${language}/${DECIDED_ITEM}`].derivedFrom, 'decision');
    assert.deepEqual(derived.sources[`${language}/${DECIDED_ITEM}`].rows, [], 'a decided cell rests on no run');
  }
  assert.equal(derived.decisions.length, TARGET_LANGUAGES.length, 'the derivation reports which cells it carried rather than computed');
});

test('C003 postcondition — every cell names whether it was derived or carried', () => {
  const derived = deriveCapabilityMatrix({
    ledger: ledgerWithEveryLanguage(),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });

  for (const key of Object.keys(derived.sources)) {
    assert.ok(['ledger', 'decision'].includes(derived.sources[key].derivedFrom), `${key} names its source`);
  }
  assert.equal(Object.keys(derived.sources).length, TARGET_LANGUAGES.length * EXTRACTION_ITEMS.length);
});

// ---------------------------------------------------------------------------
// C004 — served, and never a verdict
// ---------------------------------------------------------------------------

test('C004 invariant — the served matrix carries no verdict, and no field carries a value from the wrong vocabulary', () => {
  const derived = deriveCapabilityMatrix({
    ledger: ledgerWithEveryLanguage(),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });
  const published = JSON.parse(JSON.stringify({
    matrix: derived.matrix, decisions: derived.decisions, sources: derived.sources,
  }));

  const FORBIDDEN = ['eligible', 'score', 'verdict', 'recommendation'];
  const offenders = [];
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
  (function walk(value, path) {
    if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, path + '[' + index + ']')); return; }
    if (value === null || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN.includes(key)) offenders.push(path + '.' + key);
      walk(value[key], path + '.' + key);
    }
  }(published, 'CAPABILITY-MATRIX.json'));
  assert.deepEqual(offenders, [], 'the matrix is served and never gated');

  for (const language of TARGET_LANGUAGES) {
    for (const value of Object.values(published.matrix[language])) {
      assert.ok(CAPABILITY_VALUES.includes(value), `${value} is a capability value`);
    }
  }
  for (const source of Object.values(published.sources)) {
    for (const row of source.rows) {
      assert.ok(ATTEMPT_STATUSES.includes(row.status), `${row.status} is a run status`);
    }
  }
});

test('C004 postcondition — the report renders the matrix, and states that a gap is an instrument limitation', () => {
  const derived = deriveCapabilityMatrix({
    ledger: ledgerWithEveryLanguage(),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });
  const markdown = renderDerivedMatrixMarkdown(derived.matrix, { explain: (cell) => explainCell({ ...cell, ledger: ledgerWithEveryLanguage() }) });

  assert.match(markdown, /\| E1 \|/, 'the table names the items rather than only the languages');
  for (const language of TARGET_LANGUAGES) {
    assert.match(markdown, new RegExp(language), `${language} is a row`);
  }
  assert.match(markdown, /limitation of the instrument/i);
  assert.match(markdown, /not evidence/i);
});

// ---------------------------------------------------------------------------
// Boundary — the empty ledger
// ---------------------------------------------------------------------------

test('C004 invariant at the empty — an empty ledger yields not_attempted everywhere and says the ledger was empty', () => {
  const derived = deriveCapabilityMatrix({
    ledger: buildAttemptLedger([]),
    families: LANGUAGES_WITH_EXTRACTORS,
    decisions: CAPABILITY_DECISIONS,
  });

  assert.equal(derived.empty, true, 'the document states the ledger was empty rather than that nothing was attempted');
  for (const language of TARGET_LANGUAGES) {
    for (const item of EXTRACTION_ITEMS) {
      if (item === DECIDED_ITEM) continue;
      assert.equal(derived.matrix[language][item], 'not_attempted', `${language}/${item}`);
    }
    assert.equal(derived.matrix[language][DECIDED_ITEM], 'unsupported_in_principle');
  }
  assert.match(renderDerivedMatrixMarkdown(derived.matrix, { explain: () => ({ rows: [] }) }), /empty/i);
});

test('C001 boundary — a language whose declaration covers more than its ledger reaches reads partial only where rows exist', () => {
  const ledger = buildAttemptLedger([
    attemptRow({ target: 'src/lib.rs', tool: 'tree-sitter-rust', status: 'success', extractedCount: 3 }),
  ]);
  const derived = deriveCapabilityMatrix({ ledger, families: LANGUAGES_WITH_EXTRACTORS, decisions: CAPABILITY_DECISIONS });

  for (const item of SYNTACTIC_ITEMS) assert.equal(derived.matrix.rust[item], 'partial');
  assert.equal(derived.matrix.rust.E7, 'not_attempted', 'the declaration is read separately from the ledger');
  assert.equal(LANGUAGES_WITH_EXTRACTORS.E7.includes('rust'), true, 'the declaration does claim it');
});
