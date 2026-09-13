// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
/**
 * The language representatives — the declaration, read, measured and verified.
 *
 * The population is **data**. Design §7's direction for this phase is "publish
 * gaps; do not hide them", and the only way to test a six-language vocabulary is
 * to run it over material — so the six trees are named once, in
 * `fixtures/languages/LANGUAGES.json`, and every later ticket reaches them
 * through this module rather than through a path typed into its own test file. A
 * language dropped from the declaration fails a test here instead of being
 * dropped from one test file at a time.
 *
 * Three functions carry the three duties, and they are kept apart:
 *
 *   - `buildDeclaration` measures a tree and writes down what it found. A
 *     construct it cannot find is recorded with a `null` line rather than
 *     omitted, so a claim the tree does not support is visible.
 *   - `verifyRepresentative` compares one recorded entry against the tree and
 *     returns findings. It never repairs: a digest that does not reproduce is
 *     reported with both digests and both environments, because an automatic
 *     re-pin would move the population without anything saying so.
 *   - `verifyDeclaration` checks the declaration's shape — the language set, the
 *     three populations' separation, and that no root hides inside another. It
 *     composes with `verifyRepresentative` rather than repeating it.
 *
 * The declaration is the *instrument's* validation population. It is not the
 * experiment's input and not the pattern audit's input; the three are named
 * separately in the declaration so a validation tree can never be reached as an
 * answer key.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { arch, platform } from 'node:process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGET_LANGUAGES, languageOfPath } from './analysis-tech.mjs';
import { compareText, digestTree, listTreeFiles } from './holdout-ledger.mjs';

/** The project this module belongs to: `<root>/.claude/scripts/workspacify-reverse/lib` walked back to the root that holds `Tickets.json`. */
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** Where the declaration lives, relative to the project root. */
export const LANGUAGE_DECLARATION_PATH = 'tests/workspacify-reverse/fixtures/languages/LANGUAGES.json';

/** The experiment's own subject, and the frozen key the reconciliation reads. */
export const EXPERIMENT_SUBJECT_ROOT = 'siprs-for-reverse';
export const ORACLE_ROOT = 'siprs-with-4layers';

/** The four representatives P23-12's audit reads, in the design's pattern order. */
export const PATTERN_REPRESENTATIVE_ROOTS = Object.freeze([
  EXPERIMENT_SUBJECT_ROOT,
  ORACLE_ROOT,
  'tests/workspacify-reverse/fixtures/patterns/partial-conver-project',
  'tests/workspacify-reverse/fixtures/patterns/spec-only-project',
]);

/**
 * Where each language's representative lives.
 *
 * Rust is the language the instrument already exercised, so its representative is
 * an existing fixture rather than a sixth tree: the five trees beside the two
 * siprs trees are the non-Rust languages, and inventing a second Rust subject
 * would have added a population rather than a row.
 */
export const REPRESENTATIVE_ROOTS = Object.freeze({
  rust: 'tests/workspacify-reverse/fixtures/r3-subject',
  typescript: 'tests/workspacify-reverse/fixtures/languages/typescript',
  javascript: 'tests/workspacify-reverse/fixtures/languages/javascript',
  go: 'tests/workspacify-reverse/fixtures/languages/go',
  python: 'tests/workspacify-reverse/fixtures/languages/python',
  c_cpp: 'tests/workspacify-reverse/fixtures/languages/c_cpp',
});

/** The manifest that makes each representative a project rather than a directory of files. */
export const MANIFEST_BY_LANGUAGE = Object.freeze({
  rust: 'Cargo.toml',
  typescript: 'package.json',
  javascript: 'package.json',
  go: 'go.mod',
  python: 'pyproject.toml',
  c_cpp: 'CMakeLists.txt',
});

