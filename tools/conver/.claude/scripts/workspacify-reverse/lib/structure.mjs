// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * Layer B — the common syntax layer — and R1's measurement of the static
 * skeleton.
 *
 * The syntax layer lives here because R1 is its first consumer and the two
 * later measurement modules read the parser from this module, which is also the
 * direction the design's data flow runs: R2 measures dependencies over the tree
 * R1 has already walked.
 *
 * tree-sitter is a **syntax fallback, not a semantic resolver**. It recovers no
 * name resolution, no trait or interface implementation, no template
 * instantiation and no runtime property. Everything this module reports is
 * therefore a fact about source text and its syntax tree, `analysis_mode` is
 * `syntax_only`, and `files_semantically_resolved` is zero. A method list that
 * a `pub fn` was seen in the text is not the same claim as "this is the public
 * API", and the module never makes the second claim.
 *
 * A grammar that is absent or incompatible lowers the mode and records a
 * limitation rather than throwing. A module that refused to run without its
 * parser would make "not analysed" look like "nothing there", which is the
 * silent degradation the design forbids.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { Parser, Language } from 'web-tree-sitter';

import {
  ANALYSIS_MODES,
  LANGUAGES_WITH_EXTRACTORS,
  assertAdapterResult,
  emptyCoverage,
  renderCappedList,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { BUILD_MANIFESTS, compareText } from './holdout-ledger.mjs';
import { groupKey } from './provenance.mjs';

/**
 * The grammar that carries each target language, and the wasm file inside its package.
 *
 * Exported because R5.5's trivial-compiler-equivalence normaliser must compare a
 * mutant under the same grammar the extraction used. A second table elsewhere
 * would drift on spelling and the drift would be silent, because each consumer's
 * tests would pass against its own copy.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
export const GRAMMAR_BY_LANGUAGE = Object.freeze({
  rust: { packageName: 'tree-sitter-rust', wasmName: 'tree-sitter-rust.wasm' },
  typescript: { packageName: 'tree-sitter-typescript', wasmName: 'tree-sitter-typescript.wasm' },
  javascript: { packageName: 'tree-sitter-javascript', wasmName: 'tree-sitter-javascript.wasm' },
  go: { packageName: 'tree-sitter-go', wasmName: 'tree-sitter-go.wasm' },
  python: { packageName: 'tree-sitter-python', wasmName: 'tree-sitter-python.wasm' },
  c_cpp: { packageName: 'tree-sitter-cpp', wasmName: 'tree-sitter-cpp.wasm' },
});

/**
 * Which languages this module carries a query set for, per extraction family.
 *
 * Declared in `analysis-tech.mjs` beside the capability matrix, which reads it to
 * decide each cell, and re-exported here so a reader of the syntax layer finds
 * the declaration where the queries are. A second copy would let the two drift,
 * and the drift would be silent.
 */
export { LANGUAGES_WITH_EXTRACTORS };

/**
 * The query sets the collectors read each grammar with, and the readers that
 * execute them.
 *
 * They live in their own module because the table is a paragraph of its own —
 * six languages against four items — and inlining it here would bury the
 * measurement in its own data. Re-exported so a consumer of the syntax layer
 * finds the queries where the extractors are.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export {
  QUERIES_BY_LANGUAGE,
  STRUCTURE_FAMILIES,
  collectErrorTypes,
  collectImplementations,
  collectItems,
  collectModules,
  collectPublicSurface,
  collectResultErrorTypes,
  collectTypeDefinitions,
  collectUseDeclarations,
  declaredNameOf,
  lineOf,
  variantsOf,
  walkNamed,
} from './structure-queries.mjs';
import {
  QUERIES_BY_LANGUAGE,
  STRUCTURE_FAMILIES,
  collectErrorTypes,
  collectImplementations,
  collectItems,
  collectModules,
  collectPublicSurface,
  collectResultErrorTypes,
  collectTypeDefinitions,
  collectUseDeclarations,
  lineOf,
  walkNamed,
} from './structure-queries.mjs';

/** Extensions the syntax layer will parse, by the language their grammar carries. */
const LANGUAGE_BY_EXTENSION = Object.freeze({
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

const requireFromHere = createRequire(import.meta.url);

/**
 * Load one grammar, reporting failure rather than raising it.
 *
 * A grammar whose ABI does not match the parser is a real possibility — the
 * packages version independently — and it must surface as a limitation on the
 * result rather than as a crash that leaves no record of what was attempted.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
async function loadGrammar(language) {
  const entry = GRAMMAR_BY_LANGUAGE[language];
  if (!entry) return { language, grammar: null, failure: `no grammar is declared for ${language}` };
  try {
    const packageJson = requireFromHere.resolve(`${entry.packageName}/package.json`);
    const grammar = await Language.load(join(dirname(packageJson), entry.wasmName));
    return { language, grammar, failure: null };
  } catch (error) {
    return { language, grammar: null, failure: error.message };
  }
}


/**
 * The installed version of each grammar, read from its package manifest.
 *
 * A normalised comparison proves syntactic equivalence under a *named*
 * configuration, and a grammar version is part of that configuration: a grammar
 * change changes the tree, and a changed tree changes what "identical" means.
 * Reading the version from the installed package rather than repeating it here
 * keeps the declaration and the artefacts from drifting apart.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
const GRAMMAR_VERSION_BY_PACKAGE = (() => {
  const versions = {};
  for (const entry of Object.values(GRAMMAR_BY_LANGUAGE)) {
    try {
      const manifest = JSON.parse(readFileSync(requireFromHere.resolve(`${entry.packageName}/package.json`), 'utf8'));
      versions[entry.packageName] = manifest.version ?? null;
    } catch {
      versions[entry.packageName] = null;
    }
  }
  return Object.freeze(versions);
})();

/**
 * The identity a comparison names when it claims a normalised match.
 *
 * A package whose version could not be read yields the bare package name rather
 * than a guess. An unversioned configuration is a weaker claim, and it should
 * read as one.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
export function grammarIdentityFor(language) {
  const entry = GRAMMAR_BY_LANGUAGE[language];
  if (!entry) return null;
  const version = GRAMMAR_VERSION_BY_PACKAGE[entry.packageName];
  return version === null || version === undefined ? entry.packageName : `${entry.packageName}@${version}`;
}

/** The grammars, loaded once when the module is first imported. */
const LOADED_GRAMMARS = new Map();
let parserReady = false;
let parserFailure = null;
try {
  await Parser.init();
  parserReady = true;
} catch (error) {
  parserFailure = `the tree-sitter parser runtime did not initialise: ${error.message}`;
}
if (parserReady) {
  for (const language of Object.keys(GRAMMAR_BY_LANGUAGE)) {
    const loaded = await loadGrammar(language);
    LOADED_GRAMMARS.set(language, loaded);
  }
}

/** The language an artefact is written in, or `unknown` when no grammar carries it. */
export function syntaxLanguageOf(relativePath) {
  const dot = relativePath.lastIndexOf('.');
  if (dot < 0) return 'unknown';
  return LANGUAGE_BY_EXTENSION[relativePath.slice(dot)] ?? 'unknown';
}

/**
 * The distinct constructs a grammar could not accept.
 *
 * "The grammar recovered from a syntax error" tells a reader that something was
 * missed but not what, and a limitation nobody can act on is noise. Naming the
 * construct turns it into a fact about the instrument's pinned version — a
 * `&raw` reference is Rust 2024 syntax the grammar at this version does not
 * carry — which is exactly the kind of gap the design requires be published
 * rather than hidden.
 */
export function syntaxErrorTexts(tree, limit = 5) {
  const texts = new Set();
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'ERROR' && node.isMissing !== true) return;
    const text = node.isMissing === true
      ? `missing ${node.type}`
      : node.text.split('\n')[0].trim().slice(0, 40);
    if (text.length > 0) texts.add(text);
  });
  return [...texts].sort(compareText).slice(0, limit);
}

