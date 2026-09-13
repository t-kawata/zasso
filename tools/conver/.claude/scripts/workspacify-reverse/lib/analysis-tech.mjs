// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * The analysis instrument: its read-only collection layer, and its declaration.
 *
 * The declared architecture has four layers, and this module is two of them.
 * Layer A — file enumeration and the discovery of language, configuration and
 * build descriptions — lives here because every later layer reads the same
 * population and no two of them may disagree about what the project's own
 * source is. Layer D's declaration also lives here: the capability matrix, the
 * adapter output contract and the attempt ledger.
 *
 * This module is the machine-readable half of `docs/P22-ANALYSIS-TECH.md`, and
 * the two are held together by a test: the document must contain the rendered
 * capability matrix verbatim, so the prose and the code cannot drift apart.
 *
 * The design's rule is that a machine may only ever say "proved" or "not
 * proved", and that a capability gap is published as a property of the
 * instrument rather than hidden. That is why every cell of the matrix carries
 * one of five values rather than a boolean, and why `unsupported_in_principle`
 * is a legal and expected entry: "this instrument does not attempt it" and "no
 * instrument can do this" are different claims, and merging them would allow
 * a gap to read as an absence of the thing sought (failure F12).
 *
 * The matrix describes the instrument as declared, not the run. A cell may
 * therefore read `not_attempted` while the adapter that would fill it is the
 * work of a later ticket; the note attached to each cell says which.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { DEPENDENCY_DIRECTORY_NAMES, NEVER_WALKED_DIRECTORY_NAMES, compareText } from './holdout-ledger.mjs';

/**
 * Directories whose contents are recorded as `out_of_scope` rather than
 * measured. Declared once, so the structure and dependency measurements cannot
 * disagree about what the project's own source is.
 */
export const EXCLUSION_RULES = Object.freeze([
  ...NEVER_WALKED_DIRECTORY_NAMES,
  ...DEPENDENCY_DIRECTORY_NAMES,
]);

/**
 * The one directory name the record does not enumerate at all.
 *
 * `.git` holds the version-control database, which is machinery about the
 * project rather than an artefact of it. Everything else inside an excluded
 * directory is still enumerated and marked `out_of_scope`, because "we did not
 * measure it" must remain distinguishable from "it is not there".
 */
export const NOT_ENUMERATED_DIRECTORY_NAMES = Object.freeze(['.git']);

/** The six target languages, in the order the capability matrix renders them. */
export const TARGET_LANGUAGES = Object.freeze([
  'rust',
  'typescript',
  'javascript',
  'go',
  'python',
  'c_cpp',
]);

/**
 * The extraction items E1-E16, exactly as the design enumerates them.
 *
 * They are named here rather than in prose because the matrix is verified by
 * counting keys: a cell that quietly disappeared must fail a test, and it
 * cannot do that if the item list lives only in a document.
 */
export const EXTRACTION_ITEMS = Object.freeze(
  Array.from({ length: 16 }, (_, index) => `E${index + 1}`),
);

/** The five values a matrix cell may carry. No boolean, and no sixth value. */
export const CAPABILITY_VALUES = Object.freeze([
  'success',
  'partial',
  'not_attempted',
  'failed',
  'unsupported_in_principle',
]);

/**
 * How complete an analysis was, from the weakest to the strongest.
 *
 * `syntax_only` means the source text and its syntax tree were read and
 * nothing more, which is what this ticket's instrument produces. A language
 * adapter that cannot resolve its configuration must lower this value rather
 * than emit a thin result indistinguishable from a complete one.
 */
export const ANALYSIS_MODES = Object.freeze([
  'syntax_only',
  'partial_semantic',
  'configured_semantic',
  'runtime',
]);

/** The counters every adapter reports, so "found nothing" has a shape. */
export const COVERAGE_FIELDS = Object.freeze([
  'files_discovered',
  'files_parsed',
  'files_with_error_nodes',
  'files_semantically_resolved',
  'configs_enumerated',
  'configs_analyzed',
]);

/**
 * The phases an analysis attempt passes through, weakest first.
 *
 * `execute` is last because it is the strongest: every phase before it reads
 * the text, and a run is the only one that observes what the text becomes. The
 * dynamic channel's attempt is recorded there, so "the instrument ran the
 * subject" and "the instrument read it" are told apart in the one ledger.
 */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
export const ATTEMPT_PHASES = Object.freeze([
  'parse',
  'preprocess',
  'name_resolution',
  'typecheck',
  'cfg',
  'dataflow',
  'execute',
]);

/** The statuses an analysis attempt may end in. */
export const ATTEMPT_STATUSES = Object.freeze(['success', 'partial', 'failed', 'skipped']);

