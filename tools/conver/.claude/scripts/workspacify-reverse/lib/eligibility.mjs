// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
/**
 * R0 — whether this project affords the reverse rotation at all.
 *
 * ABOUT-REVERSE 3.6 asks six questions before anything runs, and this module
 * answers as many of them as the source text can carry. There is no `eligible`
 * field, no score and no threshold: a score would look objective while encoding
 * a threshold nobody chose (ABOUT-REVERSE 7.7.2), and the design's 1.2 forbids
 * any gate that stops the run because the subject is incomplete. Nothing in the
 * analysis path reads this document back — it is material for the human's
 * decision about whether to start, taken at the moment that decision is cheap.
 *
 * A question the source channel cannot settle is `not_measurable_statically`,
 * never `not_established_statically`. "This channel cannot see it" and "the
 * project lacks it" are different facts, and merging them is failure F12 — the
 * same distinction `buildAttemptLedger` draws between `couldNotRunCount` and
 * `extractedNothingCount`, and `listArtefacts` draws between `unreadable` and
 * absent.
 *
 * The six conditions and the six signals are declared as data rather than as
 * branches, so adding one is adding a row and the test that counts them reads
 * the same table the reader iterates.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPORT_LIST_LIMIT, TARGET_LANGUAGES, languageOfPath, renderCappedList } from './analysis-tech.mjs';
import { GRAMMAR_BY_LANGUAGE } from './structure.mjs';
import {
  BUILD_MANIFESTS,
  LARGE_TREE_FILE_COUNT,
  TEST_COMMAND_BY_MANIFEST,
  TEST_DIRECTORY_NAMES,
  TEST_FILE_PATTERN,
  commentPrefixesFor,
  compareText,
} from './holdout-ledger.mjs';

/** R0 is the stage that runs this assessment, and the section it is published under. */
export const ELIGIBILITY_STAGE = 'r0';

/**
 * The three things that can be said about a condition without a verdict.
 *
 * The vocabulary is closed: a fourth value would be a new claim, and C001's
 * invariant asserts that no condition carries a boolean instead.
 */
export const ELIGIBILITY_STATES = Object.freeze([
  'established_statically',
  'not_established_statically',
  'not_measurable_statically',
]);

/**
 * The key fragments no part of this document may carry, at any depth.
 *
 * Exported so the test that walks the published object and the module that
 * builds it read the same list; a second copy would let the shape be
 * reintroduced without failing anything.
 */
export const FORBIDDEN_VERDICT_KEY_FRAGMENTS = Object.freeze([
  'eligible',
  'score',
  'verdict',
  'recommendation',
]);

/** The prose formats the documentation half of the last condition is read from. */
export const DOCUMENTATION_EXTENSIONS = Object.freeze(['.md', '.mdx', '.rst', '.adoc']);

/**
 * Where each declared build manifest names the project, so the evidence for the
 * build condition is a line a reader can open rather than a bare file name.
 *
 * A manifest whose pattern matches nothing reports a null line and says so: "the
 * declaration line was not located" is a fact about this reading, not about the
 * manifest.
 */