/** The build command per language, and the ENV-DEPS toolchain that command needs. */
export const BUILD_BY_LANGUAGE = Object.freeze({
  rust: Object.freeze({ command: 'cargo test', toolchain: 'cargo' }),
  typescript: Object.freeze({ command: 'npx --no-install tsc --noEmit', toolchain: 'npm' }),
  javascript: Object.freeze({ command: 'node --test src/__tests__/*.spec.js', toolchain: 'node' }),
  go: Object.freeze({ command: 'go test ./...', toolchain: 'go' }),
  // `-B` keeps the interpreter from writing bytecode caches into the tree: a
  // subject whose declared command rewrote it would stop reproducing its digest.
  python: Object.freeze({ command: 'python3 -B -m unittest discover -s tests', toolchain: 'python3' }),
  c_cpp: Object.freeze({ command: 'cmake -S . -B build && cmake --build build && ctest --test-dir build', toolchain: 'clang' }),
});

/**
 * The constructs each representative was chosen for, as the text a reader finds.
 *
 * They are named constants rather than strings typed into the declaration, so a
 * marker's spelling cannot drift between the tree and the entry that claims it.
 * Each is a construct the later tickets' extractors are specified to reach and
 * that a syntax layer alone cannot resolve — which is what makes the tree
 * material to measure rather than a directory that happens to be there.
 */
export const CONSTRUCT_MARKERS = Object.freeze({
// [::TICKET::] P24-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-3 --for-spec --no-implementation-order`.
  rust: Object.freeze({
    'enum-declaration': 'pub enum LoginError',
    'function-declaration': 'pub fn login',
    'impl-block': 'impl Session',
    'conditional-compilation': '#[cfg(feature = "ffi")]',
    'test-attribute': '#[test]',
  }),
  typescript: Object.freeze({
    'export-star': 'export *',
    'declaration-merge': 'interface Box',
    // P24-3: the dynamic load E6 reads as a mechanism site rather than E5 as an
    // edge, because the specifier is a value and not a name.
    'dynamic-import': 'import(moduleName)',
  }),
  javascript: Object.freeze({
    'computed-property-name': '[widgetKey]',
    'dynamic-require': 'require(moduleName)',
    'prototype-method': 'Widget.prototype.render',
  }),
  go: Object.freeze({
    'build-tag': '//go:build linux',
    'embedded-struct': 'widgetBase',
    'table-driven-test': 'for _, testCase := range testCases',
    // P24-3: a package of this module imported by another, so the representative
    // carries a dependency across a directory boundary and not only within one.
    'intra-module-import': 'example.test/widget/pkg/label',
  }),
  python: Object.freeze({
    metaclass: 'metaclass=RegistryMeta',
    decorator: '@traced',
    'getattr-hook': 'def __getattr__',
  }),
  c_cpp: Object.freeze({
    'function-like-macro': '#define MAX_OF(',
    'conditional-compilation': '#if defined(WIDGET_FAST)',
    'shared-header': '#include "widget.h"',
    'shared-header-again': '#include "widget.h"',
  }),
});

/**
 * The one file a construct is pinned to, where pinning it matters.
 *
 * A marker that occurs in several files — an include, a test attribute — names
 * the wrong place if the search stops at the first file that contains it. A
 * construct absent from this table is searched across the whole tree.
 */
export const CONSTRUCT_SEARCH_PATHS = Object.freeze({
  rust: Object.freeze({ 'test-attribute': 'tests/login_test.rs' }),
  c_cpp: Object.freeze({
    'shared-header': 'src/widget.cpp',
    'shared-header-again': 'src/widget_extra.cpp',
  }),
});

/**
 * The file a language's build compiles before anything else, where its manifest
 * alone does not establish that one exists.
 *
 * A Rust manifest can be present and the crate still have no root. The other
 * languages in this population root their builds at the manifest itself, so they
 * need no entry here.
 */
const BUILD_ROOT_BY_LANGUAGE = Object.freeze({
  rust: Object.freeze({ candidates: Object.freeze(['src/lib.rs', 'src/main.rs']), reads: 'crate root' }),
});

/** The findings this module reports, named so a consumer can branch on a code rather than on a sentence. */
export const FINDING_CODES = Object.freeze({
  DIGEST_MISMATCH: 'digest-mismatch',
  REVISION_UNRESOLVABLE: 'revision-unresolvable',
  CONSTRUCT_PATH_ABSENT: 'construct-path-absent',
  CONSTRUCT_MARKER_ABSENT: 'construct-marker-absent',
  LANGUAGE_WITHOUT_REPRESENTATIVE: 'language-without-representative',
  UNKNOWN_LANGUAGE: 'unknown-language',
  ABSENT_OFFLINE_FLAG: 'absent-offline-flag',
  OFFLINE_WITHOUT_REASON: 'offline-without-reason',
  FLAT_FLAG_ABSENT: 'flat-flag-absent',
  POPULATION_OVERLAP: 'population-overlap',
});