/**
 * Where a fact was read from.
 *
 * `source_static` is a fact read from the source text or its syntax tree.
 * Runtime behaviour, dynamic dispatch targets, post-preprocessing composition
 * and generated code are not observable this way, so a proposition that depends
 * on one of them cannot be `observed` on `source_static` evidence alone.
 */
export const EVIDENCE_MODES = Object.freeze(['source_static', 'build_semantic', 'runtime_dynamic']);

/** The syntax layer this instrument uses, and the languages it carries a grammar for. */
const SYNTAX_LAYER = 'tree-sitter';

/** The E items this ticket's syntax layer measures. The rest are later work. */
const MEASURED_BY_SYNTAX_LAYER = Object.freeze(['E1', 'E2', 'E3', 'E4', 'E5', 'E6']);

/**
 * Why a cell carries the value it does.
 *
 * Kept beside the matrix rather than inside it so a cell stays a single value
 * — a matrix entry that could hold a value *and* a qualifier would invite
 * reading the qualifier as a softener of the value.
 */
const CAPABILITY_NOTES = Object.freeze({
  'rust/E1-E6':
    'Measured by this ticket through tree-sitter-rust. Syntax alone: module declarations, item declarations, use declarations and mechanism markers are read; macro-generated items and cfg-selected composition are not resolved.',
  'rust/E7-E16':
    'Not attempted by this instrument version. R3 and later stages consume these, and the semantic adapters they need are declared but not built here.',
  '*/*':
    'Grammar installed and declared, adapter not yet written. The syntax layer reaches this language; this ticket does not.',
  '*/E13':
    'Semantic equivalence is undecidable for general programs. E13 is TCE — trivial, syntactic, compiler-normalisation equivalence — and only that is ever claimed.',
});

/** Every language shares the same reason for an item this ticket does not attempt. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function noteFor(language, item) {
  if (item === 'E13') return CAPABILITY_NOTES['*/E13'];
  if (language === 'rust') {
    return MEASURED_BY_SYNTAX_LAYER.includes(item)
      ? CAPABILITY_NOTES['rust/E1-E6']
      : CAPABILITY_NOTES['rust/E7-E16'];
  }
  return CAPABILITY_NOTES['*/*'];
}

/**
 * One language's row: a value and a reason for every extraction item.
 *
 * Rust carries `partial` for the items the syntax layer measures because a
 * syntax tree is genuinely not the whole answer — a `pub fn` is public surface,
 * but a `pub use` re-export and a macro-generated function are public surface
 * this layer cannot see. Claiming `success` would overclaim, which is the one
 * thing the instrument may not do.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function capabilityRow(language) {
  const row = {};
  for (const item of EXTRACTION_ITEMS) {
    if (item === 'E13') {
      row[item] = 'unsupported_in_principle';
    } else if (language === 'rust' && MEASURED_BY_SYNTAX_LAYER.includes(item)) {
      row[item] = 'partial';
    } else {
      row[item] = 'not_attempted';
    }
  }
  return row;
}

/**
 * The capability matrix: every target language against every extraction item.
 *
 * A gap here is a limitation of the instrument. It is not evidence that the
 * thing sought is absent from the project being analysed, and no consumer of
 * this matrix may read it that way.
 */
export const CAPABILITY_MATRIX = Object.freeze(
  Object.fromEntries(TARGET_LANGUAGES.map((language) => [language, Object.freeze(capabilityRow(language))])),
);

/**
 * Every cell that is not `success`, with the reason it is not.
 *
 * @returns {Array<{language: string, item: string, value: string, reason: string, readsAs: string}>}
 */
export function findCapabilityGaps(matrix = CAPABILITY_MATRIX) {
  const gaps = [];
  for (const language of TARGET_LANGUAGES) {
    for (const item of EXTRACTION_ITEMS) {
      const value = matrix[language]?.[item];
      if (value === undefined || value === 'success') continue;
      gaps.push({
        language,
        item,
        value,
        reason: noteFor(language, item),
        // A gap says what this instrument did not do. It never says that the
        // project lacks the thing being sought.
        readsAs: 'instrument_limitation',
      });
    }
  }
  return gaps;
}

/** The matrix as a Markdown table, rendered from the same constant the tests count. */
export function renderCapabilityMatrixMarkdown(matrix = CAPABILITY_MATRIX) {
  const header = `| Extraction item | ${TARGET_LANGUAGES.join(' | ')} |`;
  const divider = `|---|${TARGET_LANGUAGES.map(() => '---').join('|')}|`;
  const rows = EXTRACTION_ITEMS.map(
    (item) => `| ${item} | ${TARGET_LANGUAGES.map((language) => matrix[language][item]).join(' | ')} |`,
  );
  return [header, divider, ...rows].join('\n');
}