const MANIFEST_DECLARATION_PATTERNS = Object.freeze({
  'Cargo.toml': /^\s*\[package\]/,
  'package.json': /^\s*"name"\s*:/,
  'go.mod': /^\s*module\s/,
  'pyproject.toml': /^\s*\[project\]/,
  'setup.py': /^\s*setup\s*\(/,
  'CMakeLists.txt': /^\s*project\s*\(/,
  Makefile: /^[A-Za-z_][A-Za-z0-9_]*\s*:/,
});

/** How many characters of a commit hash are enough to name it in prose. */
const SHORT_COMMIT_LENGTH = 12;

/** Languages whose dominant metaprogramming ABOUT-REVERSE 3.6 names as a danger signal. */
const DYNAMIC_LANGUAGES = Object.freeze(['python', 'javascript']);

const ESTABLISHED = ELIGIBILITY_STATES[0];
const NOT_ESTABLISHED = ELIGIBILITY_STATES[1];
const NOT_MEASURABLE = ELIGIBILITY_STATES[2];

/**
 * The six necessary conditions of ABOUT-REVERSE 3.6, in the order the design lists them.
 *
 * `settlesBy` is the evidence mode that would settle the condition, which is
 * the channel named in `whatWouldSettleIt` whenever this run cannot settle it.
 */
export const ELIGIBILITY_CONDITIONS = Object.freeze([
  Object.freeze({
    id: 'builds',
    question: 'Does the project build?',
    settlesBy: 'build_semantic',
  }),
  Object.freeze({
    id: 'tests_exist_and_can_run',
    question: 'Do tests exist, and can they be run?',
    settlesBy: 'runtime_dynamic',
  }),
  Object.freeze({
    id: 'git_history_exists',
    question: 'Does a git history exist?',
    settlesBy: 'source_static',
  }),
  Object.freeze({
    id: 'main_language_analysable',
    question: 'Is the main language analysable?',
    settlesBy: 'source_static',
  }),
  Object.freeze({
    id: 'directory_structure_carries_meaning',
    question: 'Does the directory structure carry meaning?',
    settlesBy: 'source_static',
  }),
  Object.freeze({
    id: 'documentation_or_comments_survive',
    question: 'Do documentation or comments survive somewhere?',
    settlesBy: 'source_static',
  }),
]);

/**
 * The six danger signals of ABOUT-REVERSE 3.6, each with the question it asks.
 *
 * `raisesBy` is the channel that would raise it. A `null` means no machine
 * channel reaches it, which is the case for the one signal whose answer lives
 * with a person — the note states plainly that a human settles it.
 */
export const DANGER_SIGNALS = Object.freeze([
  Object.freeze({
    id: 'no_tests_or_tests_do_not_pass',
    question: 'Are tests missing, or present and not passing?',
    raisesBy: 'runtime_dynamic',
  }),
  Object.freeze({
    id: 'no_history',
    question: 'Is the history gone — squashed, or migrated from another VCS?',
    raisesBy: 'source_static',
  }),
  Object.freeze({
    id: 'generated_code_dominates',
    question: 'Does material the analysis records rather than reads dominate the tree?',
    raisesBy: 'source_static',
  }),
  Object.freeze({
    id: 'dynamic_language_metaprogramming_dominates',
    question: 'Is a dynamic language with dominant metaprogramming the population?',
    raisesBy: 'source_static',
  }),
  Object.freeze({
    id: 'knowledge_closed_to_one_person',
    question: 'Is the business knowledge closed to a particular person?',
    raisesBy: null,
  }),
  Object.freeze({
    id: 'too_large_for_mechanical_analysis',
    question: 'Is it too large for mechanical analysis to be realistic?',
    raisesBy: 'source_static',
  }),
]);

/** The relative path an evidence entry takes when the fact is about the root itself. */
const SUBJECT_ROOT_PATH = '.';

/** Whether a path is a test file, by the directory or the name it carries. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function isTestFile(relativePath) {
  const segments = relativePath.split('/');
  if (segments.some((segment) => TEST_DIRECTORY_NAMES.includes(segment))) return true;
  return TEST_FILE_PATTERN.test(segments.at(-1));
}

/** How many files each language contributes, counted from the path alone. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function languageCountsOf(paths) {
  const counts = new Map();
  for (const relativePath of paths) {
    const language = languageOfPath(relativePath);
    if (language === 'unknown') continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return counts;
}

/**
 * The language most of the source population is written in, or `null` when
 * there is no source file to name one from.
 *
 * Ascending order with a strictly-greater comparison breaks a tie towards the
 * alphabetically first language, so the answer does not depend on the order the
 * tree was walked in.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function dominantLanguageIn(paths) {
  const byAlphabet = [...languageCountsOf(paths).entries()]
    .sort((left, right) => compareText(left[0], right[0]));
  return byAlphabet.reduce(
    (dominant, [language, count]) => (count > dominant.count ? { language, count } : dominant),
    { language: null, count: 0 },
  );
}

/**
 * The directories the source population forms, and how concentrated it is.
 *
 * A completely flat tree has no source directory at all, and the share is then
 * `1` — every source file sits in the one place — so a flat project is visible
 * from the numbers rather than from a judgement about them.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function directoryFactsIn(sourceFiles) {
  const perDirectory = new Map();
  for (const artefact of sourceFiles) {
    const separator = artefact.path.lastIndexOf('/');
    if (separator === -1) continue;
    const directory = artefact.path.slice(0, separator);
    perDirectory.set(directory, (perDirectory.get(directory) ?? 0) + 1);
  }
  const total = sourceFiles.length;
  if (total === 0) return { directoryCount: 0, largestDirectoryShare: 0 };
  const largest = perDirectory.size === 0 ? total : Math.max(...perDirectory.values());
  return {
    directoryCount: perDirectory.size,
    largestDirectoryShare: Number((largest / total).toFixed(4)),
  };
}

/** The line a build manifest names the project on, and the reason when it does not. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function declarationLineIn(root, relativePath) {
  const pattern = MANIFEST_DECLARATION_PATTERNS[relativePath.split('/').pop()] ?? null;
  if (pattern === null) {
    return { line: null, reason: 'no declaration pattern is declared for this manifest, so no line was located' };
  }
  let text;
  try {
    text = readFileSync(join(root, relativePath), 'utf8');
  } catch (error) {
    return { line: null, reason: `${error.code ?? 'error'}: the manifest could not be read, so its declaration line was not located` };
  }
  const index = text.split('\n').findIndex((line) => pattern.test(line));
  return index === -1
    ? { line: null, reason: 'the manifest was read and holds no line matching the declaration its ecosystem names itself on' }
    : { line: index + 1, reason: null };
}

/**
 * The first comment line in the source population, and the files that could not
 * be read on the way to it.
 *
 * ABOUT-REVERSE 3.6 asks whether a comment survives *somewhere*, so this stops
 * at the first one rather than counting them all — an existence proof, bounded
 * by the first hit, that still reports the absence honestly when it scans the
 * whole population and finds none. A file the scan cannot read is recorded with
 * its reason rather than counted as comment-free.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function scanForFirstComment(root, sourceFiles) {
  const unreadable = [];
  let scanned = 0;
  for (const artefact of sourceFiles) {
    const prefixes = commentPrefixesFor(artefact.path);
    if (prefixes.length === 0) continue;
    let text;
    try {
      text = readFileSync(join(root, artefact.path), 'utf8');
    } catch (error) {
      const reason = `${error.code ?? 'error'}: the file could not be read`;
      unreadable.push({ path: artefact.path, line: null, note: `${reason}, so it is recorded as \`unreadable\` rather than as comment-free`, reason });
      continue;
    }
    scanned += 1;
    const index = text.split('\n').findIndex((line) => prefixes.some((prefix) => line.trimStart().startsWith(prefix)));
    if (index !== -1) {
      return { found: true, first: { path: artefact.path, line: index + 1 }, scanned, unreadable };
    }
  }
  return { found: false, first: null, scanned, unreadable };
}

/** The material every condition and every signal is read from. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function populationOf({ artefacts, root, history }) {
  const considered = artefacts.filter(
    (artefact) => artefact.coverage !== 'out_of_scope' && artefact.readStatus === 'readable',
  );
  const sourceFiles = considered
    .filter((artefact) => languageOfPath(artefact.path) !== 'unknown')
    .sort((left, right) => compareText(left.path, right.path));
  const excluded = artefacts.filter((artefact) => artefact.coverage === 'out_of_scope');
  const buildManifests = considered
    .filter((artefact) => BUILD_MANIFESTS.includes(artefact.path.split('/').pop()))
    .map((artefact) => artefact.path)
    .sort(compareText);
  const testFiles = sourceFiles.map((artefact) => artefact.path).filter(isTestFile);
  const documentationFiles = considered
    .filter((artefact) => DOCUMENTATION_EXTENSIONS.includes(artefact.path.slice(artefact.path.lastIndexOf('.')).toLowerCase()))
    .map((artefact) => artefact.path)
    .sort(compareText);
  const unreadable = artefacts.filter((artefact) => artefact.readStatus === 'unreadable');
  // An entry named like a manifest, or named like a source file, that could not
  // be read is material for the condition that would have read it. Keeping the
  // two lists here means the condition reports "this one was not read" rather
  // than "there is nothing here", which is failure F12 in its commonest form.
  const unreadableManifests = unreadable.filter((artefact) => BUILD_MANIFESTS.includes(artefact.path.split('/').pop()));
  const unreadableSourceFiles = unreadable.filter((artefact) => languageOfPath(artefact.path) !== 'unknown');
  const dominant = dominantLanguageIn(sourceFiles.map((artefact) => artefact.path));

  return {
    root,
    artefacts,
    sourceFiles,
    sourceFileCount: sourceFiles.length,
    excluded,
    excludedCount: excluded.length,
    buildManifests,
    testFiles,
    testFileCount: testFiles.length,
    documentationFiles,
    documentationFileCount: documentationFiles.length,
    unreadable,
    unreadableManifests,
    unreadableSourceFiles,
    dominantLanguage: dominant.language,
    dominantLanguageCount: dominant.count,
    directoryFacts: directoryFactsIn(sourceFiles),
    comments: scanForFirstComment(root, sourceFiles),
    history,
  };
}

/** An evidence entry citing the subject root itself, for a fact about the population as a whole. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function rootEvidence(note) {
  return { path: SUBJECT_ROOT_PATH, line: null, note };
}

/** The one manifest to name in prose: the first the tree declares, in the declared order. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function firstManifestIn(population) {
  return [...population.buildManifests]
    .sort((left, right) => {
      const order = BUILD_MANIFESTS.indexOf(left.split('/').pop()) - BUILD_MANIFESTS.indexOf(right.split('/').pop());
      return order !== 0 ? order : compareText(left, right);
    })
    .at(0) ?? null;
}

/**
 * An unreadable entry as evidence, carrying the reason the walk recorded.
 *
 * It follows `listArtefacts`'s `unreadable` entry shape rather than degrading to
 * a bare path, so "this could not be read" stays distinguishable from "this is
 * not there" at the point a reader meets it.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function unreadableEvidence(artefact) {
  return {
    path: artefact.path,
    line: null,
    note: 'this entry could not be read, so it is recorded as `unreadable` rather than counted as absent',
    reason: artefact.reason,
  };
}

/** The build condition, read from the manifests the tree declares. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readBuildCondition(condition, population) {
  const manifest = firstManifestIn(population);
  const unread = population.unreadableManifests.map(unreadableEvidence);
  if (manifest === null) {
    return {
      state: NOT_MEASURABLE,
      evidenceMode: null,
      evidence: unread.length === 0
        ? [rootEvidence('no declared build manifest was found beneath this root, so the ecosystem this project builds under is not named anywhere this channel reads')]
        : unread,
      whatWouldSettleIt: 'Whether it builds is a `build_semantic` question, and this read-only run takes no build channel. Running the project\'s own build would settle it; so would a manifest it can be run from.',
      measured: { manifestPresent: false, unreadableManifests: population.unreadableManifests.length },
    };
  }
  const { line, reason } = declarationLineIn(population.root, manifest);
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence: [{
      path: manifest,
      line,
      note: reason === null
        ? `the manifest declares the project at this line; that it is present is a source fact, and whether it builds is not`
        : `the manifest is present, but ${reason}`,
    }, ...unread],
    whatWouldSettleIt: 'A manifest is present, and whether it builds is a `build_semantic` question this read-only run does not answer — a build writes to the subject and the analysis refuses to publish when a byte moved. Running the declared build would settle it.',
    measured: { manifestPresent: true },
  };
}

/** The tests condition, split into the half this channel reads and the half it does not. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readTestsCondition(condition, population) {
  const manifest = firstManifestIn(population);
  const testCommand = population.testFileCount > 0 && manifest !== null
    ? TEST_COMMAND_BY_MANIFEST[manifest.split('/').pop()] ?? null
    : null;
  const evidence = population.testFiles.map((path) => ({
    path,
    line: null,
    note: 'a test file, counted from the path alone; whether it runs and passes is not a fact this channel reads',
  }));
  if (evidence.length === 0) {
    evidence.push(rootEvidence(
      'no test file was found in the project\'s own source, by directory name or by file name — a test declared '
      + 'inside a source file, as a Rust `#[cfg(test)]` module is, is invisible to that reading',
    ));
  }
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence,
    whatWouldSettleIt: testCommand === null
      ? 'Whether any test exists and can be run is a `runtime_dynamic` question, and this read-only run executes nothing. A declared test command would give the run something to name; executing the suite would settle it.'
      : `Whether these tests run and pass is a \`runtime_dynamic\` question, and this read-only run executes nothing. \`${testCommand}\` is the command the declared \`${manifest}\` implies, and running it would settle the condition.`,
    measured: { testFileCount: population.testFileCount, testCommand },
  };
}

/** The history condition: the repository's presence at R0, and R4's reading of its quality. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readHistoryCondition(condition, population) {
  const { history } = population;
  // R0 resolved this already, and `ANALYSIS-SCOPE.json` carries the same record.
  // A subject that sits inside another repository's work tree has a history even
  // though it has no `.git` of its own, which a probe at the subject root would
  // have read as absence — a false report about the project rather than a limit
  // of the channel.
  const commit = history?.commit ?? null;
  if (commit === null) {
    return {
      state: NOT_ESTABLISHED,
      evidenceMode: 'source_static',
      evidence: [rootEvidence(
        history === null
          ? 'the run resolved no target commit, so nothing here says whether a history exists'
          : `${history.reason}`,
      )],
      whatWouldSettleIt: 'A `source_static` reading of the tree settles whether a history exists, and this run took one: a commit reachable for the subject would settle it the other way.',
      measured: { commitPresent: false, isOwnRepository: history?.is_own_repository ?? null },
    };
  }
  const where = history.is_own_repository
    ? 'this project is its own repository'
    : `this project sits inside the work tree at ${history.root} and is not a repository of its own`;
  return {
    state: ESTABLISHED,
    evidenceMode: 'source_static',
    evidence: [rootEvidence(
      `the run fixed this subject at commit ${commit.slice(0, SHORT_COMMIT_LENGTH)}, and ${where}`
    )],
    measured: { commitPresent: true, commit, isOwnRepository: history.is_own_repository },
    note: 'A history exists and this run has its commit. Whether that history carries meaning — squashed, rewritten, or migrated from another VCS — is what R4 reads into `HISTORY-PROVENANCE.json`, and the danger signal below reports that half as unread rather than as clean.',
  };
}

/** The analysable-language condition, read from the extension table and the grammar table. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readLanguageCondition(condition, population) {
  const { dominantLanguage, dominantLanguageCount } = population;
  const evidence = population.sourceFiles.map((artefact) => ({
    path: artefact.path,
    line: null,
    note: `${languageOfPath(artefact.path)}, classified from the path alone; the classification is a fact about the extension, so no line of the file is where it was read`,
  }));
  if (evidence.length === 0) {
    evidence.push(rootEvidence('no source file was found beneath this root, so no language could be named as dominant'));
  }
  const analysable = dominantLanguage !== null
    && TARGET_LANGUAGES.includes(dominantLanguage)
    && Object.prototype.hasOwnProperty.call(GRAMMAR_BY_LANGUAGE, dominantLanguage);
  return {
    state: dominantLanguage === null ? NOT_ESTABLISHED : (analysable ? ESTABLISHED : NOT_ESTABLISHED),
    evidenceMode: 'source_static',
    evidence,
    whatWouldSettleIt: analysable
      ? undefined
      : `Which language dominates is read from the source text, so a \`source_static\` reading settles this. ${TARGET_LANGUAGES.join(', ')} are the languages this instrument declares; a corpus dominated by one of them is analysable in principle.`,
    note: analysable
      ? `${dominantLanguage} dominates with ${dominantLanguageCount} source file(s), and \`GRAMMAR_BY_LANGUAGE\` carries the \`${GRAMMAR_BY_LANGUAGE[dominantLanguage].packageName}\` grammar for it. A grammar being installed is not the same as an extractor being written: the capability matrix carries that second half, and this condition claims only the first.`
      : `The six languages this instrument declares are ${TARGET_LANGUAGES.join(', ')}. Whether one of them dominates decides this, and the count beside the dominant language is the whole of the reading.`,
    measured: { dominantLanguage, dominantLanguageCount, languagesConsidered: [...TARGET_LANGUAGES] },
  };
}

/** The structure condition: the directory count and the share the largest one holds. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readStructureCondition(condition, population) {
  const { directoryCount, largestDirectoryShare } = population.directoryFacts;
  const { sourceFileCount } = population;
  if (sourceFileCount === 0) {
    return {
      state: NOT_MEASURABLE,
      evidenceMode: null,
      evidence: [rootEvidence('there is no source file beneath this root, so there is no structure to read')],
      whatWouldSettleIt: 'A `source_static` reading of the tree settles this once the tree holds a source file; with none there, this channel has nothing to measure rather than a structure it cannot see.',
      measured: { directoryCount, largestDirectoryShare, sourceFileCount },
    };
  }
  // A completely flat tree has no source directory at all, so every source file
  // sits in the one place and there is no boundary to estimate — the failure
  // ABOUT-REVERSE 3.6 names. That is a definitional boundary, not a threshold.
  const flat = directoryCount === 0;
  return {
    state: flat ? NOT_ESTABLISHED : ESTABLISHED,
    evidenceMode: 'source_static',
    evidence: [rootEvidence(
      `${sourceFileCount} source file(s) sit in ${directoryCount} source-bearing director${directoryCount === 1 ? 'y' : 'ies'}, the largest holding ${largestDirectoryShare} of them`,
    )],
    whatWouldSettleIt: flat
      ? 'Every source file sits directly at the root, so there is no directory boundary to estimate from. A `source_static` reading settles this as soon as the tree holds a source directory; a flat tree is not something another channel can read differently.'
      : undefined,
    measured: { directoryCount, largestDirectoryShare, sourceFileCount },
  };
}

/** The documentation-and-comments condition: a counted population and a located comment line. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readDocumentationCondition(condition, population) {
  const { documentationFileCount, comments } = population;
  const evidence = population.documentationFiles.map((path) => ({
    path,
    line: null,
    note: 'a documentation file in the project\'s own source, counted by the extension it carries; its presence is the fact, so no line of it is where that was read',
  }));
  if (comments.first !== null) {
    evidence.push({
      path: comments.first.path,
      line: comments.first.line,
      note: 'the first comment line in the source population, read from the text with the comment prefix its language uses',
    });
  }
  const unread = [
    ...population.unreadableSourceFiles.map(unreadableEvidence),
    ...comments.unreadable,
  ];
  evidence.push(...unread);
  if (evidence.length === 0) {
    evidence.push(rootEvidence('no documentation file and no comment line were found in the project\'s own source'));
  }
  const survive = documentationFileCount > 0 || comments.found;
  return {
    state: survive ? ESTABLISHED : NOT_ESTABLISHED,
    evidenceMode: 'source_static',
    evidence,
    whatWouldSettleIt: survive
      ? undefined
      : 'Both halves are read from the source text, and a `source_static` reading settles this: the documentation population is counted by extension and the comment population by the prefix each language uses. Finding a document or a comment anywhere would settle it the other way.',
    measured: {
      documentationFileCount,
      commentFound: comments.found,
      firstComment: comments.first,
      commentFilesScanned: comments.scanned,
      unreadable: unread,
    },
  };
}

/** Every condition's reader, so a condition is a row and not a branch. */
const CONDITION_READERS = Object.freeze({
  builds: readBuildCondition,
  tests_exist_and_can_run: readTestsCondition,
  git_history_exists: readHistoryCondition,
  main_language_analysable: readLanguageCondition,
  directory_structure_carries_meaning: readStructureCondition,
  documentation_or_comments_survive: readDocumentationCondition,
});

/** Which signals bear on which condition, so the two tables stay cross-referenced rather than duplicated. */
const SIGNALS_BEARING_ON = Object.freeze({
  builds: ['no_tests_or_tests_do_not_pass'],
  tests_exist_and_can_run: ['no_tests_or_tests_do_not_pass'],
  git_history_exists: ['no_history'],
  main_language_analysable: ['dynamic_language_metaprogramming_dominates'],
  directory_structure_carries_meaning: ['generated_code_dominates'],
  documentation_or_comments_survive: ['knowledge_closed_to_one_person'],
});

/** The tests signal: the missing half is a fact, the failing half needs a run. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readTestsSignal(signal, population) {
  if (population.testFileCount === 0) {
    return {
      state: ESTABLISHED,
      evidenceMode: 'source_static',
      evidence: [rootEvidence('no test file was found in the project\'s own source, by directory name or by file name')],
      whatWouldRaiseIt: 'No further channel is needed for the half read: the absence of a test file is a source fact. Running a suite would raise the other half.',
      note: 'This is evidence of a missing foundation for the Red reconstruction: there is no test to build on. It is not evidence of the project being unsuitable, and it is not a count towards any total.',
    };
  }
  const evidence = population.testFiles.map((path) => ({
    path,
    line: null,
    note: 'a test file that exists; whether it passes is not a fact this channel reads',
  }));
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence,
    whatWouldRaiseIt: 'Running the suite is what would raise or dismiss the second half — `runtime_dynamic` evidence, which this read-only run does not take.',
    note: 'This is evidence of test files being present. It is not evidence of their passing, and the two halves are reported apart so the first is never read as the second.',
  };
}

/** The history signal: absent, or present with its quality unread. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readHistorySignal(signal, population) {
  const { history } = population;
  if (history?.commit === null || history?.commit === undefined) {
    return {
      state: ESTABLISHED,
      evidenceMode: 'source_static',
      evidence: [rootEvidence(
        history === null
          ? 'the run resolved no target commit, so nothing here says whether a history exists'
          : history.reason,
      )],
      whatWouldRaiseIt: 'Nothing further raises this: the run resolved no commit for this subject, which is the signal.',
      note: 'This is evidence of the intent-versus-accident material `git blame` and co-change would supply being out of reach. It is not evidence of anything about the code itself.',
    };
  }
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence: [rootEvidence('the run resolved a commit for this subject, so the "no history" half of this signal does not fire from the source text')],
    whatWouldRaiseIt: 'Whether that history was squashed or migrated is read by R4 into `HISTORY-PROVENANCE.json` — `source_static` evidence this run has not taken. R4 settles it.',
    note: 'This is evidence of a history being reachable. It is not evidence of that history being intact; reporting it as dismissed would be reading a channel limit as an absence (F12).',
  };
}

/** The generated-material signal: how much of the tree the analysis records rather than reads. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readGeneratedSignal(signal, population) {
  const fires = population.excludedCount > population.sourceFileCount;
  return {
    state: fires ? ESTABLISHED : NOT_ESTABLISHED,
    evidenceMode: 'source_static',
    evidence: [rootEvidence(
      `${population.excludedCount} artefact(s) sit under directories the analysis records rather than measures, against ${population.sourceFileCount} in the project's own source`,
    )],
    whatWouldRaiseIt: fires
      ? 'Nothing further raises this: the counted population is the signal.'
      : 'A `source_static` reading settles this and this one was taken; no further channel is needed.',
    note: 'This is evidence of how much material the analysis records rather than reads as the project\'s own source. It is not evidence of that material having been generated, and the two are different claims.',
  };
}

/** The metaprogramming signal: the language half is read, the mechanism half is not. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readMetaprogrammingSignal(signal, population) {
  const dynamic = population.dominantLanguage !== null
    && DYNAMIC_LANGUAGES.includes(population.dominantLanguage);
  if (!dynamic) {
    return {
      state: NOT_ESTABLISHED,
      evidenceMode: 'source_static',
      evidence: [rootEvidence(
        population.dominantLanguage === null
          ? 'no source file was found, so no language dominates the population'
          : `${population.dominantLanguage} dominates the population, and it composes statically`,
      )],
      whatWouldRaiseIt: 'A `source_static` reading settles this, and the reading was taken: the signal cannot fire on a corpus with no dynamic language.',
      note: 'This is evidence of the language the population is written in. It is not evidence of metaprogramming being absent — the mechanism markers are not read for any of the six languages.',
    };
  }
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence: [rootEvidence(`${population.dominantLanguage} dominates the population, and reflection, eval and container wiring are what this signal asks about`)],
    whatWouldRaiseIt: 'The mechanism markers are E6, which is `partial` for Rust and `not_attempted` for the other five languages today (P24-4). Until then no channel here raises or dismisses this signal, and the limit is named rather than reported as a clean result.',
    note: 'This is evidence of a dynamic language dominating. It is not evidence of metaprogramming dominating, and it is not evidence of it being absent.',
  };
}

/** The knowledge signal: no machine channel reaches it at all. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readKnowledgeSignal(signal, population) {
  return {
    state: NOT_MEASURABLE,
    evidenceMode: null,
    evidence: [rootEvidence('whether the business knowledge is closed to a person is not a fact any file records, and no channel here reaches it')],
    whatWouldRaiseIt: 'A person who knows the project would settle this — the answer is not in the tree, and no mode of reading the tree produces it.',
    note: 'This is evidence of the question standing open. It is not evidence of the knowledge being closed, and it is not evidence of it being shared.',
  };
}

/** The size signal: the counted population against the repository's own declared marker. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function readSizeSignal(signal, population) {
  const fires = population.sourceFileCount > LARGE_TREE_FILE_COUNT;
  return {
    state: fires ? ESTABLISHED : NOT_ESTABLISHED,
    evidenceMode: 'source_static',
    evidence: [rootEvidence(
      `${population.sourceFileCount} file(s) in the project's own source, against the ${LARGE_TREE_FILE_COUNT} this instrument declares impractical`,
    )],
    whatWouldRaiseIt: fires
      ? 'Nothing further raises this: the counted population is the signal.'
      : 'A `source_static` reading settles this and this one was taken; no further channel is needed.',
    note: `This is evidence of the size of the population mechanical analysis would have to read, against a marker this instrument declares rather than a threshold chosen here. It is not evidence of the project being too large to attempt.`,
  };
}

/** Every signal's reader, so a signal is a row and not a branch. */
const SIGNAL_READERS = Object.freeze({
  no_tests_or_tests_do_not_pass: readTestsSignal,
  no_history: readHistorySignal,
  generated_code_dominates: readGeneratedSignal,
  dynamic_language_metaprogramming_dominates: readMetaprogrammingSignal,
  knowledge_closed_to_one_person: readKnowledgeSignal,
  too_large_for_mechanical_analysis: readSizeSignal,
});

/**
 * Read one condition against the population R0 measured.
 *
 * @param {{id: string, question: string, settlesBy: string}} condition — one row of `ELIGIBILITY_CONDITIONS`
 * @param {object} population — the material `populationOf` gathered
 */
export function readCondition(condition, population) {
  const read = CONDITION_READERS[condition.id];
  if (typeof read !== 'function') {
    throw new Error(`no reader is declared for condition ${condition.id}; a condition without a reader would be published as a blank rather than as a reading`);
  }
  const reading = read(condition, population);
  const entry = {
    id: condition.id,
    question: condition.question,
    settlesBy: condition.settlesBy,
    state: reading.state,
    evidenceMode: reading.evidenceMode,
    evidence: reading.evidence,
    measured: reading.measured,
    dangerSignals: [...(SIGNALS_BEARING_ON[condition.id] ?? [])],
  };
  // A statement of what would settle a condition exists exactly when the
  // condition is unsettled. The key is absent rather than `undefined`, so the
  // published document serialises and a reader can tell "settled" from "the
  // sentence was dropped".
  if (reading.whatWouldSettleIt !== undefined) entry.whatWouldSettleIt = reading.whatWouldSettleIt;
  if (reading.note !== undefined) entry.note = reading.note;
  return entry;
}

/**
 * Read one danger signal against the population R0 measured.
 *
 * A signal is reported with the evidence that raises it and the strength of the
 * channel that raises it. It is never a verdict, and no reader sums the raised
 * ones into a total.
 *
 * @param {{id: string, question: string, raisesBy: string|null}} signal — one row of `DANGER_SIGNALS`
 * @param {object} population — the material `populationOf` gathered
 */
export function readSignal(signal, population) {
  const read = SIGNAL_READERS[signal.id];
  if (typeof read !== 'function') {
    throw new Error(`no reader is declared for signal ${signal.id}; a signal without a reader would be published as a blank rather than as a reading`);
  }
  return {
    id: signal.id,
    question: signal.question,
    raisesBy: signal.raisesBy,
    ...read(signal, population),
  };
}

/**
 * R0's eligibility assessment over a measured population.
 *
 * The conditions and signals are read from the artefact walk and the subject
 * root, which is what R0 has, plus the target-commit record R0 resolved. No
 * later measurement is among the inputs, and two that earlier drafts carried
 * are deliberately gone: a dependency measurement, because no condition and no
 * signal reads one, and R1's parsed population, because R1 has not run when this
 * is read. A parameter nothing passes in production is a claim the signature
 * makes and the call sites do not keep; the ticket that first needs one adds it
 * together with the reader that reads it.
 *
 * @param {{artefacts: Array<object>, root: string, history?: object|null}} params
 *   `history` is `resolveScope`'s `target_commit` — the R0 fact about whether
 *   this project has a history, which the run has already resolved and recorded
 *   in `ANALYSIS-SCOPE.json`. It is not R4's reading of that history's quality,
 *   which has not happened yet.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
export function assessEligibility({
  artefacts,
  root,
  history = null,
} = {}) {
  if (!Array.isArray(artefacts)) {
    throw new Error(
      'assessEligibility was given no artefact list. It reads every condition and every signal from the R0 walk, so a '
      + 'caller with no population would get six absent conditions that look like findings about the project.',
    );
  }
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('assessEligibility must be given the subject root the artefacts were walked from');
  }

  const population = populationOf({ artefacts, root, history });
  return {
    stage: ELIGIBILITY_STAGE,
    root,
    conditions: ELIGIBILITY_CONDITIONS.map((condition) => readCondition(condition, population)),
    signals: DANGER_SIGNALS.map((signal) => readSignal(signal, population)),
    note: 'These are the conditions and the signals of ABOUT-REVERSE 3.6, read from the source text and '
      + 'published before anything runs. This is not a judgement about whether the reverse rotation will '
      + 'succeed, and no field here combines them into one: the conditions and the signals are material for '
      + 'a human deciding whether to start, or to rebuild from zero (design 4.1), and the decision is yours.',
  };
}

/** How a state reads in prose, so the three are distinguishable at a glance. */
const STATE_PROSE = Object.freeze({
  established_statically: 'read, and present',
  not_established_statically: 'read, and not there',
  not_measurable_statically: 'not read by this channel',
});

/**
 * One evidence entry as a `file:line` span embedded in prose.
 *
 * The document carries every entry; the report prints `REPORT_LIST_LIMIT` of
 * them and says how many it did not, because a silent cap would read as the
 * whole of the evidence.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function renderEvidenceEntry(entry) {
  const location = entry.line === null ? `\`${entry.path}\`` : `\`${entry.path}:${entry.line}\``;
  return `- ${location} — ${entry.note}`;
}

/** Every evidence entry of a condition or signal, capped for the report and stated. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function renderEvidence(entries) {
  return renderCappedList(entries, renderEvidenceEntry);
}

/** The block one condition is rendered as. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function renderCondition(condition) {
  const lines = [
    `### ${condition.question}`,
    '',
    `**${STATE_PROSE[condition.state]}** (\`${condition.state}\`), read by ${condition.evidenceMode === null ? 'no channel in this run' : `the \`${condition.evidenceMode}\` channel`}.`,
    '',
    `What was found, and where (${condition.evidence.length} entr${condition.evidence.length === 1 ? 'y' : 'ies'}):`,
    '',
    ...renderEvidence(condition.evidence),
    '',
  ];
  if (condition.whatWouldSettleIt !== undefined) {
    lines.push(`What would settle it: ${condition.whatWouldSettleIt}`, '');
  }
  if (condition.note !== undefined) lines.push(condition.note, '');
  return lines.join('\n');
}

/** The block one danger signal is rendered as. */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function renderSignal(signal) {
  const lines = [
    `- **${signal.question}** — ${STATE_PROSE[signal.state]} (\`${signal.state}\`).`,
    ...renderEvidence(signal.evidence).map((line) => `  ${line}`),
  ];
  if (signal.state !== ESTABLISHED) {
    lines.push(`  What would raise it: ${signal.whatWouldRaiseIt}`);
  }
  lines.push(`  ${signal.note}`, '');
  return lines.join('\n');
}

/**
 * The assessment as Markdown for a reader rather than JSON for a machine.
 *
 * ABOUT-REVERSE 5.2 asks for `file:line` embedded in prose, the reason it
 * matters, and the question the reader must answer. The closing paragraph carries
 * the last of the three, and it is the same sentence the document's own `note`
 * carries, so the two forms cannot disagree about what the reader is being asked.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
export function renderEligibility(assessment) {
  return [
    '## Eligibility — the conditions, read before anything runs',
    '',
    'ABOUT-REVERSE 3.6 names six conditions a reverse rotation needs and six danger signals that make it '
      + 'unlikely to work. Both are read below from the source text of `' + assessment.root + '`, before any '
      + 'analysis stage runs, so the material is in front of a reader at the point where deciding is cheap.',
    '',
    '**This is not a judgement about whether the rotation will succeed.** There is no score and no threshold '
      + 'here, because a score would look objective while encoding a threshold nobody chose (ABOUT-REVERSE '
      + '7.7.2). The decision is yours, and design 4.1 records rebuilding from zero as the choice most often '
      + 'taken in practice.',
    '',
    ...assessment.conditions.map(renderCondition),
    '### The danger signals',
    '',
    'Each signal is reported with what raises it and what it is evidence of. No count of them is summed: a '
      + 'total would be a grade in a costume.',
    '',
    ...assessment.signals.map(renderSignal),
    '### What this does and does not establish',
    '',
    'Every fact above was read from the source text and the names of the files it is written in: the '
      + 'artefact walk, the extension each path carries, and the first comment line each language\'s prefix '
      + 'finds. Nothing was built and nothing was run, so the two conditions that need a build or an '
      + 'execution are reported at the strength this channel supports with the channel that would settle '
      + 'them named.',
    '',
    'An entry marked `not_measurable_statically` was not read by this channel. That is a statement about '
      + 'this run and not about the project, and it is kept apart from `not_established_statically` — which '
      + 'says the tree was read and the thing is not there — so that a limit of the instrument can never be '
      + 'read as an absence in the project (failure F12).',
    '',
    assessment.note,
    '',
  ].join('\n');
}