/** The claim `offline` makes, stated once so the reason text and the tests agree. */
const OFFLINE_MEANING = 'the build reaches no network';

const DECLARATION_COMMENT = [
  'The six language representatives: the instrument\'s validation population.',
  'Each entry is measured from its tree — the digest, the construct lines and the build flag are read, not typed.',
  'Regenerating it with the recorded revisions produces this file byte for byte; a digest that stops reproducing is reported rather than re-pinned.',
].join(' ');

const EXPERIMENT_PURPOSE =
  'The experiment\'s own subject. The reverse rotation runs over `siprs-for-reverse`, with '
  + '`siprs-with-4layers` frozen as the key it reconciles against. Nothing in this population is a validation tree.';

const ORACLE_PURPOSE = 'The frozen answer key: the layered tree the experiment is reconciled against, and never an input to it.';

const PATTERN_PURPOSE =
  'The four pattern representatives P23-12\'s audit reads — the experiment pair and the two fixtures under '
  + '`fixtures/patterns/`. They are separate from the language population, so no validation tree can be reached as an answer key.';

const LANGUAGE_PURPOSE =
  'The instrument\'s validation population: the six representatives the six-language vocabulary, name filters and '
  + 'grammars are measured against. It is not the experiment\'s input and not the pattern audit\'s input — it exists '
  + 'to make an untested table a tested one.';

/** How each language's manifest declares a dependency that must be fetched. */
const DEPENDENCY_READER_BY_LANGUAGE = Object.freeze({
  rust: declaredRustDependencies,
  typescript: declaredNpmDependencies,
  javascript: declaredNpmDependencies,
  go: declaredGoDependencies,
  python: declaredPythonDependencies,
  c_cpp: declaredCMakeDependencies,
});

/** What counts as this language's test file, by the convention the language itself uses. */
const TEST_FILE_PATTERN_BY_LANGUAGE = Object.freeze({
  rust: /(^|\/)tests\/|_test\.rs$/,
  typescript: /\.(spec|test)\.(ts|tsx|mts|cts)$/,
  javascript: /\.(spec|test)\.(js|mjs|cjs|jsx)$/,
  go: /_test\.go$/,
  python: /(^|\/)test_[^/]*\.py$/,
  c_cpp: /(^|\/)test_[^/]*\.(c|cc|cpp|cxx)$/,
});

/**
 * The declaration, or a failure that says which file is missing.
 *
 * A missing declaration is not an empty population: it is a broken instrument,
 * and a reader that treated it as "no representatives" would report the
 * population as exercised-and-clean.
 */
export function loadLanguageRepresentatives({ projectRoot = PROJECT_ROOT, declarationPath = LANGUAGE_DECLARATION_PATH } = {}) {
  const declarationFile = join(projectRoot, declarationPath);
  if (!existsSync(declarationFile)) {
    throw new Error(`no language declaration at ${declarationPath} — the population must be declared before it can be read`);
  }
  try {
    return JSON.parse(readFileSync(declarationFile, 'utf8'));
  } catch (error) {
    throw new Error(`${declarationPath} is not valid JSON: ${error.message}`);
  }
}

/** The declaration as the bytes a writer would produce, so regenerating it produces no spurious diff. */
export function serialiseDeclaration(declaration) {
  return `${JSON.stringify(declaration, null, 2)}\n`;
}

/**
 * A content digest of one representative, plus the file count it was taken over.
 *
 * This is the command the declaration records and the test re-runs: a pin that
 * cannot be re-derived is a value a reader has to trust.
 */
export function digestRepresentative(language, { projectRoot = PROJECT_ROOT, root = REPRESENTATIVE_ROOTS[language] } = {}) {
  if (typeof root !== 'string') {
    throw new Error(`${language} is not a declared target language: ${TARGET_LANGUAGES.join(', ')}`);
  }
  return digestTree(resolve(projectRoot, root));
}