/**
 * Refuse a limitation that does not say what it limits and how.
 *
 * A limitation naming no code cannot be referred to, one naming no scope
 * cannot be bounded, and one naming no effect cannot be weighed against the
 * conclusion it qualifies. Any of the three missing makes the entry noise.
 */
export function validateLimitation(limitation) {
  const code = limitation?.code;
  const scope = limitation?.scope;
  const effect = limitation?.effect;
  if (typeof code !== 'string' || code.trim().length === 0) {
    throw new Error('a limitation must name a code, so that it can be referred to');
  }
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    throw new Error(`limitation ${code} must name a scope, so that it can be bounded`);
  }
  if (typeof effect !== 'string' || effect.trim().length === 0) {
    throw new Error(`limitation ${code} must name the effect it has on the conclusion`);
  }
  return limitation;
}

/**
 * One row of the analysis attempt ledger.
 *
 * The ledger exists to separate "analysed and found nothing" from "could not
 * analyse". Without it `extracted_count: 0` means both and therefore neither,
 * which is the shape silent degradation takes.
 *
 * The attempt is what was tried — a target, under a configuration, by a tool —
 * and the outcome is how it went. Keeping the two apart in the signature is
 * what stops a caller from filling in a phase and a status that describe
 * different attempts.
 *
 * `status` defaults to `skipped` rather than `success`: a row created without
 * saying what happened has not earned the stronger claim.
 */
export function recordAttempt({ target, configuration, tool = 'unknown', outcome = {} }) {
  const {
    phase = 'parse',
    status = 'skipped',
    diagnostics = [],
    extractedCount = 0,
    reason = null,
  } = outcome;

  if (typeof target !== 'string' || target.length === 0) {
    throw new Error('an analysis attempt must name its target');
  }
  if (typeof configuration !== 'string' || configuration.length === 0) {
    throw new Error(`the attempt on ${target} must name the configuration it was made under`);
  }
  if (!ATTEMPT_PHASES.includes(phase)) {
    throw new Error(`unknown analysis phase ${phase} for ${target}`);
  }
  if (!ATTEMPT_STATUSES.includes(status)) {
    throw new Error(`unknown analysis status ${status} for ${target}`);
  }
  return {
    target,
    configuration,
    tool,
    phase,
    status,
    diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
    extracted_count: extractedCount,
    reason,
  };
}

/**
 * The ledger, with the two counts that make its purpose legible at a glance.
 *
 * `extractedNothingCount` and `couldNotRunCount` are reported separately
 * because a reader who sees only one number cannot tell a quiet project from a
 * broken analyser, and the whole reason the ledger exists is to tell those
 * apart.
 */
export function buildAttemptLedger(rows) {
  return {
    rows: rows.map((row) => ({ ...row })),
    extractedNothingCount: rows.filter((row) => row.status === 'success' && row.extracted_count === 0).length,
    couldNotRunCount: rows.filter((row) => row.status === 'failed').length,
  };
}

/**
 * Refuse an adapter result that does not carry the three-part contract.
 *
 * A bare extraction list is the failure this guards: it cannot be told apart
 * from a complete result that happened to find little, so it is rejected
 * rather than accepted and interpreted.
 */
export function assertAdapterResult(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('an adapter result must be an object carrying analysis_mode, a coverage block and limitations');
  }
  if (!ANALYSIS_MODES.includes(result.analysis_mode)) {
    throw new Error(
      `an adapter result must carry analysis_mode, one of ${ANALYSIS_MODES.join(' | ')}; it carried ${result.analysis_mode}`,
    );
  }
  const coverage = result.coverage;
  const complete = coverage !== null
    && typeof coverage === 'object'
    && COVERAGE_FIELDS.every((field) => typeof coverage[field] === 'number');
  if (!complete) {
    throw new Error(
      `an adapter result must carry a coverage block with every one of ${COVERAGE_FIELDS.join(', ')} as a number`,
    );
  }
  if (!Array.isArray(result.limitations)) {
    throw new Error('an adapter result must carry a list of limitations, even when it is empty');
  }
  for (const limitation of result.limitations) validateLimitation(limitation);
  return result;
}

/** Every coverage counter at zero, for an adapter that has not run. */
export function emptyCoverage() {
  return Object.fromEntries(COVERAGE_FIELDS.map((field) => [field, 0]));
}

/**
 * How many items a Markdown report lists before it summarises the rest.
 *
 * The JSON beside the report carries every item; the Markdown is the surface a
 * human and an AI read in order to decide, and a list of a thousand bullets is
 * not readable, so it is not helpful. A report always says how many it did not
 * print — a silent cap would read as the whole of the evidence.
 */
