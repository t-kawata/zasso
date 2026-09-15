/**
 * The capability matrix, derived from the run's own analysis attempt ledger.
 *
 * The matrix used to be a pure function of the language name: the same cells
 * whatever the run did. That is why the Rust row went stale — a sentence written
 * before R3 through R6.5 existed was still being published after they had run,
 * because nothing connected the cell to the run. This module is that connection.
 *
 * Two vocabularies meet here and are kept apart by name. A ledger row carries an
 * **attempt status** — what the run did. A matrix cell carries a **capability
 * value** — how far the instrument reaches. Three of the five names are shared,
 * and the mapping is not the identity: a row with `status: 'success'` means the
 * run ran, and it never means the cell is `success`, because a syntax tree is
 * not the whole answer in any language.
 *
 * Nothing here is a verdict. A cell reading `not_attempted` says the run made no
 * attempt of that family for that language; it is never evidence that the
 * project lacks the thing being sought.
 */
import {
  CAPABILITY_VALUES,
  EXTRACTION_ITEMS,
  LANGUAGES_WITH_EXTRACTORS,
  TARGET_LANGUAGES,
} from './analysis-tech.mjs';
import { syntaxLanguageOf } from './structure.mjs';

/**
 * The tool spelling the per-language syntax layer records its attempts under.
 *
 * The layer's own name, with the language substituted, which is what makes a row
 * attributable to one language rather than to whichever language was read last.
 */
export const SYNTAX_LAYER_TOOL = 'tree-sitter-<language>';

/**
 * The tool spelling the semantic layer records its attempts under.
 *
 * It is keyed by language rather than named after one — `semantics.mjs` writes
 * one row per file under the bare name — so the language of these rows is read
 * from the target they name, and a row whose target names none is reported
 * rather than attributed to a default.
 */
export const SEMANTIC_LAYER_TOOL = 'tree-sitter';

/** The phase every family this module attributes attempts in. */
const PARSE_PHASE = 'parse';

/** The item whose cell is decided rather than measured. */
const DECIDED_ITEM = 'E13';

/**
 * How each family's attempts reach the ledger.
 *
 * A family absent from this table has no channel: the ledger records no attempt
 * for it, so its cell reads `not_attempted` in every run. That is a statement
 * about the ledger and not about the language, and it is the honest answer —
 * reporting a family as attempted because an *adjacent* family was would be
 * reading more from the ledger than the ledger says.
 */
export const FAMILY_CHANNELS = Object.freeze({
  E1: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E2: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E3: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E4: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E5: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E6: Object.freeze({ tool: SYNTAX_LAYER_TOOL, phase: PARSE_PHASE }),
  E7: Object.freeze({ tool: SEMANTIC_LAYER_TOOL, phase: PARSE_PHASE }),
  E8: Object.freeze({ tool: SEMANTIC_LAYER_TOOL, phase: PARSE_PHASE }),
  E9: Object.freeze({ tool: SEMANTIC_LAYER_TOOL, phase: PARSE_PHASE }),
  E10: Object.freeze({ tool: SEMANTIC_LAYER_TOOL, phase: PARSE_PHASE }),
  E11: Object.freeze({ tool: SEMANTIC_LAYER_TOOL, phase: PARSE_PHASE }),
});

/**
 * The cells carried from a recorded decision rather than computed from a run.
 *
 * E13 asks whether two programs are semantically equivalent, which is undecidable
 * for general programs. The instrument answers only the trivial, syntactic form,
 * so the cell is `unsupported_in_principle` in all six — a fact about
 * decidability, not about any run. Deriving it would replace a recorded decision
 * with whatever a run happened to do.
 */
export const CAPABILITY_DECISIONS = Object.freeze([
  Object.freeze({
    item: DECIDED_ITEM,
    value: 'unsupported_in_principle',
    languages: Object.freeze([...TARGET_LANGUAGES]),
    decision: 'semantic equivalence is undecidable for general programs; only trivial compiler-normalisation equivalence is ever claimed',
  }),
]);