/**
 * One entry, measured from a tree.
 *
 * The revision is deliberately absent: a pin is not something a walk can
 * derive, and `buildDeclaration` carries the recorded one rather than inventing
 * a replacement for it.
 */
export function buildDeclarationEntry(language, root, { projectRoot = PROJECT_ROOT } = {}) {
  const absoluteRoot = resolve(projectRoot, root);
  const files = listTreeFiles(absoluteRoot);
  const languages = files.map((file) => languageOfPath(file)).filter((found) => found !== 'unknown');
  const digest = digestTree(absoluteRoot);

  return {
    language,
    root: toPosixPath(relative(projectRoot, absoluteRoot)),
    treeDigest: { sha256: digest.sha256, fileCount: digest.fileCount, unreadable: digest.unreadable },
    environment: { os: platform, arch, commandLine: digestCommandLine(language) },
    build: describeBuild(language, absoluteRoot),
    flat: files.every((file) => !file.includes('/')),
    dominantLanguage: dominantLanguageOf(languages),
    languagesInTree: [...new Set(languages)].sort(compareText),
    testFileCount: files.filter((file) => TEST_FILE_PATTERN_BY_LANGUAGE[language].test(file)).length,
    constructs: measureConstructs(language, absoluteRoot, files),
  };
}

/**
 * The whole declaration, measured from the six trees.
 *
 * A recorded revision is carried across rather than re-derived, which is the
 * difference between regenerating a declaration and re-pinning a population: the
 * caller passes the declaration it has, and a tree whose content moved is
 * reported by `verifyRepresentative` instead of being absorbed here.
 */
export function buildDeclaration({ projectRoot = PROJECT_ROOT, previous = null } = {}) {
  const languages = TARGET_LANGUAGES.map((language) => {
    const entry = buildDeclarationEntry(language, REPRESENTATIVE_ROOTS[language], { projectRoot });
    const recorded = previous?.languages?.find((candidate) => candidate.language === language);
    const revision = recorded && recorded.root === entry.root
      ? recorded.revision
      : measureRevision(entry.root, { projectRoot });

    return {
      language: entry.language,
      root: entry.root,
      revision,
      treeDigest: entry.treeDigest,
      environment: entry.environment,
      build: entry.build,
      flat: entry.flat,
      dominantLanguage: entry.dominantLanguage,
      languagesInTree: entry.languagesInTree,
      testFileCount: entry.testFileCount,
      constructs: entry.constructs,
    };
  });

  return {
    version: 1,
    comment: DECLARATION_COMMENT,
    populations: {
      experiment: { purpose: EXPERIMENT_PURPOSE, roots: [EXPERIMENT_SUBJECT_ROOT] },
      oracle: { purpose: ORACLE_PURPOSE, roots: [ORACLE_ROOT] },
      patterns: { purpose: PATTERN_PURPOSE, roots: [...PATTERN_REPRESENTATIVE_ROOTS], declaredBy: 'P23-11' },
      languages: { purpose: LANGUAGE_PURPOSE, roots: languages.map((entry) => entry.root), declaredBy: 'P24-1' },
    },
    languages,
  };
}

/**
 * The declaration's shape, as findings.
 *
 * The set equality is asserted in both directions so that a language cannot
 * leave the population by leaving the declaration, and the separation of the
 * three populations is asserted here rather than left to a reader's memory: this
 * is the check that stops a validation tree becoming an answer key.
 */
export function verifyDeclaration(declaration) {
  const findings = [];
  const entries = declaration.languages ?? [];
  const declaredLanguages = new Set(entries.map((entry) => entry.language));

  for (const language of TARGET_LANGUAGES) {
    if (!declaredLanguages.has(language)) {
      findings.push({
        code: FINDING_CODES.LANGUAGE_WITHOUT_REPRESENTATIVE,
        language,
        path: null,
        line: null,
        message: `${language} is a declared target language and has no representative, so nothing measures it`,
      });
    }
  }
  for (const entry of entries) {
    if (!TARGET_LANGUAGES.includes(entry.language)) {
      findings.push({
        code: FINDING_CODES.UNKNOWN_LANGUAGE,
        language: entry.language,
        path: entry.root ?? null,
        line: null,
        message: `${entry.language} is not one of the six declared target languages, so no grammar claims to read it`,
      });
    }
  }

  return [...findings, ...verifyPopulationSeparation(declaration, entries)];
}