export const REPORT_LIST_LIMIT = 20;

/** Render a capped list, stating plainly how many entries were not printed. */
export function renderCappedList(items, render) {
  const printed = items.slice(0, REPORT_LIST_LIMIT).map(render);
  if (items.length <= REPORT_LIST_LIMIT) return printed;
  return [...printed, `- … and ${items.length - REPORT_LIST_LIMIT} more, every one recorded in the JSON beside this report`];
}

/** The syntax layer this instrument is built on, named for the tool manifest. */
export function syntaxLayerName() {
  return SYNTAX_LAYER;
}

/**
 * The path segments of a tree-relative path, so a rule can be matched against
 * any of them rather than only against the whole string.
 *
 * Matching the whole string would make `vendor/` a rule while `a/vendor/b.rs`
 * slipped through, and an exclusion that only sometimes applies is worse than
 * none: the population would change shape without anything saying so.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function pathSegmentsOf(relativePath) {
  return relativePath.split('/');
}

/** True when any segment of the path names an excluded directory. */
export function isExcludedPath(relativePath) {
  return pathSegmentsOf(relativePath).some((segment) => EXCLUSION_RULES.includes(segment));
}

/**
 * Every artefact beneath a root, with what happened when the instrument tried
 * to read it.
 *
 * The walk descends into excluded directories rather than skipping them. A
 * vendored tree and a build output directory are recorded and marked
 * `out_of_scope`; only `.git` is absent from the record, because it is the
 * version-control database rather than an artefact of the project. Dropping an
 * excluded subtree from the walk would make "we did not measure it"
 * indistinguishable from "it is not there", which is failure F12.
 *
 * An entry that cannot be stat-ed — a dangling symlink, a permission failure —
 * is recorded as `unreadable` with the reason. Skipping it silently would
 * shrink the population without saying so.
 *
 * @param {string} root — the project root being analysed
 * @returns {Array<{path: string, kind: string, size: number|null, readStatus: string, exclusion: boolean, reason: string|null}>}
 */
export function listArtefacts(root) {
  const artefacts = [];

  const walk = (directory, prefix) => {
    let entries;
    try {
      entries = readdirSync(directory).sort(compareText);
    } catch (error) {
      // A directory whose own contents cannot be listed is an artefact the run
      // could not read, so it is recorded as one rather than throwing away the
      // whole walk. It is not skipped: an entry that vanishes from the record
      // reads as absent, which is the one thing this walk exists to prevent.
      artefacts.push({
        path: prefix === '' ? directory : prefix,
        kind: 'unreadable',
        size: null,
        readStatus: 'unreadable',
        exclusion: isExcludedPath(prefix),
        reason: `${error.code ?? 'error'}: the directory's contents could not be listed`,
      });
      return;
    }

    for (const entry of entries) {
      const relativePath = prefix === '' ? entry : `${prefix}/${entry}`;
      if (NOT_ENUMERATED_DIRECTORY_NAMES.includes(entry)) continue;

      let stats;
      try {
        stats = statSync(join(directory, entry));
      } catch (error) {
        artefacts.push({
          path: relativePath,
          kind: 'unreadable',
          size: null,
          readStatus: 'unreadable',
          exclusion: isExcludedPath(relativePath),
          reason: `${error.code ?? 'error'}: the entry could not be read`,
        });
        continue;
      }

      if (stats.isDirectory()) {
        walk(join(directory, entry), relativePath);
        continue;
      }
      artefacts.push({
        path: relativePath,
        kind: stats.isSymbolicLink() ? 'symlink' : 'file',
        size: stats.size,
        readStatus: 'readable',
        exclusion: isExcludedPath(relativePath),
        reason: null,
      });
    }
  };

  walk(root, '');
  return artefacts;
}

/** The language an artefact is written in, or `unknown`. Named for E1's package grouping. */
export function languageOfPath(relativePath) {
  const extension = relativePath.slice(relativePath.lastIndexOf('.'));
  return LANGUAGE_BY_EXTENSION_SHARED[extension] ?? 'unknown';
}

/**
 * Extensions the six target languages are written in.
 *
 * Kept here rather than derived from the syntax layer because it is a fact
 * about the languages, not about the parser, and R0 must be able to classify a
 * tree before any parser is loaded.
 */
const LANGUAGE_BY_EXTENSION_SHARED = Object.freeze({
  '.rs': 'rust',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.go': 'go',
  '.py': 'python',
  '.c': 'c_cpp',
  '.h': 'c_cpp',
  '.cc': 'c_cpp',
  '.cpp': 'c_cpp',
  '.cxx': 'c_cpp',
  '.hpp': 'c_cpp',
  '.hh': 'c_cpp',
});