/**
 * What each attempt status implies for a cell.
 *
 * `success` maps to `partial` and never to `success`: a syntactic channel is
 * never the whole answer, so a run that ran is a run about which nothing more
 * may be claimed. `skipped` maps to `not_attempted` because a skipped attempt is
 * an attempt not made — the boundary between the two statuses and the two values.
 */
export const ATTEMPT_TO_CAPABILITY = Object.freeze({
  success: 'partial',
  partial: 'partial',
  failed: 'failed',
  skipped: 'not_attempted',
});

/** The tool spelling a row carries for one language's syntax layer. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function syntaxToolFor(language) {
  return `tree-sitter-${language}`;
}

/** True when a tool spelling names the syntax layer at all, whatever language. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function isSyntaxLayerTool(tool) {
  return typeof tool === 'string' && tool.startsWith(`${SEMANTIC_LAYER_TOOL}-`);
}

/**
 * The language a row's attempt was made over, or null when the row names none.
 *
 * The tool is read first because it is what the row was recorded under; the
 * target is the fallback because the semantic layer keys by language through the
 * file it read. A row neither names is left unattributed rather than given to a
 * default, since a default would move a cell the attempt does not belong to.
 */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function languageOfRow(row) {
  const named = TARGET_LANGUAGES.find((language) => row.tool === syntaxToolFor(language));
  if (named !== undefined) return named;
  const byTarget = syntaxLanguageOf(row.target);
  return byTarget === 'unknown' ? null : byTarget;
}

/** True when a row's tool and phase are the channel one family's attempts use. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function rowIsOnChannel(row, channel, language) {
  if (row.phase !== channel.phase) return false;
  if (channel.tool === SEMANTIC_LAYER_TOOL) {
    return row.tool === SEMANTIC_LAYER_TOOL && languageOfRow(row) === language;
  }
  return row.tool === syntaxToolFor(language);
}

/** The rows each cell's value rests on, and the rows no cell could claim. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function attributeRows(ledger) {
  const byCell = new Map();
  const unattributable = [];

  for (const row of ledger.rows) {
    const language = languageOfRow(row);
    if (language === null) {
      if (isSyntaxLayerTool(row.tool)) {
        unattributable.push({
          row,
          reason: `${row.tool} names no language this instrument carries, and ${row.target} names none either, so this attempt was not attributed to any cell`,
        });
      }
      continue;
    }
    for (const item of EXTRACTION_ITEMS) {
      const channel = FAMILY_CHANNELS[item];
      if (channel === undefined || !rowIsOnChannel(row, channel, language)) continue;
      const key = `${language}/${item}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key).push(row);
    }
  }
  return { byCell, unattributable };
}

/** The value a cell's rows imply, and whether two of them disagree. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function valueFor(rows) {
  const holds = (capability) => rows.some((row) => ATTEMPT_TO_CAPABILITY[row.status] === capability);
  if (holds('failed')) return { value: 'failed', contradictory: holds('partial') };
  if (holds('partial')) return { value: 'partial', contradictory: false };
  return { value: 'not_attempted', contradictory: false };
}

/**
 * The matrix a run's own ledger derives, with each cell's source recorded.
 *
 * A cell the declaration does not cover stays `not_attempted` however many rows
 * exist: the declaration is what says a language has an extractor for a family,
 * and a row alone does not overturn it. A cell a decision covers is carried
 * rather than computed, and no row can move it.
 *
 * @param {{ledger: object, families: object, decisions: ReadonlyArray<object>}} params
 * @returns {object} the derived matrix, its sources, and the rows it could not place
 */