/**
 * One entry against its tree, as findings.
 *
 * Nothing here repairs anything. A digest that does not reproduce, a construct
 * that is not where the declaration says it is, and a pin that resolves to no
 * commit are all reported, because each of them is a case where the population
 * moved or the claim was never true.
 */
export function verifyRepresentative(entry, { projectRoot = PROJECT_ROOT, digest = digestTree } = {}) {
  const findings = [];
  const absoluteRoot = resolve(projectRoot, entry.root);

  if (typeof entry.flat !== 'boolean') {
    findings.push(entryFinding(FINDING_CODES.FLAT_FLAG_ABSENT, entry, 'flatness is not stated, so a flat tree would be used for a partition it cannot support'));
  }
  if (typeof entry.build?.offline !== 'boolean') {
    findings.push(entryFinding(FINDING_CODES.ABSENT_OFFLINE_FLAG, entry, `the offline flag is absent, so the build is assumed to reach no network rather than measured to`));
  } else if (entry.build.offline === false && typeof entry.build.reason !== 'string') {
    findings.push(entryFinding(FINDING_CODES.OFFLINE_WITHOUT_REASON, entry, 'the build is declared not to run offline without saying what it needs'));
  }
  if (!revisionResolves(entry.revision, projectRoot)) {
    findings.push(entryFinding(FINDING_CODES.REVISION_UNRESOLVABLE, entry, `the recorded revision ${entry.revision?.commit ?? 'null'} resolves to no commit in this repository`));
  }

  const measured = digest(absoluteRoot);
  if (measured.sha256 !== entry.treeDigest?.sha256) {
    findings.push({
      ...entryFinding(FINDING_CODES.DIGEST_MISMATCH, entry, 'the tree does not reproduce its recorded digest, and is reported rather than re-pinned'),
      recorded: {
        sha256: entry.treeDigest?.sha256 ?? null,
        fileCount: entry.treeDigest?.fileCount ?? null,
        environment: entry.environment ?? null,
      },
      measured: { sha256: measured.sha256, fileCount: measured.fileCount, environment: { os: platform, arch } },
    });
  }

  for (const construct of entry.constructs ?? []) {
    findings.push(...verifyConstruct(entry, construct, absoluteRoot));
  }

  return findings;
}

/** One construct against the file and line the declaration names. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function verifyConstruct(entry, construct, absoluteRoot) {
  const named = {
    code: FINDING_CODES.CONSTRUCT_PATH_ABSENT,
    language: entry.language,
    construct: construct.id,
    path: construct.path ?? null,
    line: construct.line ?? null,
  };

  if (typeof construct.path !== 'string' || !existsSync(join(absoluteRoot, construct.path))) {
    return [{ ...named, message: `${entry.language}/${construct.id} names ${construct.path ?? 'no path'}, which is not in the tree` }];
  }

  const line = readFileSync(join(absoluteRoot, construct.path), 'utf8').split('\n')[construct.line - 1];
  if (typeof line !== 'string' || !line.includes(construct.marker)) {
    return [{
      ...named,
      code: FINDING_CODES.CONSTRUCT_MARKER_ABSENT,
      message: `${entry.language}/${construct.id} is declared at ${construct.path}:${construct.line}, where "${construct.marker}" is not`,
    }];
  }
  return [];
}

/** The two ways the populations could be conflated: the same root twice, or one root inside another. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function verifyPopulationSeparation(declaration, entries) {
  const findings = [];
  const populations = declaration.populations ?? {};
  const otherRoots = [
    ...(populations.experiment?.roots ?? []),
    ...(populations.oracle?.roots ?? []),
    ...(populations.patterns?.roots ?? []),
  ];

  for (const entry of entries) {
    if (otherRoots.includes(entry.root)) {
      findings.push({
        ...entryFinding(FINDING_CODES.POPULATION_OVERLAP, entry, `${entry.root} is named by another population, so a validation tree could be reached as an answer key`),
      });
    }
    for (const other of entries) {
      if (other === entry || other.root === entry.root) continue;
      if (other.root.startsWith(`${entry.root}/`)) {
        findings.push({
          code: FINDING_CODES.POPULATION_OVERLAP,
          language: other.language,
          path: other.root,
          line: null,
          message: `${entry.root} holds ${other.root}, so one representative is inside another`,
        });
      }
    }
  }
  return findings;
}

/** A finding about an entry rather than about a line of code. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function entryFinding(code, entry, message) {
  return { code, language: entry.language, path: entry.root ?? null, line: null, message };
}

/**
 * The command line a reader re-runs to take the digest again, with the
 * declaration's own root as the working directory.
 *
 * The digest is written as data rather than logged, so the command's whole
 * output is the value being compared.
 */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function digestCommandLine(language) {
  const modulePath = './.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
  return `node -e "import('${modulePath}').then((module) => process.stdout.write(module.digestRepresentative('${language}').sha256))"`;
}