/** The diagnostic an adapter records when the grammar had to recover. */
export function syntaxRecoveryDiagnostic(tree) {
  const constructs = syntaxErrorTexts(tree);
  return {
    severity: 'warning',
    message: constructs.length === 0
      ? 'the grammar recovered from a syntax error while parsing this file'
      : `the grammar recovered near: ${constructs.join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// The Rust-specific callers, kept so the consumers that already read Rust
// through these names need no branch of their own. Each is the shared path with
// Rust named as the language, which is what makes the shared path's behaviour
// over Rust the same behaviour these names always had.
// ---------------------------------------------------------------------------

/** Every item one Rust file declares, as the syntax layer can see them. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectRustItems(tree, relativePath) {
  return collectItems('rust', tree, relativePath);
}

/** Every module a Rust file declares, as `mod name;` or `pub mod name;`. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectRustModules(tree, relativePath) {
  return collectModules('rust', tree, relativePath);
}

/** Every use declaration a Rust file makes, before any name resolution. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectRustUses(tree, relativePath) {
  return collectUseDeclarations(tree, relativePath);
}

/** Every `impl ... for Type` a Rust file contains. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectRustImpls(tree, relativePath) {
  return collectImplementations(tree, relativePath);
}

/** Every type name that appears in the error position of a `Result`. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
export function collectRustResultErrorTypes(tree) {
  return collectResultErrorTypes(tree);
}

/**
 * Parse one file through the syntax layer.
 *
 * The return value always says what happened. A caller that receives
 * `ok: false` has a reason it can put in the ledger; a caller that receives
 * `ok: true` has a tree, and `errorNodes` tells it whether the grammar had to
 * recover while producing that tree.
 */
export function parseSourceFile(root, relativePath, { grammar } = {}) {
  const language = syntaxLanguageOf(relativePath);
  if (language === 'unknown') {
    return { ok: false, language, reason: 'unsupported_language', message: `no grammar carries ${relativePath}` };
  }

  const loaded = grammar === undefined ? LOADED_GRAMMARS.get(language) : { grammar, failure: null };
  if (parserFailure !== null) {
    return { ok: false, language, reason: 'grammar_unavailable', message: parserFailure };
  }
  if (!loaded || loaded.grammar === null) {
    const message = loaded?.failure ?? `the ${language} grammar is not available`;
    return { ok: false, language, reason: 'grammar_unavailable', message };
  }

  let text;
  try {
    text = readFileSync(join(root, relativePath), 'utf8');
  } catch (error) {
    return { ok: false, language, reason: 'unreadable', message: `${error.code ?? 'error'}: ${relativePath} could not be read` };
  }

  const parser = new Parser();
  parser.setLanguage(loaded.grammar);
  const tree = parser.parse(text);
  return { ok: true, language, tree, text, errorNodes: tree.rootNode.hasError };
}

/**
 * Parse source text the caller already holds, rather than a file on disk.
 *
 * R5.5 compares a mutant against its original, and a mutant exists as text
 * produced in memory: it is never written to the tree being measured, because a
 * run must not change what it measures. The reading is the same one
 * `parseSourceFile` performs — only the source of the text differs.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
export function parseSourceText(text, language) {
  if (parserFailure !== null) {
    return { ok: false, language, reason: 'grammar_unavailable', message: parserFailure };
  }
  const loaded = LOADED_GRAMMARS.get(language);
  if (!loaded || loaded.grammar === null) {
    return {
      ok: false,
      language,
      reason: 'grammar_unavailable',
      message: loaded?.failure ?? `the ${language} grammar is not available`,
    };
  }
  const parser = new Parser();
  parser.setLanguage(loaded.grammar);
  const tree = parser.parse(text);
  return { ok: true, language, tree, text, errorNodes: tree.rootNode.hasError };
}

/**
 * The artefacts the syntax layer will attempt to parse.
 *
 * An entry that could not be read is kept in the population rather than filtered
 * out, so that the attempt is made, fails, and leaves a ledger row. Removing it
 * here would be the silent shrink the ledger exists to prevent: the file would
 * simply not appear, and nothing would say a file had been skipped.
 *
 * Excluded paths are not filtered out by this function — the caller passes the
 * paths the boundary marked `out_of_scope`, so that a run which measures only
 * part of a tree still records the whole of it.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function syntaxPopulation(root, { excludedPaths = [] } = {}) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .filter((artefact) => syntaxLanguageOf(artefact.path) !== 'unknown')
    .map((artefact) => artefact.path)
    .sort(compareText);
}

/** The build and configuration manifests the tree declares, for the coverage block. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function configManifestsIn(root) {
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && artefact.readStatus === 'readable')
    .filter((artefact) => BUILD_MANIFESTS.includes(artefact.path.split('/').pop()))
    .map((artefact) => artefact.path)
    .sort(compareText);
}

/** The packages the source population forms, grouped by the directory that owns each file. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function packagesFrom(files, modules) {
  const byDirectory = new Map();
  for (const file of files) {
    const directory = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    if (!byDirectory.has(directory)) byDirectory.set(directory, []);
    byDirectory.get(directory).push(file);
  }
  return [...byDirectory.entries()]
    .map(([directory, directoryFiles]) => ({
      directory,
      language: syntaxLanguageOf(directoryFiles[0]),
      files: [...directoryFiles].sort(compareText),
      declaredModules: modules
        .filter((module) => directoryFiles.includes(module.file))
        .map((module) => module.symbol)
        .sort(compareText),
    }))
    .sort((left, right) => compareText(left.directory, right.directory));
}

/**
 * R1 — the static skeleton: packages, public surface, types and error types.
 *
 * Every item carries a `file:line` because the design's whole output contract
 * rests on evidence being locatable: a finding a reader cannot go and look at
 * is not evidence, it is an assertion.
 *
 * @param {{root: string, excludedPaths?: string[], grammar?: object|null}} params
 */
export function measureStructure({ root, excludedPaths = [], grammar } = {}) {
  const files = syntaxPopulation(root, { excludedPaths });
  const collected = buildStructureItems({ root, files, grammar, queries: QUERIES_BY_LANGUAGE });
  const limitations = limitationsOf({ files, attempts: collected.attempts });

  return assertAdapterResult({
    // This layer resolves nothing, so `syntax_only` is the only mode it can
    // honestly claim — and it is the floor of the scale, which is why a missing
    // grammar is reported through `limitations` rather than by lowering it.
    analysis_mode: ANALYSIS_MODES[0],
    coverage: {
      ...collected.coverage,
      files_semantically_resolved: 0,
      configs_analyzed: collected.coverage.configs_enumerated,
    },
    limitations,
    packages: packagesFrom([...collected.parseable].sort(compareText), collected.modules),
    publicItems: collected.publicItems.sort(byLocation),
    types: collected.types.sort(byLocation),
    errorTypes: collected.errorTypes.sort(byLocation),
    modules: collected.modules.sort(byLocation),
    uses: collected.uses.sort(byLocation),
    impls: collected.impls.sort(byLocation),
    attempts: collected.attempts,
  });
}

/**
 * The four R1 items, assembled from a population of files.
 *
 * The measurement reads as the measurement it performs — enumerate, parse,
 * collect four items, assemble — because the assembly lives here rather than in
 * a list of mutable bindings at the top of a long function.
 *
 * `queries` is the only thing that varies per language: every file is read by
 * the row its language names, so this function holds no branch on the language
 * and adding a seventh language is adding a row.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function buildStructureItems({ root, files, grammar, queries }) {
  const attempts = [];
  const parseable = new Set();
  const modules = [];
  const publicItems = [];
  const types = [];
  const errorTypes = [];
  const uses = [];
  const impls = [];
  const coverage = emptyCoverage();
  coverage.files_discovered = files.length;
  coverage.configs_enumerated = configManifestsIn(root).length;

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    const querySet = queries[language];
    if (querySet === undefined) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'skipped',
          extractedCount: 0,
          reason: 'no_extractor_for_language',
        },
      }));
      continue;
    }

    const parsed = parseSourceFile(root, file, { grammar });
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'failed',
          diagnostics: [{ severity: 'error', message: parsed.message }],
          extractedCount: 0,
          reason: parsed.reason,
        },
      }));
      continue;
    }

    const signals = querySet.E4.signals;
    const fileImpls = implementationsFor(language, parsed.tree, file, signals);
    parseable.add(file);
    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    publicItems.push(...collectPublicSurface(language, parsed.tree, file));
    modules.push(...collectModules(language, parsed.tree, file));
    types.push(...collectTypeDefinitions(language, parsed.tree, file));
    errorTypes.push(...collectErrorTypes(language, parsed.tree, file, {
      implementations: fileImpls,
      resultErrorTypes: signals.includes('appears_as_result_error_type')
        ? collectResultErrorTypes(parsed.tree)
        : new Set(),
    }));
    if (carries('E5', language)) uses.push(...collectUseDeclarations(parsed.tree, file));
    if (carries('E6', language)) impls.push(...fileImpls);

    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: `tree-sitter-${language}`,
      outcome: {
        phase: 'parse',
        // A grammar that had to recover could not read the file whole, which is
        // a different fact from a file it read and found nothing in. The two
        // are counted apart by buildAttemptLedger, and that is the whole reason
        // the ledger exists.
        status: parsed.errorNodes ? 'failed' : 'success',
        diagnostics: parsed.errorNodes ? [syntaxRecoveryDiagnostic(parsed.tree)] : [],
        extractedCount: collectItems(language, parsed.tree, file).length,
        reason: parsed.errorNodes ? 'grammar_recovered' : null,
      },
    }));
  }

  return { attempts, parseable, modules, publicItems, types, errorTypes, uses, impls, coverage };
}

/** True when the declaration names this language as carrying this family. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function carries(family, language) {
  return LANGUAGES_WITH_EXTRACTORS[family].includes(language);
}

/** The implementation sites a language's error signals and mechanism family ask for. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function implementationsFor(language, tree, file, signals) {
  const wanted = carries('E6', language) || signals.includes('implements_error_trait');
  return wanted ? collectImplementations(tree, file) : [];
}

/**
 * The limitations a run leaves behind.
 *
 * Each names the code, the scope it bounds and the effect it has on a
 * conclusion, because a limitation a reader cannot weigh against the result is
 * noise. The scope names the extensions the population actually carried rather
 * than the language identifier: a reader who globs for `.c_cpp` finds no file.
 */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function limitationsOf({ files, attempts }) {
  const limitations = [];

  if (parserFailure !== null) {
    limitations.push({
      code: 'TREE_SITTER_RUNTIME_UNAVAILABLE',
      scope: '**',
      effect: 'the syntax layer did not initialise, so nothing was parsed and the empty skeleton reports a failed instrument rather than an empty project',
    });
  }

  // One entry per language, not per file: a limitation scoped to a single file
  // would bury the fact that a whole language went unextracted.
  const unextracted = new Set(
    files.map(syntaxLanguageOf).filter((language) => !STRUCTURE_FAMILIES.some((family) => carries(family, language))),
  );
  for (const language of [...unextracted].sort(compareText)) {
    limitations.push({
      code: 'EXTRACTOR_NOT_WRITTEN',
      scope: extensionsFor(files, language).map((extension) => `**/*${extension}`).join(', '),
      effect: `${language} is reachable by the syntax layer, which carries a grammar for it, but this instrument version has no extractor for it — so nothing was extracted from those files`,
    });
  }

  const grammarFailures = new Set(
    attempts.filter((attempt) => attempt.reason === 'grammar_unavailable').map((attempt) => attempt.tool),
  );
  for (const tool of [...grammarFailures].sort(compareText)) {
    limitations.push({
      code: 'TREE_SITTER_GRAMMAR_ABSENT',
      scope: '**',
      effect: `${tool} could not be loaded, so no syntax extraction was attempted and an empty result means the instrument could not read the files, not that the files declare nothing`,
    });
  }

  const unreadable = attempts.filter((attempt) => attempt.reason === 'unreadable').map((attempt) => attempt.target);
  if (unreadable.length > 0) {
    limitations.push({
      code: 'SOURCE_UNREADABLE',
      scope: unreadable.join(', '),
      effect: 'these entries could not be read, so they are recorded as unread rather than counted as files that declare nothing',
    });
  }

  return limitations;
}

/** The file extensions the population actually carried for one language. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function extensionsFor(files, language) {
  const extensions = files
    .filter((file) => syntaxLanguageOf(file) === language)
    .map((file) => file.slice(file.lastIndexOf('.')));
  return [...new Set(extensions)].sort(compareText);
}

/** Order findings by the location a reader would go to, not by the order they were walked. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function byLocation(left, right) {
  return compareText(`${left.file}:${String(left.line).padStart(6, '0')}`, `${right.file}:${String(right.line).padStart(6, '0')}`);
}

/** Keep one entry per distinct limitation, so a per-file reason does not repeat per file. */
export function dedupeLimitations(limitations) {
  const seen = new Set();
  const unique = [];
  for (const limitation of limitations) {
    const key = groupKey(limitation.code, limitation.scope);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(limitation);
  }
  return unique;
}

/** The structure report, as Markdown for a reader rather than JSON for a machine. */
export function renderStructureReport(structure) {
  const lines = [
    '# R1 — the static skeleton',
    '',
    `Analysis mode: \`${structure.analysis_mode}\`. Every fact below was read from the source text`,
    'and its syntax tree. No name was resolved and no type was checked, so an item listed here is',
    'an item the text declares — not a claim that it survives compilation.',
    '',
    '## What was read',
    '',
    '| Counter | Value |',
    '|---|---|',
    `| files discovered | ${structure.coverage.files_discovered} |`,
    `| files parsed | ${structure.coverage.files_parsed} |`,
    `| files with error nodes | ${structure.coverage.files_with_error_nodes} |`,
    `| files semantically resolved | ${structure.coverage.files_semantically_resolved} |`,
    `| configs enumerated | ${structure.coverage.configs_enumerated} |`,
    '',
    '`files_semantically_resolved` is zero by construction: this layer resolves nothing.',
    '',
    '## Packages (E1)',
    '',
    // Six languages reach this report now, so every list is capped through one
    // constant rather than through a literal one of them happens to use, and
    // every cap states how many entries it did not print.
    ...renderCappedList(
      structure.packages,
      (pkg) => `- \`${pkg.directory}\` — ${pkg.files.length} file(s), declares ${pkg.declaredModules.length} module(s)`,
    ),
    '',
    '## Public surface (E2)',
    '',
    ...renderCappedList(
      structure.publicItems,
      (item) => `- \`${item.symbol}\` (${item.itemKind}, \`${item.visibility}\`) — ${item.file}:${item.line}`,
    ),
    '',
    '## Types (E3)',
    '',
    ...renderCappedList(
      structure.types,
      (type) => `- \`${type.symbol}\` (${type.typeKind}) — ${type.file}:${type.line}`,
    ),
    '',
    '## Error types (E4)',
    '',
    ...renderCappedList(
      structure.errorTypes,
      (error) => `- \`${error.symbol}\` (${error.typeKind}) — ${error.file}:${error.line} `
        + `— signals: ${error.signals.join(', ')}${error.variants.length > 0 ? `; ${error.variants.length} variant(s)` : ''}`,
    ),
    '',
    'These are candidates, not verdicts. A name matching `Error` and an implementation of the',
    '`Error` trait are evidence that a reader may weigh; neither decides what the type means.',
    '',
    '## Limitations',
    '',
    ...renderCappedList(
      structure.limitations,
      (limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`,
    ),
  ];
  return `${lines.filter((line) => line !== undefined).join('\n')}\n`;
}
