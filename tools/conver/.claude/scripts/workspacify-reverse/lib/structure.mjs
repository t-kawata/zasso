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
  assertAdapterResult,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { BUILD_MANIFESTS, compareText } from './holdout-ledger.mjs';
import { groupKey } from './provenance.mjs';

/** The grammar that carries each target language, and the wasm file inside its package. */
const GRAMMAR_BY_LANGUAGE = Object.freeze({
  rust: { packageName: 'tree-sitter-rust', wasmName: 'tree-sitter-rust.wasm' },
  typescript: { packageName: 'tree-sitter-typescript', wasmName: 'tree-sitter-typescript.wasm' },
  javascript: { packageName: 'tree-sitter-javascript', wasmName: 'tree-sitter-javascript.wasm' },
  go: { packageName: 'tree-sitter-go', wasmName: 'tree-sitter-go.wasm' },
  python: { packageName: 'tree-sitter-python', wasmName: 'tree-sitter-python.wasm' },
  c_cpp: { packageName: 'tree-sitter-cpp', wasmName: 'tree-sitter-cpp.wasm' },
});

/**
 * The languages this module carries a query set for.
 *
 * A grammar being installed is not the same as an extraction being written, and
 * the capability matrix keeps the two apart. Only Rust has queries here; the
 * other five languages are reached by the syntax layer and are `not_attempted`
 * by this instrument version.
 */
const LANGUAGES_WITH_EXTRACTORS = Object.freeze(['rust']);

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

/** The identifier a Rust item declares, and the node types that declare one. */
const RUST_ITEM_KINDS = Object.freeze({
  function_item: 'function',
  struct_item: 'struct',
  enum_item: 'enum',
  union_item: 'union',
  trait_item: 'trait',
  type_item: 'alias',
  const_item: 'constant',
  static_item: 'static',
  macro_definition: 'macro',
});

/** The item kinds that declare a type, as opposed to an item that has one. */
const TYPE_ITEM_KINDS = Object.freeze(['struct', 'enum', 'union', 'trait', 'alias']);

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

/** The line a node starts on, one-based, because `file:line` is one-based. */
export function lineOf(node) {
  return node.startPosition.row + 1;
}

/** Visit every named node of a tree, parents before children. */
export function walkNamed(node, visit) {
  visit(node);
  for (const child of node.namedChildren) walkNamed(child, visit);
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

/** The first named child whose type is one of `types`, or null. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function childOfType(node, types) {
  return node.namedChildren.find((child) => types.includes(child.type)) ?? null;
}

/** The declared visibility of an item, or null when it declares none. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function declaredVisibility(node) {
  const modifier = childOfType(node, ['visibility_modifier']);
  return modifier ? modifier.text : null;
}

/** The name an item declares, or null when the node type declares none. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function declaredName(node) {
  const name = node.childForFieldName?.('name');
  return name ? name.text : null;
}

/**
 * True when the item carries a `cfg` attribute.
 *
 * A `cfg`-gated item exists only in some builds, so a fact about it is a fact
 * about a configuration rather than about the crate. The flag is recorded here
 * and used by the claim classification, which refuses `observed` for a
 * proposition the configuration can remove.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function isCfgGated(node, siblings) {
  const index = siblings.indexOf(node);
  for (let before = index - 1; before >= 0; before -= 1) {
    const previous = siblings[before];
    if (previous.type !== 'attribute_item') break;
    if (previous.text.includes('cfg')) return true;
  }
  return false;
}

/** The path a use declaration names, with the leading `crate::` left intact. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function usePathOf(node) {
  const argument = node.childForFieldName?.('argument') ?? childOfType(node, ['scoped_identifier', 'identifier', 'scoped_use_list', 'use_list', 'use_as_clause']);
  return argument ? argument.text : null;
}

/**
 * Every item one Rust file declares, as the syntax layer can see them.
 *
 * `visibility` records what was written — `pub`, `pub(crate)` — rather than a
 * verdict on whether the item is externally public, because deciding that needs
 * name resolution this layer does not have.
 */
export function collectRustItems(tree, relativePath) {
  const items = [];
  const topLevel = tree.rootNode.namedChildren;

  walkNamed(tree.rootNode, (node) => {
    const itemKind = RUST_ITEM_KINDS[node.type];
    if (!itemKind) return;
    const symbol = declaredName(node);
    if (symbol === null) return;
    const siblings = node.parent ? node.parent.namedChildren : topLevel;
    items.push({
      symbol,
      itemKind,
      file: relativePath,
      line: lineOf(node),
      visibility: declaredVisibility(node),
      cfgGated: isCfgGated(node, siblings),
      spelling: node.text.split('\n')[0].trim(),
    });
  });

  return items;
}

/** Every module a Rust file declares, as `mod name;` or `pub mod name;`. */
export function collectRustModules(tree, relativePath) {
  const modules = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'mod_item') return;
    const symbol = declaredName(node);
    if (symbol === null) return;
    modules.push({
      symbol,
      file: relativePath,
      line: lineOf(node),
      visibility: declaredVisibility(node),
      inline: node.text.includes('{'),
    });
  });
  return modules;
}