/**
 * The build command, and whether an execution channel may run it.
 *
 * The flag is read from the tree itself rather than from the machine the
 * measurement happens on, so the declaration is a statement about the
 * representative and regenerating it on another host produces the same file.
 *
 * Two things make a build unrunnable, and both are recorded rather than assumed
 * away. A manifest that names a fetched dependency needs the network; a crate
 * whose manifest is present but which declares no root has nothing to compile,
 * which is the shape every Rust subject in this suite has — they serve the
 * static measurements and must not be handed to an execution channel that would
 * fail on them. Assuming a build runs is the dangerous direction, so an
 * unreadable manifest is recorded as not-offline too.
 */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function describeBuild(language, representativeRoot) {
  const command = BUILD_BY_LANGUAGE[language].command;
  const manifest = MANIFEST_BY_LANGUAGE[language];
  const manifestPath = join(representativeRoot, manifest);

  if (!existsSync(manifestPath)) {
    return { command, offline: false, reason: `${manifest} is not in the tree, so ${command} cannot run` };
  }

  const buildRoot = BUILD_ROOT_BY_LANGUAGE[language];
  if (buildRoot && !buildRoot.candidates.some((candidate) => existsSync(join(representativeRoot, candidate)))) {
    return {
      command,
      offline: false,
      reason: `${manifest} is present and the tree declares no ${buildRoot.reads} (${buildRoot.candidates.join(' or ')}), `
        + `so ${command} cannot build it — a valid subject for the static measurements and not for the execution channels`,
    };
  }

  let declared;
  try {
    declared = DEPENDENCY_READER_BY_LANGUAGE[language](readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { command, offline: false, reason: `${manifest} could not be read (${error.message}), so the build cannot be assumed to reach no network` };
  }

  if (declared.length === 0) {
    return { command, offline: true, reason: `${manifest} declares no dependency outside the tree, so ${OFFLINE_MEANING}` };
  }
  return {
    command,
    offline: false,
    reason: `${manifest} declares ${declared.join(', ')}, which must be present before ${command} can run`,
  };
}

/** The dependency names a `package.json` declares, or none. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function declaredNpmDependencies(manifestText) {
  const manifest = JSON.parse(manifestText);
  return [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
}

/** The crate names a `Cargo.toml` declares in any of its dependency sections. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function declaredRustDependencies(manifestText) {
  const declared = [];
  let insideDependencySection = false;

  for (const line of manifestText.split('\n')) {
    const section = /^\s*\[([^\]]+)\]/.exec(line);
    if (section) {
      insideDependencySection = /(^|-)dependencies$/.test(section[1].trim());
      continue;
    }
    const trimmed = line.trim();
    if (!insideDependencySection || trimmed === '' || trimmed.startsWith('#')) continue;
    declared.push(trimmed.split('=')[0].trim());
  }
  return declared;
}

/** The module paths a `go.mod` requires, in either the block or the one-line form. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function declaredGoDependencies(manifestText) {
  const declared = [];
  let insideRequireBlock = false;

  for (const line of manifestText.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'require (') {
      insideRequireBlock = true;
      continue;
    }
    if (insideRequireBlock && trimmed === ')') {
      insideRequireBlock = false;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (insideRequireBlock) declared.push(trimmed.split(/\s+/)[0]);
    if (trimmed.startsWith('require ')) declared.push(trimmed.replace(/^require\s+/, '').split(/\s+/)[0]);
  }
  return declared;
}

/** The distributions a `pyproject.toml` names for its build backend and for the project itself. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function declaredPythonDependencies(manifestText) {
  const declared = [];
  for (const key of ['requires', 'dependencies']) {
    const array = new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm').exec(manifestText);
    if (!array) continue;
    declared.push(...(array[1].match(/"[^"]+"|'[^']+'/g) ?? []));
  }
  return declared;
}

/** The content a `CMakeLists.txt` fetches at configure time. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function declaredCMakeDependencies(manifestText) {
  const declared = [];
  for (const line of manifestText.split('\n')) {
    const fetched = /^\s*(?:FetchContent_Declare|ExternalProject_Add)\s*\(\s*([^\s)]+)/.exec(line);
    if (fetched) declared.push(fetched[1]);
  }
  return declared;
}

/**
 * Where each declared construct is, measured from the tree rather than read from the entry.
 *
 * Only the language's own files are searched. A marker quoted in a README is the
 * prose about the construct, not the construct, and a declaration that pinned
 * `export *` to a line of documentation would be claiming the wrong thing while
 * passing every check.
 */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function measureConstructs(language, absoluteRoot, files) {
  const markers = CONSTRUCT_MARKERS[language];
  const pinnedPaths = CONSTRUCT_SEARCH_PATHS[language] ?? {};
  const sourceFiles = files.filter((file) => languageOfPath(file) === language);

  return Object.keys(markers).map((id) => {
    const marker = markers[id];
    const pinned = pinnedPaths[id];
    const candidates = pinned
      ? (sourceFiles.includes(pinned) ? [pinned] : [])
      : [...sourceFiles].sort(compareText);
    const found = findMarker(candidates, absoluteRoot, marker);

    return { id, marker, path: found?.path ?? pinned ?? null, line: found?.line ?? null };
  });
}

/** The first file, in the order given, that carries the marker, and the line it carries it on. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function findMarker(candidates, absoluteRoot, marker) {
  for (const file of candidates) {
    const line = readFileSync(join(absoluteRoot, file), 'utf8').split('\n').findIndex((text) => text.includes(marker));
    if (line >= 0) return { path: file, line: line + 1 };
  }
  return null;
}

/** The language most of the tree's classified files are written in, or `unknown`. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function dominantLanguageOf(languages) {
  const counts = new Map();
  for (const language of languages) counts.set(language, (counts.get(language) ?? 0) + 1);

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]));
  return ranked.length === 0 ? 'unknown' : ranked[0][0];
}

/**
 * The revision a tree is pinned to, as `ANALYSIS-SCOPE.json` records one.
 *
 * These trees are not repositories of their own, so the revision is the
 * containing one plus the path the tree sits at beneath it — the pair that says
 * where to look, which a bare commit does not.
 */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function measureRevision(root, { projectRoot }) {
  const absoluteRoot = resolve(projectRoot, root);
  const workTree = gitOutput(absoluteRoot, ['rev-parse', '--show-toplevel']);
  const commit = gitOutput(absoluteRoot, ['rev-parse', 'HEAD']);

  if (workTree === null || commit === null) {
    return { root: null, pathWithinWorkTree: null, commit: null, isOwnRepository: false };
  }
  return {
    root: workTree,
    pathWithinWorkTree: toPosixPath(relative(workTree, absoluteRoot)),
    commit,
    isOwnRepository: resolve(workTree) === absoluteRoot,
  };
}

/** Whether the recorded commit is one this repository holds. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function revisionResolves(revision, projectRoot) {
  const commit = revision?.commit;
  if (typeof commit !== 'string' || commit.length === 0) return false;
  const probe = spawnSync('git', ['-C', projectRoot, 'cat-file', '-e', `${commit}^{commit}`], { encoding: 'utf8' });
  return probe.status === 0;
}

/** One git query in a directory, or null when git cannot answer. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function gitOutput(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

/** A path with forward slashes, so a declaration written here reads the same on every platform. */
// [::TICKET::] P24-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-1 --for-spec --no-implementation-order`.
function toPosixPath(path) {
  return path.split('\\').join('/');
}
