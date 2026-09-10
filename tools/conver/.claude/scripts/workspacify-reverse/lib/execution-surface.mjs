// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * R2.5 — the execution surface: the dynamic mechanisms an import graph cannot
 * represent.
 *
 * This is the highest-priority measurement of the ticket. The design's failure
 * F4 is a static analysis that quietly overclaims: it reads `use` declarations,
 * finds no coupling, and reports that as the truth about a program that couples
 * half its modules through a trait object, a feature flag or a generated file.
 * The defence is not to detect every mechanism — exhaustiveness over an
 * arbitrary program is not decidable — but to enumerate the mechanisms that
 * were found, each with its `file:line`, so a human can audit what was and was
 * not looked at.
 *
 * The second half of the defence is mechanical: `classifyWithDynamicEvidence`
 * refuses `observed` for a proposition that touches a listed mechanism unless
 * dynamic evidence exists. That is rule R-1, and it is what stops the surface
 * from being decoration.
 */
import {
  ANALYSIS_MODES,
  EVIDENCE_MODES,
  assertAdapterResult,
  renderCappedList,
  emptyCoverage,
  listArtefacts,
  recordAttempt,
} from './analysis-tech.mjs';
import { compareText } from './holdout-ledger.mjs';
import { collectRustUses, parseSourceFile, syntaxLanguageOf, syntaxRecoveryDiagnostic, walkNamed } from './structure.mjs';

/**
 * The kinds of mechanism this instrument enumerates.
 *
 * Each is a way for code to reach other code that no import names. The list is
 * a closed vocabulary so that a later stage can test membership in it rather
 * than matching prose, and so that a kind quietly disappearing is a test
 * failure rather than a silent change of meaning.
 */
export const MECHANISM_KINDS = Object.freeze([
  'compile_time_embedding',
  'code_generation',
  'dynamic_dispatch',
  'ffi',
  'runtime_loading',
  'config_driven',
  'conditional_compilation',
  'macro_expansion',
  'runtime_registration',
  'reflection',
]);

/** The macros that read a file at compile time, making a build-time input a dependency. */
const EMBEDDING_MACROS = Object.freeze(['include_str', 'include_bytes', 'include']);

/** The call suffixes through which a Rust program reads its environment. */
const ENVIRONMENT_CALL_SUFFIXES = Object.freeze(['env::var', 'env::var_os']);

/**
 * The call suffixes through which a Rust program recovers a type at run time.
 *
 * Rust has no general reflection, and this is deliberately not a search for the
 * word "reflect": that word appears in ordinary prose, in identifiers and in
 * comments, and a mechanism list that fires on it would be noise a reader learns
 * to skip. These are the concrete APIs through which a value's type decides
 * which code runs.
 */
const REFLECTION_CALL_SUFFIXES = Object.freeze(['TypeId::of', 'downcast_ref', 'downcast_mut', 'type_id']);

/** True when a callee path names the given item, directly or through a module path. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function isPathTo(callee, item) {
  return callee === item || callee.endsWith(`::${item}`);
}

/** The attributes that make an item exist only in some configurations. */
const CONDITIONAL_ATTRIBUTE = /^#\[\s*cfg(_attr)?\s*[(!]/;

/** The crates that load a library at run time, which no `use` of the target can name. */
const RUNTIME_LOADING_CRATES = Object.freeze(['libloading', 'dlopen', 'libc::dlopen']);

/** The build script that generates code before the crate is compiled. */
const BUILD_SCRIPT = 'build.rs';

/** The statement this report makes about its own completeness, in every rendering. */
export const PRESENCE_NOT_ABSENCE =
  'This list is evidence of presence, not proof of absence. A mechanism not listed here is one '
  + 'this instrument did not find, which is not the same as one that is not there — no static '
  + 'analysis of an arbitrary program can be exhaustive about dynamic mechanisms.';

/** One mechanism, with the location that lets a human go and look at it. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function mechanism(kind, file, line, spelling, note) {
  return { id: `${kind}:${file}:${line}`, kind, file, line, spelling: spelling.trim(), note };
}

/** The macro a `macro_invocation` calls, or null. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function invokedMacroOf(node) {
  return node.childForFieldName?.('macro')?.text ?? null;
}

/** The callee path of a `call_expression`, or null. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function calleeOf(node) {
  if (node.type !== 'call_expression') return null;
  return node.childForFieldName?.('function')?.text ?? null;
}

/**
 * Every dynamic mechanism one Rust file declares.
 *
 * Detection is deliberately syntactic. Calling a macro `include_str!` is a fact
 * about the text; whether the embedded file exists is a fact about a build, and
 * is exactly the kind of claim this layer does not make.
 */