export function deriveCapabilityMatrix({
  ledger,
  families = LANGUAGES_WITH_EXTRACTORS,
  decisions = CAPABILITY_DECISIONS,
} = {}) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.rows)) {
    throw new Error('deriveCapabilityMatrix needs the attempt ledger a run produced; it was given none');
  }

  const { byCell, unattributable } = attributeRows(ledger);
  const decided = new Map();
  for (const decision of decisions) {
    for (const language of decision.languages) decided.set(`${language}/${decision.item}`, decision);
  }

  const matrix = {};
  const sources = {};
  const counts = Object.fromEntries(CAPABILITY_VALUES.map((value) => [value, 0]));
  const decisionsCarried = [];

  for (const language of TARGET_LANGUAGES) {
    matrix[language] = {};
    for (const item of EXTRACTION_ITEMS) {
      const key = `${language}/${item}`;
      const decision = decided.get(key);

      if (decision !== undefined) {
        matrix[language][item] = decision.value;
        sources[key] = { derivedFrom: 'decision', rows: [], contradictory: false, decision: decision.decision };
        decisionsCarried.push({ language, item, value: decision.value });
      } else if (!(families[item] ?? []).includes(language)) {
        matrix[language][item] = 'not_attempted';
        sources[key] = { derivedFrom: 'ledger', rows: [], contradictory: false, reason: 'the declaration carries no extractor for this language and family' };
      } else {
        const rows = byCell.get(key) ?? [];
        const { value, contradictory } = valueFor(rows);
        matrix[language][item] = value;
        sources[key] = { derivedFrom: 'ledger', rows, contradictory };
      }
      counts[matrix[language][item]] += 1;
    }
  }

  return {
    matrix,
    decisions: decisionsCarried,
    sources,
    unattributable,
    counts,
    // The ledger's emptiness is stated rather than left to be read off a matrix
    // of `not_attempted`: "the run attempted nothing" and "we have no record of
    // what it attempted" are different facts.
    empty: ledger.rows.length === 0,
  };
}

/**
 * The rows that decided one cell, for a reader who wants to check the value.
 *
 * @param {{language: string, item: string, ledger: object}} params
 * @returns {{language: string, item: string, derivedFrom: string, rows: ReadonlyArray<object>, contradictory: boolean}}
 */
export function explainCell({ language, item, ledger } = {}) {
  if (typeof language !== 'string' || typeof item !== 'string') {
    throw new Error('explainCell needs the language and the item it explains');
  }
  const derived = deriveCapabilityMatrix({ ledger });
  const source = derived.sources[`${language}/${item}`];
  return {
    language,
    item,
    value: derived.matrix[language]?.[item] ?? null,
    derivedFrom: source.derivedFrom,
    rows: source.rows,
    contradictory: source.contradictory,
  };
}

/**
 * The matrix as the Markdown a reader of the report reads.
 *
 * The paragraph under the table is not decoration. A cell that reads
 * `not_attempted` states what this instrument did not do, and a reader who takes
 * it for a fact about the project has been misled by the table rather than by
 * its contents — so the table says which it is, in the table's own words.
 *
 * @param {object} matrix - the derived matrix
 * @param {{explain: Function}} params - how to reach a cell's rows
 * @returns {string} the rendered section
 */
export function renderDerivedMatrixMarkdown(matrix, { explain } = {}) {
  if (typeof explain !== 'function') {
    throw new Error('renderDerivedMatrixMarkdown needs the cell explanation, so the table states what decided each cell');
  }

  const lines = [
    '| Extraction item | ' + TARGET_LANGUAGES.join(' | ') + ' |',
    '|---|' + TARGET_LANGUAGES.map(() => '---').join('|') + '|',
  ];
  let cellsWithRows = 0;
  for (const item of EXTRACTION_ITEMS) {
    const cells = TARGET_LANGUAGES.map((language) => {
      const explanation = explain({ language, item });
      if (explanation.rows.length > 0) cellsWithRows += 1;
      return matrix[language][item];
    });
    lines.push(`| ${item} | ${cells.join(' | ')} |`);
  }

  lines.push(
    '',
    cellsWithRows === 0
      ? 'The attempt ledger this matrix was derived from is empty: no cell above rests on an attempt, and the '
        + 'values state that rather than stating that the instrument attempted nothing.'
      : `Derived from this run's own attempt ledger; ${cellsWithRows} cell(s) rest on at least one recorded attempt.`,
    '',
    'A gap here is a limitation of the instrument, not evidence about the project. A cell reading '
      + '`not_attempted` states that this run made no attempt of that family for that language; it is never '
      + 'a statement that the project lacks the thing being sought.',
  );
  return lines.join('\n');
}
