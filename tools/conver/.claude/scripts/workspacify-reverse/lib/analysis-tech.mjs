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

/**
 * Which languages carry an extractor for which extraction item.
 *
 * Per family rather than per language, because a language reaches some items
 * and not others: a flat list of languages would have to overclaim in one row
 * and underclaim in the next. `structure.mjs` reads this to decide whether to
 * run an extractor at all, and `capabilityRow` reads it to decide the cell, so
 * the two cannot disagree about what exists — which is the shape that let the
 * Rust row go stale.
 *
 * Each family is widened by the ticket that writes its queries: E1-E4 here,
 * E5-E6 by P24-3, E7-E14 by P24-4 and P24-5. Declaring a family in advance
 * would claim an extractor that does not exist.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export const LANGUAGES_WITH_EXTRACTORS = Object.freeze({
  E1: Object.freeze([...TARGET_LANGUAGES]),
  E2: Object.freeze([...TARGET_LANGUAGES]),
  E3: Object.freeze([...TARGET_LANGUAGES]),
  E4: Object.freeze([...TARGET_LANGUAGES]),
  E5: Object.freeze([...TARGET_LANGUAGES]),
  E6: Object.freeze([...TARGET_LANGUAGES]),
});

/**
 * Why a cell carries the value it does.
 *
 * Kept beside the matrix rather than inside it so a cell stays a single value
 * — a matrix entry that could hold a value *and* a qualifier would invite
 * reading the qualifier as a softener of the value.
 *
 * Every note is a statement about the *channel*: what this layer reads and what
 * the language's own constructs put beyond it. The note this replaced said the
 * adapter was not yet written, which became false the moment one existed.
 */
const CAPABILITY_NOTES = Object.freeze({
  'rust/E1-E4':
    'Measured through tree-sitter-rust. Syntax alone: module declarations, item declarations, use declarations and mechanism markers are read; macro-generated items and cfg-selected composition are not resolved.',
  'rust/E5':
    'Measured through tree-sitter-rust over `mod` and `use` declarations. A `pub use` re-export names a module the reader must resolve, a `#[cfg]`-gated `mod` declaration exists in some builds only, and a `use` a macro writes is in no text this layer reads.',
  'rust/E6':
    'Measured through tree-sitter-rust. Mechanism markers are read where they are written: a cfg attribute, an include macro, a trait object, an extern block. A mechanism a macro expands into is not in the text, and one a build script writes is not in the tree.',
  'rust/E7-E16':
    'Not attempted by this instrument version. R3 and later stages consume these, and the semantic adapters they need are declared but not built here.',
  '*/E5-E16':
    'Not attempted by this instrument version. The semantic adapters these items need are declared and not built here.',
  'typescript/E1-E4':
    'Measured through tree-sitter-typescript. Syntax alone: exported declarations, re-export statements, interfaces, type aliases and enums are read. An `export *` re-export reaches a module a reader would have to resolve, declaration merging gives one name two bodies, and a decorator rewrites the declaration it is applied to.',
  'javascript/E1-E4':
    'Measured through tree-sitter-javascript. Syntax alone: module.exports and exports assignments, function and class declarations are read. A computed property name is a value rather than a name, a `require` whose argument is resolved at run time names no module, and a method attached to a prototype after the constructor is not in the class body.',
  'go/E1-E4':
    'Measured through tree-sitter-go. Syntax alone: the package clause, type declarations, methods and initial capitalisation are read. A build tag decides which declarations exist at all, `go:generate` produces declarations no source holds, and embedding promotes methods the outer type never declares.',
  'python/E1-E4':
    'Measured through tree-sitter-python. Syntax alone: module-level assignments, class and function definitions and their decorators are read. `__getattr__` answers for names no body declares, a metaclass installs attributes as the class is created, and a decorator replaces the name the `def` statement bound.',
  'c_cpp/E1-E4':
    'Measured through tree-sitter-cpp. Syntax alone: declarations, definitions, typedefs and preprocessor definitions are read. The preprocessor decides what the compiler ever sees, macro expansion rewrites the text before this layer reads it, an include composes declarations from elsewhere, and per-translation-unit flags make one header mean different things.',
  'typescript/E5':
    'Measured through tree-sitter-typescript over import, re-export and literal `require` statements. A type-only import vanishes at compile time, and a re-export whose target is resolved at type-check time reaches a module this layer never reads.',
  'javascript/E5':
    'Measured through tree-sitter-javascript over import, export and literal `require` statements. A `require` whose argument is computed at run time names no module the syntax holds; it is recorded at R2.5 as a mechanism site and not counted here, so one dependency is never reported by two channels.',
  'go/E5':
    'Measured through tree-sitter-go over import declarations, resolved against the module path the manifest declares. A build tag or build constraint excludes a file from every build this reader does not model, so a declaration that exists in one build is absent from the graph of another.',
  'python/E5':
    'Measured through tree-sitter-python over import statements resolved against the tree. An import inside a function or under a conditional runs in some executions only, and `importlib` resolves a module by a name computed at run time.',
  'c_cpp/E5':
    'Measured through tree-sitter-cpp over preprocessor includes, resolved beside the file that writes them and along the include path the build declares. An `#include` composes declarations from elsewhere and what it composes depends on per-translation-unit flags, so one header means different things in two builds.',
  'typescript/E6':
    'Measured through tree-sitter-typescript. A dynamic `import()` with a computed specifier, `eval`, `Reflect` and `process.env` are read where they are written. A decorator that registers the declaration it is applied to is declared and not observed in this representative.',
  'javascript/E6':
    'Measured through tree-sitter-javascript. A `require` or `import()` with a computed specifier, `eval`, `Reflect` and `process.env` are read where they are written. A registration performed by a framework at load time leaves only the call that performs it.',
  'go/E6':
    'Measured through tree-sitter-go. A build constraint, an `init` function, a cgo import, the reflect package and interface values are read where they are written. A registration an `init` performs is decided while the package loads and is not in any declaration.',
  'python/E6':
    'Measured through tree-sitter-python. An attribute hook, a metaclass, a decorator, `importlib`, a foreign-function import and an environment read are read where they are written. What a metaclass installs is decided while the class statement runs and appears in no class body.',
  'c_cpp/E6':
    'Measured through tree-sitter-cpp. A macro definition, a preprocessor condition, an include and a call through a dereferenced function pointer are read where they are written. A function reached through a linker section or a constructor attribute is declared and not observed here.',
  '*/E13':
    'Semantic equivalence is undecidable for general programs. E13 is TCE — trivial, syntactic, compiler-normalisation equivalence — and only that is ever claimed.',
});