export function detectRustMechanisms(tree, relativePath, { uses = [] } = {}) {
  const found = [];

  if (relativePath === BUILD_SCRIPT) {
    found.push(mechanism(
      'code_generation',
      relativePath,
      1,
      '# build script',
      'a build script runs before compilation and commonly writes source that no import names',
    ));
  }

  for (const use of uses) {
    if (RUNTIME_LOADING_CRATES.some((crateName) => use.target.includes(crateName))) {
      found.push(mechanism(
        'runtime_loading',
        relativePath,
        use.line,
        use.target,
        'a library loaded by name at run time is coupled to code the compiler never sees',
      ));
    }
  }

  walkNamed(tree.rootNode, (node) => {
    if (node.type === 'macro_invocation') {
      const macro = invokedMacroOf(node);
      if (macro === null) return;
      if (EMBEDDING_MACROS.includes(macro)) {
        found.push(mechanism(
          'compile_time_embedding',
          relativePath,
          node.startPosition.row + 1,
          node.text,
          `${macro}! makes a build-time input a dependency of this file`,
        ));
        return;
      }
      if (macro.startsWith('env') || macro === 'option_env') {
        found.push(mechanism(
          'config_driven',
          relativePath,
          node.startPosition.row + 1,
          node.text,
          `${macro}! selects between values by build configuration, which no import records`,
        ));
      }
      return;
    }

    if (node.type === 'macro_definition') {
      found.push(mechanism(
        'macro_expansion',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a macro rewrites the syntax tree, so code that exists after expansion may not appear before it',
      ));
      return;
    }

    if (node.type === 'dynamic_type') {
      found.push(mechanism(
        'dynamic_dispatch',
        relativePath,
        node.startPosition.row + 1,
        node.text,
        'a trait object dispatches to an implementation the compiler chooses, so the call target is not in the text',
      ));
      return;
    }

    if (node.type === 'foreign_mod_item' || node.type === 'extern_modifier') {
      found.push(mechanism(
        'ffi',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a foreign declaration leaves the type system, so no Rust-side analysis constrains the other side',
      ));
      return;
    }

    if (node.type === 'attribute_item' && CONDITIONAL_ATTRIBUTE.test(node.text.trim())) {
      found.push(mechanism(
        'conditional_compilation',
        relativePath,
        node.startPosition.row + 1,
        node.text,
        'a cfg attribute means the item exists only in some configurations, so a fact about it is a fact about a build',
      ));
      return;
    }

    const callee = calleeOf(node);
    if (callee === null) return;
    if (ENVIRONMENT_CALL_SUFFIXES.some((suffix) => isPathTo(callee, suffix))) {
      found.push(mechanism(
        'config_driven',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'the program reads its environment, so behaviour depends on a configuration no source states',
      ));
      return;
    }
    if (REFLECTION_CALL_SUFFIXES.some((suffix) => isPathTo(callee, suffix))) {
      found.push(mechanism(
        'reflection',
        relativePath,
        node.startPosition.row + 1,
        node.text.split('\n')[0],
        'a type identity is recovered at run time, so which code runs is decided by the value rather than by the text',
      ));
    }
  });

  // One node can be reachable as two kinds — a foreign module item and its
  // extern modifier are the same declaration — so the identity of a mechanism
  // is its kind and location, and a repeat of that pair is the same evidence.
  const byIdentity = new Map();
  for (const item of found) {
    if (!byIdentity.has(item.id)) byIdentity.set(item.id, item);
  }
  return [...byIdentity.values()];
}

/**
 * The files the surface measurement attempts: in-scope, and of a known language.
 *
 * An unreadable entry stays in the population so that its attempt fails and
 * leaves a ledger row, rather than disappearing from the measurement without
 * anything recording that it was skipped.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function measuredFiles(root, excludedPaths) {
  const excluded = new Set(excludedPaths);
  return listArtefacts(root)
    .filter((artefact) => !artefact.exclusion && !excluded.has(artefact.path))
    .map((artefact) => artefact.path)
    .filter((path) => syntaxLanguageOf(path) !== 'unknown')
    .sort(compareText);
}

/**
 * R2.5 — the execution surface.
 *
 * @param {{root: string, excludedPaths?: string[], grammar?: object|null}} params
 */