/** Every use declaration a Rust file makes, before any name resolution. */
export function collectRustUses(tree, relativePath) {
  const uses = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'use_declaration') return;
    const target = usePathOf(node);
    if (target === null) return;
    uses.push({ target, file: relativePath, line: lineOf(node) });
  });
  return uses;
}

/**
 * Every `impl ... for Type` a Rust file contains.
 *
 * An impl of the standard `Error` trait is the strongest syntactic evidence
 * that a type is an error type, which is why it is collected even though trait
 * resolution is out of reach: the text says the trait's name, and that much is
 * a fact about the source.
 */
export function collectRustImpls(tree, relativePath) {
  const impls = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'impl_item') return;
    const traitNode = node.childForFieldName?.('trait');
    const typeNode = node.childForFieldName?.('type');
    impls.push({
      traitName: traitNode ? traitNode.text : null,
      typeName: typeNode ? typeNode.text : null,
      file: relativePath,
      line: lineOf(node),
    });
  });
  return impls;
}

/** The variants an error enum declares, each with its own location. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function collectEnumVariants(tree) {
  const variants = [];
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'enum_variant') return;
    const symbol = declaredName(node);
    if (symbol === null) return;
    variants.push({ symbol, line: lineOf(node) });
  });
  return variants;
}

/**
 * Every type name that appears in the error position of a `Result`.
 *
 * The error position is the second type argument, and it is read from the
 * syntax tree rather than matched against the file's text: a regular
 * expression over the whole file would associate a `Result` on one line with a
 * type named on another, and a signal that fires for the wrong reason is worse
 * than no signal.
 */
export function collectRustResultErrorTypes(tree) {
  const names = new Set();
  walkNamed(tree.rootNode, (node) => {
    if (node.type !== 'generic_type') return;
    if (node.childForFieldName?.('type')?.text !== 'Result') return;
    const argument = node.childForFieldName?.('type_arguments')?.namedChildren?.[1];
    if (argument) names.add(argument.text);
  });
  return names;
}