/**
 * The note family an extraction item's reason is written under.
 *
 * An item absent from this table falls through to the language-wide note, which
 * is what E7 and later read until the ticket that writes their adapters gives
 * them a family of their own.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
const NOTE_FAMILY_BY_ITEM = Object.freeze({
  E1: 'E1-E4',
  E2: 'E1-E4',
  E3: 'E1-E4',
  E4: 'E1-E4',
  E5: 'E5',
  E6: 'E6',
});

/**
 * The reason one cell carries the value it does.
 *
 * Exported because the decision document must carry the same strings the matrix
 * does: a reason that lived only in prose could drift from the cell it explains.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function capabilityNoteFor(language, item) {
  if (item === 'E13') return CAPABILITY_NOTES['*/E13'];

  // E1-E4 share one note because a reader that resolves nothing misses the same
  // constructs in all four. E5 and E6 are separate families: the dependency form
  // a language hides is a different fact from the mechanism form it hides, and a
  // matrix whose E5 cell quoted the structure note would state a reason for a
  // cell it does not explain.
  const family = NOTE_FAMILY_BY_ITEM[item];
  if (family !== undefined && CAPABILITY_NOTES[`${language}/${family}`] !== undefined) {
    return CAPABILITY_NOTES[`${language}/${family}`];
  }

  if (language === 'rust') {
    return LANGUAGES_WITH_EXTRACTORS[item]?.includes('rust')
      ? CAPABILITY_NOTES['rust/E1-E4']
      : CAPABILITY_NOTES['rust/E7-E16'];
  }
  return LANGUAGES_WITH_EXTRACTORS[item]?.includes(language)
    ? CAPABILITY_NOTES[`${language}/E1-E4`]
    : CAPABILITY_NOTES['*/E5-E16'];
}

/**
 * One language's row: a value for every extraction item.
 *
 * A language carries `partial` for the items its extractor covers because a
 * syntax tree is genuinely not the whole answer — a `pub fn` is public surface,
 * but a `pub use` re-export and a macro-generated function are public surface
 * this layer cannot see. Claiming `success` would overclaim, which is the one
 * thing the instrument may not do.
 */
// [::TICKET::] P22-4, P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-4|P24-2) --for-spec --no-implementation-order`.
function capabilityRow(language) {
  const row = {};
  for (const item of EXTRACTION_ITEMS) {
    if (item === 'E13') {
      row[item] = 'unsupported_in_principle';
    } else if (LANGUAGES_WITH_EXTRACTORS[item]?.includes(language)) {
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
        reason: capabilityNoteFor(language, item),
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
 * The per-language reasons for E1-E4, as a Markdown table the document embeds.
 *
 * The matrix above says *what* each cell is; this says *why*, and it is the why
 * that has to be per language — the constructs a channel cannot see are the
 * language's own. Rendering it from the constant rather than writing it into
 * the document twice is what keeps the reason a cell carries and the reason a
 * reader reads the same string.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function renderCapabilityReasonsMarkdown() {
  const header = '| Language | E1–E4 reason |';
  const divider = '|---|---|';
  const rows = TARGET_LANGUAGES.map((language) => `| ${language} | ${capabilityNoteFor(language, 'E1')} |`);
  return [header, divider, ...rows].join('\n');
}

/**
 * The per-language reasons for E5 and E6, as Markdown tables the document embeds.
 *
 * The E1-E4 table above says why a *structure* reading is partial. These say
 * something else, and the difference is the point: which dependency form and
 * which mechanism form each language puts beyond a syntax tree. A dependency the
 * two channels could both claim is stated here as belonging to one of them —
 * JavaScript's computed `require` is recorded by R2.5 as a mechanism site and
 * not by R2 as an edge — so a reader of the recorded decision can see that the
 * two do not double-count it.
 */
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
export function renderCouplingReasonsMarkdown(items = ['E5', 'E6']) {
  return items
    .flatMap((item) => [
      `| Language | ${item} reason |`,
      '|---|---|',
      ...TARGET_LANGUAGES.map((language) => `| ${language} | ${capabilityNoteFor(language, item)} |`),
    ])
    .join('\n');
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