export function measureExecutionSurface({ root, excludedPaths = [], grammar } = {}) {
  const coverage = emptyCoverage();
  const attempts = [];
  const limitations = [];
  const mechanisms = [];

  const files = measuredFiles(root, excludedPaths);
  coverage.files_discovered = files.length;

  for (const file of files) {
    const language = syntaxLanguageOf(file);
    if (language !== 'rust') {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: `tree-sitter-${language}`,
        outcome: {
          phase: 'parse',
          status: 'skipped',
          extractedCount: 0,
          reason: 'no_mechanism_extractor_for_language',
        },
      }));
      continue;
    }

    const parsed = parseSourceFile(root, file, { grammar });
    if (!parsed.ok) {
      attempts.push(recordAttempt({
        target: file,
        configuration: 'syntax-only',
        tool: 'tree-sitter-rust',
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

    coverage.files_parsed += 1;
    if (parsed.errorNodes) coverage.files_with_error_nodes += 1;

    const fileMechanisms = detectRustMechanisms(parsed.tree, file, { uses: collectRustUses(parsed.tree, file) });
    const recovery = parsed.errorNodes ? syntaxRecoveryDiagnostic(parsed.tree) : null;
    if (recovery !== null) {
      limitations.push({
        code: 'SURFACE_PARTIAL_ON_PARSE_ERROR',
        scope: file,
        effect: `${recovery.message}. Mechanisms inside the recovered region may not have been detected, `
          + 'so an absent mechanism here is a limit of the pinned grammar rather than a fact about the file',
      });
    }

    mechanisms.push(...fileMechanisms);
    attempts.push(recordAttempt({
      target: file,
      configuration: 'syntax-only',
      tool: 'tree-sitter-rust',
      outcome: {
        phase: 'parse',
        status: parsed.errorNodes ? 'partial' : 'success',
        diagnostics: recovery === null ? [] : [recovery],
        extractedCount: fileMechanisms.length,
        reason: null,
      },
    }));
  }

  const unextractedLanguages = new Set(
    files.map(syntaxLanguageOf).filter((language) => language !== 'rust'),
  );
  for (const language of [...unextractedLanguages].sort(compareText)) {
    limitations.push({
      code: 'EXTRACTOR_NOT_WRITTEN',
      scope: `**/*.${language}`,
      effect: `${language} is reachable by the syntax layer but this instrument version enumerates no mechanisms for it, so an empty surface for those files means they were not examined for one`,
    });
  }

  return assertAdapterResult({
    analysis_mode: ANALYSIS_MODES[0],
    coverage: { ...coverage, files_semantically_resolved: 0 },
    limitations,
    mechanisms: mechanisms.sort((left, right) => compareText(left.id, right.id)),
    presence_not_absence: PRESENCE_NOT_ABSENCE,
    attempts,
  });
}

/**
 * Classify a proposition, refusing `observed` when a dynamic mechanism is in play.
 *
 * This is rule R-1 made mechanical. A proposition that touches a listed
 * mechanism may not be called `observed` on source evidence alone, because the
 * source does not determine which implementation runs: it is demoted to
 * `inferred`, which is the classification that asks a human to weigh it.
 *
 * A proposition touching no mechanism, and supported by at least one piece of
 * evidence, may be `observed` from the source text — that is what the static
 * half of the design is for.
 *
 * @param {{proposition: {mechanisms?: string[]}, evidence: Array<{evidence_mode: string}>, surface?: object|null}} params
 * @returns {{classification: string, reason: string}}
 */
export function classifyWithDynamicEvidence({ proposition, evidence = [], surface = null }) {
  const touched = proposition?.mechanisms ?? [];
  const dynamicEvidence = evidence.filter((item) => item.evidence_mode !== EVIDENCE_MODES[0]);

  if (touched.length > 0 && dynamicEvidence.length === 0) {
    const known = new Map((surface?.mechanisms ?? []).map((item) => [item.id, item]));
    const named = touched
      .map((id) => known.get(id))
      .filter((item) => item !== undefined)
      .map((item) => `${item.kind} at ${item.file}:${item.line}`);
    const where = named.length > 0 ? ` (${named.join('; ')})` : '';
    return {
      classification: 'inferred',
      reason: `the proposition touches ${touched.length} dynamic mechanism(s)${where}, and no dynamic evidence exists for it — `
        + 'the source does not determine which implementation runs, so observed is refused and the proposition is handed to a human to weigh',
    };
  }

  if (evidence.length === 0) {
    return {
      classification: 'unresolved',
      reason: 'no evidence was supplied, so there is nothing to observe the proposition from',
    };
  }

  return {
    classification: 'observed',
    reason: touched.length === 0
      ? 'the proposition touches no dynamic mechanism and is supported by evidence read from the source'
      : `the proposition touches a dynamic mechanism and is supported by ${dynamicEvidence.length} piece(s) of dynamic evidence`,
  };
}

/** The execution surface report, as Markdown for a reader rather than JSON for a machine. */
export function renderExecutionSurfaceReport(surface) {
  const byKind = new Map();
  for (const item of surface.mechanisms) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, []);
    byKind.get(item.kind).push(item);
  }

  const lines = [
    '# R2.5 — the execution surface',
    '',
    `Analysis mode: \`${surface.analysis_mode}\`.`,
    '',
    `> ${surface.presence_not_absence}`,
    '',
    '## What was found',
    '',
    '| Mechanism kind | Count |',
    '|---|---|',
    ...[...byKind.entries()]
      .sort((left, right) => compareText(left[0], right[0]))
      .map(([kind, items]) => `| \`${kind}\` | ${items.length} |`),
    '',
    '## Every mechanism, with its location',
    '',
    ...renderCappedList(
      surface.mechanisms,
      (item) => `- \`${item.kind}\` — \`${item.file}:${item.line}\` — \`${item.spelling}\`\n  - ${item.note}`,
    ),
    '',
    'Every mechanism above is a place where the import graph and the running program can disagree.',
    'A proposition touching one of them may not be classified `observed` without dynamic evidence (R-1).',
    '',
    '## Limitations',
    '',
    ...renderCappedList(
      surface.limitations,
      (limitation) => `- \`${limitation.code}\` over \`${limitation.scope}\` — ${limitation.effect}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}