/**
 * The evidence that a declared type is an error type.
 *
 * The name is the weakest signal, the trait implementation is stronger, and
 * appearing in the error position of a `Result` is stronger still — but none is
 * a verdict. An enum called `Error` may be a transport status, and a type may
 * implement `Error` for reasons a reader would not call an error type. R1
 * records the signals and leaves the classification to the human, as the design
 * requires for every contract-shaped finding.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function errorSignalsFor(symbol, file, impls, resultErrorTypes) {
  const signals = [];
  if (/error|err|fail/i.test(symbol)) signals.push('name_matches_error');
  if (impls.some((impl) => impl.traitName !== null && /error/i.test(impl.traitName) && impl.typeName === symbol)) {
    signals.push('implements_error_trait');
  }
  if (resultErrorTypes.has(symbol)) signals.push('appears_as_result_error_type');
  return { symbol, file, signals };
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
  const attempts = [];
  const limitations = [];
  const coverage = emptyCoverage();
  coverage.files_discovered = files.length;
  coverage.configs_enumerated = configManifestsIn(root).length;

  const items = [];
  const modules = [];
  const uses = [];
  const impls = [];
  const types = [];
  const errorTypes = [];
  const parseable = new Set();

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    if (!LANGUAGES_WITH_EXTRACTORS.includes(language)) {
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

    const fileItems = collectRustItems(parsed.tree, file);
    const fileTypes = fileItems.filter((item) => TYPE_ITEM_KINDS.includes(item.itemKind));
    const fileImpls = collectRustImpls(parsed.tree, file);
    const resultErrorTypes = collectRustResultErrorTypes(parsed.tree);

    parseable.add(file);
    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    items.push(...fileItems);
    modules.push(...collectRustModules(parsed.tree, file));
    uses.push(...collectRustUses(parsed.tree, file));
    impls.push(...fileImpls);

    for (const item of fileTypes) {
      types.push({
        symbol: item.symbol,
        typeKind: item.itemKind,
        file: item.file,
        line: item.line,
        visibility: item.visibility,
        cfgGated: item.cfgGated,
      });
    }

    for (const item of fileTypes) {
      const signals = errorSignalsFor(item.symbol, item.file, fileImpls, resultErrorTypes);
      if (signals.signals.length === 0) continue;
      errorTypes.push({
        ...signals,
        typeKind: item.itemKind,
        line: item.line,
        variants: item.itemKind === 'enum' ? collectEnumVariants(parsed.tree) : [],
        cfgGated: item.cfgGated,
      });
    }

    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: `tree-sitter-${language}`,
      outcome: {
        phase: 'parse',
        status: parsed.errorNodes ? 'partial' : 'success',
        diagnostics: parsed.errorNodes ? [syntaxRecoveryDiagnostic(parsed.tree)] : [],
        extractedCount: fileItems.length,
        reason: null,
      },
    }));
  }

  if (parserFailure !== null) {
    limitations.push({
      code: 'TREE_SITTER_RUNTIME_UNAVAILABLE',
      scope: '**',
      effect: 'the syntax layer did not initialise, so nothing was parsed and the empty skeleton reports a failed instrument rather than an empty project',
    });
  }

  // One entry per language, not per file: a limitation scoped to a single file
  // would bury the fact that a whole language went unextracted.
  const unextractedLanguages = new Set(
    files
      .map(syntaxLanguageOf)
      .filter((language) => !LANGUAGES_WITH_EXTRACTORS.includes(language)),
  );
  for (const language of [...unextractedLanguages].sort(compareText)) {
    limitations.push({
      code: 'EXTRACTOR_NOT_WRITTEN',
      scope: `**/*.${language}`,
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

  return assertAdapterResult({
    // This layer resolves nothing, so `syntax_only` is the only mode it can
    // honestly claim — and it is the floor of the scale, which is why a missing
    // grammar is reported through `limitations` rather than by lowering it.
    analysis_mode: ANALYSIS_MODES[0],
    coverage: {
      ...coverage,
      files_semantically_resolved: 0,
      configs_analyzed: coverage.configs_enumerated,
    },
    limitations,
    packages: packagesFrom([...parseable].sort(compareText), modules),
    publicItems: items
      .filter((item) => item.visibility !== null)
      .map((item) => ({ ...item }))
      .sort(byLocation),
    types: types.sort(byLocation),
    errorTypes: errorTypes.sort(byLocation),
    modules: modules.sort(byLocation),
    uses: uses.sort(byLocation),
    impls: impls.sort(byLocation),
    attempts,
  });
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
    ...structure.packages.map(
      (pkg) => `- \`${pkg.directory}\` — ${pkg.files.length} file(s), declares ${pkg.declaredModules.length} module(s)`,
    ),
    '',
    '## Public surface (E2)',
    '',
    ...structure.publicItems.slice(0, 40).map(
      (item) => `- \`${item.symbol}\` (${item.itemKind}, \`${item.visibility}\`) — ${item.file}:${item.line}`,
    ),
    structure.publicItems.length > 40 ? `- … and ${structure.publicItems.length - 40} more` : '',
    '',
    '## Types (E3)',
    '',
    ...structure.types.map((type) => `- \`${type.symbol}\` (${type.typeKind}) — ${type.file}:${type.line}`),
    '',
    '## Error types (E4)',
    '',
    ...structure.errorTypes.map(
      (error) => `- \`${error.symbol}\` (${error.typeKind}) — ${error.file}:${error.line} `
        + `— signals: ${error.signals.join(', ')}${error.variants.length > 0 ? `; ${error.variants.length} variant(s)` : ''}`,
    ),
    '',
    'These are candidates, not verdicts. A name matching `Error` and an implementation of the',
    '`Error` trait are evidence that a reader may weigh; neither decides what the type means.',
    '',
    '## Limitations',
    '',
    ...structure.limitations.map((limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`),
  ];
  return `${lines.filter((line) => line !== undefined).join('\n')}\n`;
}
