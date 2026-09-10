// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * The entrance to the analysis: R0 fixes its boundary, R0.5 names what lies
 * outside it, and `analyzeProject` runs the measurement stages behind them.
 *
 * R0 records the target commit, the exclusion rules, the permissions held and
 * the external-transmission policy, because without them the meaning of every
 * later fact is ambiguous — evidence about what, exactly. R0.5 classifies every
 * artefact into `in_scope`, `out_of_scope` or `undetermined`, and it enumerates
 * the excluded directories rather than skipping them, so that "outside the
 * scope" can never be read as "not there".
 *
 * The slice work that P22-3 put here also remains. A slice is one use case's
 * execution path, and 7.7.1 Pass 1 fixes boundaries along it rather than
 * sweeping any package horizontally. So a slice is named by a word, resolved to
 * the source files that carry that word, and then carried outward by the
 * `crate::` references those files make into other top-level modules. Nothing
 * there decides anything: which directories a slice crosses is a fact about the
 * text.
 *
 * The spike's measurement lives beside the scope because R-7's instrument and
 * R0.5's subject are the same run. It is deliberately a separate function from
 * the report's rendering so the numbers can be asserted without the prose, and
 * it is a pure function of its inputs — including the decision time and the
 * human interventions, which the harness cannot observe and which are therefore
 * recorded by hand and passed in. A script that timed itself would be reporting
 * wall-clock as if it were judgement.
 *
 * The executor never reads the answer key. `runSpike` is handed a subject root
 * and nothing else, and a project holding no oracle tree at all must still
 * complete — that is what makes the number a measurement of the analysis rather
 * than of the analysis plus its answer.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { BUILD_MANIFESTS, compareText, digestTree, listTreeFiles } from './holdout-ledger.mjs';
import {
  SOURCE_DIRECTORY,
  SOURCE_EXTENSION,
  buildClaimLedger,
  crateReferencesIn,
  directoryOf,
  owningDirectoryOf,
  renderClaimLedger,
  resolveSourceMember,
  stemOf,
} from './claim-ledger.mjs';
import { renderDecisionCards } from './packet.mjs';
import { EXCLUSION_RULES, buildAttemptLedger, listArtefacts } from './analysis-tech.mjs';
import { measureStructure, renderStructureReport, syntaxLanguageOf } from './structure.mjs';
import { extractSemantics, renderSemanticsReport } from './semantics.mjs';
import { reconstructHistory, renderHistoryRecord } from './history.mjs';
import { buildGapCandidate, classifyGaps, enumerateGaps, renderGapsReport } from './gaps.mjs';
import { assessOracleValidity, renderOracleGapReport } from './oracle-gap.mjs';
import { planRedReconstruction, renderRedReconstructionReport } from './red-reconstruction.mjs';
import { STAGE as COUNTEREXAMPLE_STAGE, applyCounterexamples, renderCounterexampleReport } from './counterexample.mjs';
import { generatePropertyTests, renderPropertyTestReport } from './property-tests.mjs';
import { historyFromGit } from './evidence-independence.mjs';
import { measureDependencies, renderDependencyReport } from './dependencies.mjs';
import { measureExecutionSurface, renderExecutionSurfaceReport } from './execution-surface.mjs';
import { canonicalSerialize } from '../../workspacify-tree/lib/canonical-json.mjs';

/**
 * The walk the slice is resolved over. Dependencies are somebody else's source
 * and build output is not source at all, so neither can name a slice.
 *
 * This is the same constant R0 fixes in `ANALYSIS-SCOPE.json` and the same one
 * the later measurement layers read, so the slice resolution and the structural
 * measurement cannot disagree about what the project's own source is.
 */
export const SLICE_WALK_EXCLUSIONS = EXCLUSION_RULES;

/** The rule the report states, so a reader can reproduce the extrapolation. */
export const EXTRAPOLATION_RULE = 'cards per seed file multiplied by the project source file count';

/** The evidence mode a purely textual reading produces. */
export const SOURCE_STATIC = 'source_static';

/** No measurement protocol was supplied: every recorded value is absent, not zero-by-assumption. */
export const EMPTY_RECORD = Object.freeze({ interventions: Object.freeze([]), decisionSamplesMs: Object.freeze([]) });

/** Raised when a slice name matches nothing. The message names what was searched. */
export class SliceUnresolvedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SliceUnresolvedError';
  }
}

/**
 * Refuse a root that cannot be read, naming it.
 *
 * The walk below would otherwise surface a bare errno, and an errno is not an
 * answer to "what could not be resolved".
 */
function assertReadableRoot(root) {
  if (existsSync(root)) return;
  throw new SliceUnresolvedError(
    `the analysis root ${root} cannot be read, so no slice can be resolved in it. `
    + 'Point the run at a project root that exists.',
  );
}

/** A slice name and a file name are compared with separators and case removed. */
function normaliseToken(text) {
  return text.toLowerCase().replace(/[-_]/g, '');
}

/**
 * Every directory one vertical slice crosses.
 *
 * @param {string} root — the project root the analysis is scoped to
 * @param {string} slice — the use case's name
 * @returns {{slice: string, directories: string[], seeds: string[], projectSourceFiles: number}}
 * @throws {SliceUnresolvedError} when no source file names the slice
 */
export function resolveSlice(root, slice) {
  if (typeof slice !== 'string' || slice.length === 0) {
    throw new SliceUnresolvedError(`a slice must be named by a non-empty word, but it was ${JSON.stringify(slice)}`);
  }
  assertReadableRoot(root);

  const projectSourceFiles = listTreeFiles(root, { excludedDirectoryNames: SLICE_WALK_EXCLUSIONS })
    .filter((file) => file.startsWith(`${SOURCE_DIRECTORY}/`) && file.endsWith(SOURCE_EXTENSION));

  const token = normaliseToken(slice);
  const seeds = projectSourceFiles.filter((file) => normaliseToken(stemOf(file)).includes(token));

  if (seeds.length === 0) {
    throw new SliceUnresolvedError(
      `no source file under ${SOURCE_DIRECTORY}/ names the slice "${slice}": 0 seed(s) matched among `
      + `${projectSourceFiles.length} ${SOURCE_EXTENSION} file(s) under ${root}. `
      + `A slice is named by a source file whose name contains it, and this one names nothing.`,
    );
  }

  const directories = new Set(seeds.map(directoryOf));
  for (const seed of seeds) {
    const sourceText = readFileSync(join(root, seed), 'utf8');
    for (const moduleName of crateReferencesIn(sourceText)) {
      const member = resolveSourceMember(root, moduleName);
      if (member) directories.add(owningDirectoryOf(member));
    }
  }

  return {
    root,
    slice,
    directories: [...directories].sort(compareText),
    seeds: [...seeds].sort(compareText),
    projectSourceFiles: projectSourceFiles.length,
  };
}

/** SHA-256 over every file of a tree, excluding build output and version control. */
export function digestSubject(root) {
  return digestTree(root);
}

/**
 * A measured duration, or the fact that it was never measured.
 *
 * Showing `0` for an unrecorded duration reads as "instant", and a report that
 * says a judgement cost nothing is worse than one that admits it did not look.
 */
function renderDecisionTime(value, sampleCount) {
  return sampleCount === 0 ? 'not recorded' : value;
}

/**
 * The partition decision a slice makes, as the document `oracle compare` consumes.
 *
 * The members are the directories the slice crosses and the seed files that named
 * it. Both belong: the answer key's declared unit is "directory", but its set is
 * measured to hold 96 file paths beside 14 directories, so a file path is a
 * member of the partition in the only sense that matters here.
 */
export function buildPartitionCandidate(slice) {
  return {
    stage: 'r1',
    corpus: { language: 'rust' },
    entries: [...slice.directories, ...slice.seeds].sort(compareText),
    unobserved: [
      {
        region: 'the partition members outside this vertical slice',
        stoppedAtPhase: 'R0.5',
        reason:
          '7.7.1 Pass 1 fixes boundaries along one execution path; the packages it does not '
          + 'cross are Pass 2 work and were never looked at by this run',
      },
    ],
  };
}

/** How many recorded values a measurement was able to use. */
function recordFrom(recorded) {
  const source = recorded ?? EMPTY_RECORD;
  const interventions = Array.isArray(source.interventions) ? source.interventions : [];
  const decisionSamplesMs = Array.isArray(source.decisionSamplesMs) ? source.decisionSamplesMs : [];
  return { interventions, decisionSamplesMs };
}

/**
 * The numbers R-7 asks for, and the extrapolation that answers it.
 *
 * Extrapolation is a count, not a prediction about quality: the design declined
 * to estimate card volume on paper and named this spike as the instrument that
 * would measure it instead.
 */
export function measureSpikeRun({ slice, ledger, cards, recorded, cardRun }) {
  const { interventions, decisionSamplesMs } = recordFrom(recorded);
  const totalMs = decisionSamplesMs.reduce((total, sample) => total + sample, 0);
  const claims = ledger.claims.length;
  const seedFiles = slice.seeds.length;
  const scale = seedFiles === 0 ? 0 : slice.projectSourceFiles / seedFiles;

  return {
    slice: { name: slice.slice, directories: slice.directories, seedFiles },
    claims: { total: claims, byClass: { ...ledger.byClass } },
    cards: {
      total: cards.length,
      layered: cardRun?.layered ?? false,
      suppressed: cardRun?.suppressed ?? 0,
    },
    unresolvedRate: ledger.unresolvedRate,
    decisionMinutes: totalMs / 60000,
    decisionMinutesPerCard: cards.length === 0 ? 0 : totalMs / 60000 / cards.length,
    decisionSamples: decisionSamplesMs.length,
    humanInterventions: interventions.length,
    interventions: interventions.map((intervention) => ({ ...intervention })),
    extrapolation: {
      rule: EXTRAPOLATION_RULE,
      seedFiles,
      projectSourceFiles: slice.projectSourceFiles,
      cardsToWholeProject: Math.ceil(cards.length * scale),
      claimsToWholeProject: Math.ceil(claims * scale),
    },
    analysisMode: SOURCE_STATIC,
  };
}

/**
 * Run one vertical slice through R0.5, R3.5 and R7, and measure it.
 *
 * The target is digested before and after. A run that changes what it measured
 * has measured nothing, so the two digests are compared rather than trusted.
 */
export function runSpike({ root, slice, recorded }) {
  assertReadableRoot(root);
  const before = digestSubject(root);
  const resolved = resolveSlice(root, slice);
  const ledger = buildClaimLedger(resolved);
  const cardRun = renderDecisionCards(ledger);
  const measurement = measureSpikeRun({ slice: resolved, ledger, cards: cardRun.cards, recorded, cardRun });
  const after = digestSubject(root);

  if (before.sha256 !== after.sha256) {
    throw new Error(
      `the measurement modified its target: ${root} hashed ${before.sha256} before the run and `
      + `${after.sha256} after it. A measurement that changes what it measured cannot be believed.`,
    );
  }

  return {
    slice: resolved,
    ledger,
    cards: cardRun.cards,
    cardRun,
    measurement: { ...measurement, targetDigest: before.sha256, targetFileCount: before.fileCount, targetUnchanged: true },
  };
}

/**
 * The report's disagreement half, so the executor that writes the report and the
 * afterwards step that fills it in render the same words.
 *
 * An empty list says the comparison has not been run. That is not agreement: an
 * unrun comparison has looked at nothing, and saying so is the difference
 * between a measurement and a rubber stamp.
 */
export function renderDisagreements(reconciliation) {
  const lines = [];

  if (reconciliation.length === 0) {
    lines.push(
      'The comparison against the frozen answer key has **not been run**. Its absence is not',
      'agreement: an unrun comparison has looked at nothing.',
      '',
      'Run it afterwards, against the frozen P22-2 bundle and never against the live tree:',
      '',
      '```bash',
      'node .claude/scripts/workspacify-reverse/run.mjs spike reconcile --project-root .',
      '```',
    );
    return lines.join('\n');
  }

  for (const entry of reconciliation) {
    lines.push(...entry.markdown.split('\n'), '');
  }
  lines.push(
    'A disagreement list is not a score. Classifying each entry — the analysis missed something',
    'the forward rotation had, the analysis found something the forward rotation did not have, or',
    'the forward rotation\'s own artefact was a free choice rather than a necessary one — depends',
    'on intent, which neither tree records. That work is a human\'s.',
  );
  return lines.join('\n');
}

/**
 * The report a human and an AI read: what ran, what it measured, what it did not
 * measure, and where it disagrees with the answer key.
 */
export function renderSpikeReport(measurement, { reconciliation = [], targetDigest = null } = {}) {
  const { slice, claims, cards, extrapolation } = measurement;
  const lines = [
    '# Spike report — one vertical slice through R0.5, R3.5 and R7',
    '',
    'This is the measurement R-7 asked for. The design declined to estimate card volume on',
    'paper and named this run as the instrument that would measure it instead, so the numbers',
    'below are observations of one slice rather than a projection of the whole project.',
    '',
    '## What was run',
    '',
    `The slice is named \`${slice.name}\`. It was resolved to ${slice.seedFiles} seed file(s) and crosses`,
    `${slice.directories.length} director(ies): ${slice.directories.map((dir) => `\`${dir}\``).join(', ')}.`,
    '',
    '## What the run measured',
    '',
    '| Measurement | Value |',
    '|---|---|',
    `| claims in the slice | ${claims.total} |`,
    `| — observed | ${claims.byClass.observed} |`,
    `| — inferred | ${claims.byClass.inferred} |`,
    `| — normative | ${claims.byClass.normative} |`,
    `| — unresolved | ${claims.byClass.unresolved} |`,
    `| decision cards | ${cards.total} |`,
    `| cards withheld by layering | ${cards.suppressed} |`,
    `| unresolved rate | ${measurement.unresolvedRate} |`,
    `| decision time (minutes) | ${renderDecisionTime(measurement.decisionMinutes, measurement.decisionSamples)} |`,
    `| decision time per card (minutes) | ${renderDecisionTime(measurement.decisionMinutesPerCard, measurement.decisionSamples)} |`,
    `| human interventions | ${measurement.humanInterventions} |`,
    '',
    'Decision time and human interventions are recorded by hand as the run proceeds and passed',
    'in, because the implementation loop runs one ticket per session and neither is observable',
    'to the harness. The aggregation from the recorded samples to the values above is the part a',
    'test can hold; the recording is the human\'s.',
    '',
    measurement.decisionSamples === 0
      ? 'No decision sample was recorded for this run, so the decision-time rows above say so rather '
        + 'than showing a zero. A zero would read as "instant" when it means "unobserved".'
      : `Decision time is the sum of ${measurement.decisionSamples} recorded sample(s).`,
    '',
    'Every `unresolved` claim is handed to the human grill, so their number is what decides whether',
    'the cards are decisions or questions. Read the unresolved rate beside the card count: a slice',
    'whose claims are mostly unresolved produces cards that are mostly requests for a judgement the',
    'analysis could not make, and that is a different result from a slice that recovered contracts.',
    '',
    '## Extrapolation to the whole project',
    '',
    `Rule: ${extrapolation.rule}.`,
    '',
    `The slice covers ${extrapolation.seedFiles} of the project's ${extrapolation.projectSourceFiles} source file(s),`,
    `so the same rate projects to about **${extrapolation.cardsToWholeProject} decision card(s)** and`,
    `**${extrapolation.claimsToWholeProject} claim(s)** for the whole project.`,
    '',
    'This is a rate, not a promise. A vertical slice meets boundaries a horizontal sweep does',
    'not, and the rate will move once Pass 2 begins.',
    '',
    '## What this does not measure',
    '',
    `The analysis mode is \`${measurement.analysisMode}\`: claims were read from the source text`,
    'and its syntax alone, with no execution, build or trace evidence. Which parser the later',
    'stages adopt is **P22-4\'s decision and is not taken here** — this run must not be read as',
    'having chosen one.',
    '',
    targetDigest
      ? `The target tree was digested before and after the run. Both digests are \`${targetDigest}\`: the`
      : 'The target tree was digested before and after the run. Both digests matched: the',
    'measurement left every byte of what it measured as it found it.',
    '',
    '## Disagreements',
    '',
    renderDisagreements(reconciliation),
  ];

  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// R0 and R0.5 — the analysis boundary, and what it leaves outside
// ---------------------------------------------------------------------------

/**
 * The stages R0 through R5.5, in the order the design runs them.
 *
 * `--through` selects an inclusive prefix, so a run can stop at the structural
 * measurement and say so. An unknown stage is refused rather than ignored: a
 * mistyped `--through` that silently ran everything would answer a question
 * nobody asked and look like a complete result.
 */
export const ANALYSIS_STAGES = Object.freeze([
  'r0', 'r0.5', 'r1', 'r2', 'r2.5', 'r3', 'r3.5', 'r4', 'r5', 'r5.5', 'r6', 'r6.5',
]);

/**
 * A stage as a reader sees it: `R0`, `R2.5`.
 *
 * The identifiers stay lowercase because they are matched against `--through`
 * on a command line, and the label is derived rather than stored so that a
 * stage can never be displayed under a name it is not invoked by.
 */
export function stageLabel(stage) {
  return stage.toUpperCase();
}

/**
 * The three states every artefact is classified into.
 *
 * `out_of_scope` is a first-class state and not a synonym for absent: the
 * design's failure F12 is writing "outside the scope" as "does not exist", and
 * the three values exist so that a consumer cannot make that substitution by
 * accident.
 */
export const COVERAGE_STATES = Object.freeze(['in_scope', 'out_of_scope', 'undetermined']);

/** What an artefact is, before any question of whether it is measured. */
export const ARTEFACT_KINDS = Object.freeze([
  'handwritten',
  'generated',
  'test',
  'config',
  'schema',
  'migration',
  'dependency',
  'build_output',
  'unreadable',
  'unknown',
]);

/** The transmission policy every run fixes: nothing leaves the machine. */
export const EXTERNAL_TRANSMISSION_NONE = 'none';

/** The permissions a run holds over its target. Read, and nothing else. */
export const READ_ONLY_PERMISSIONS = Object.freeze(['read']);

/** Directory names that hold somebody else's source rather than this project's. */
const DEPENDENCY_KIND_DIRECTORIES = Object.freeze(['vendor', 'node_modules']);

/** Directory names that hold build output rather than source. */
const BUILD_OUTPUT_KIND_DIRECTORIES = Object.freeze(['target', 'dist', 'build_output']);

/** Test files are recognised by directory or by name, never by one convention. */
const TEST_DIRECTORY_NAMES = Object.freeze(['test', 'tests', '__tests__']);

const TEST_FILE_NAME = /(^|[._-])(test|spec)[._-]|_test\.|\.test\.|\.spec\./;

/** The extensions a configuration file is written in. */
const CONFIG_FILE_EXTENSIONS = Object.freeze([
  '.toml', '.json', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.lock', '.hcl', '.tf',
]);

/** Raised when the analysis boundary cannot be fixed. Names the cause and the path. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
export class AnalysisScopeError extends Error {
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'AnalysisScopeError';
  }
}

/**
 * Refuse a root the analysis cannot be scoped to.
 *
 * The message names the path and the reason, because "ENOENT" is not an answer
 * to "what could not be read", and a run that failed without saying what it
 * failed to read leaves the next reader with nothing to check.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function assertAnalysableRoot(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new AnalysisScopeError(`an analysis root must be named by a non-empty path, but it was ${JSON.stringify(root)}`);
  }
  let stats;
  try {
    stats = statSync(root);
  } catch (error) {
    throw new AnalysisScopeError(
      `the analysis root ${root} cannot be read (${error.code ?? 'error'}), so no scope can be fixed over it. `
      + 'Point the run at a project root that exists and that this process may read.',
    );
  }
  if (!stats.isDirectory()) {
    throw new AnalysisScopeError(
      `the analysis root ${root} is not a directory, so there is no tree to scope the analysis to.`,
    );
  }
  // Existing and a directory is not the same as readable. Without this the walk
  // fails later with a bare errno from deep inside it, which names neither what
  // was being measured nor why it stopped — and the scope is precisely the
  // record that is supposed to say what could be read.
  try {
    readdirSync(root);
  } catch (error) {
    throw new AnalysisScopeError(
      `the analysis root ${root} is a directory but cannot be read (${error.code ?? 'error'}), so no artefact `
      + 'beneath it can be enumerated. Grant this process read access to the tree, or point the run at one it may read.',
    );
  }
}

/**
 * The commit the analysis is fixed to, read from git rather than assumed.
 *
 * The experiment's input sits inside another repository's work tree, so
 * `git rev-parse HEAD` run inside it reports that repository's commit and not
 * one of its own. Saying "this project's commit is X" would then be false, so
 * the record states where the commit came from and where the project sits
 * beneath it.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function readTargetCommit(root) {
  const owner = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (owner.status !== 0) {
    return {
      commit: null,
      root,
      path_within_work_tree: null,
      is_own_repository: false,
      reason: `the tree at ${root} is not inside a git work tree, so no commit describes it and every `
        + 'measurement below is tied to this checkout as it stands',
    };
  }

  const workTreeRoot = realpathSync(owner.stdout.trim());
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const commit = head.status === 0 ? head.stdout.trim() : null;
  const isOwnRepository = workTreeRoot === root;
  const relativePath = isOwnRepository ? '.' : root.slice(workTreeRoot.length).replace(/^\//, '');

  return {
    commit,
    root: workTreeRoot,
    path_within_work_tree: relativePath,
    is_own_repository: isOwnRepository,
    reason: isOwnRepository
      ? `the tree is its own repository, so ${commit} is the commit the analysis is fixed to`
      : `the tree sits inside the work tree at ${workTreeRoot} and is not a repository of its own, so its `
        + `commit is that repository's HEAD and ${relativePath} records where it sits beneath it`,
  };
}

/**
 * R0 and R0.5 — fix the analysis boundary.
 *
 * Everything downstream reads the evidence this returns, which is why the
 * design says that without it the meaning of every later fact changes: a fact
 * is only a fact about something, and this is what names the something.
 *
 * @param {string} root — the project root the analysis is scoped to
 * @param {{permissions?: string[]}} [options]
 * @returns {object} the fixed scope, as `ANALYSIS-SCOPE.json` carries it
 */
export function resolveScope(root, { permissions = READ_ONLY_PERMISSIONS } = {}) {
  assertAnalysableRoot(root);
  const resolvedRoot = realpathSync(root);

  return {
    root: resolvedRoot,
    target_commit: readTargetCommit(resolvedRoot),
    exclusion_rules: [...EXCLUSION_RULES],
    permissions: [...permissions],
    external_transmission: {
      policy: EXTERNAL_TRANSMISSION_NONE,
      reason: 'the analysis reads the target and writes only outside it, and sends nothing anywhere. '
        + 'No evidence leaves this machine, so no secret-exclusion rule is needed to permit the run.',
    },
  };
}

/** What an artefact is, decided by where it sits and what it is written in. */
export function classifyArtefactKind(relativePath) {
  const segments = relativePath.split('/');
  const name = segments[segments.length - 1];

  if (segments.some((segment) => DEPENDENCY_KIND_DIRECTORIES.includes(segment))) return 'dependency';
  if (segments.some((segment) => BUILD_OUTPUT_KIND_DIRECTORIES.includes(segment))) return 'build_output';
  if (segments.some((segment) => TEST_DIRECTORY_NAMES.includes(segment))) return 'test';
  if (TEST_FILE_NAME.test(name)) return 'test';
  if (BUILD_MANIFESTS.includes(name)) return 'config';
  if (CONFIG_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))) return 'config';
  if (syntaxLanguageOf(relativePath) !== 'unknown') return 'handwritten';
  return 'unknown';
}

/**
 * The kinds that make an artefact part of the analysis's subject.
 *
 * `in_scope` has to mean "this run reads it", not "this file is not excluded".
 * If everything the exclusions missed were in scope, no scope could ever be
 * empty and the acceptance criterion that an empty scope is reported as empty
 * would be untestable — the state would exist but never occur.
 */
const SUBJECT_ARTEFACT_KINDS = Object.freeze(['handwritten', 'test', 'config']);

/**
 * R0.5 — classify every artefact into exactly one of the three states.
 *
 * The walk records excluded directories rather than skipping them, so
 * "out of scope" is stated about a path that is known to be there. That is the
 * whole difference between a scope boundary and a blind spot.
 *
 * @param {{root: string, scope: object|null, undeterminedPaths?: string[]}} params
 */
export function classifyArtefacts({ root, scope, undeterminedPaths = [] } = {}) {
  if (scope === null || scope === undefined) {
    throw new AnalysisScopeError(
      'the scope has not been fixed, so no artefact can be classified against it — run resolveScope first',
    );
  }
  const forcedUndetermined = new Set(undeterminedPaths);

  const artefacts = listArtefacts(root).map((artefact) => {
    const kind = artefact.readStatus === 'readable' ? classifyArtefactKind(artefact.path) : 'unreadable';
    let coverage;
    if (artefact.exclusion) {
      coverage = 'out_of_scope';
    } else if (
      artefact.readStatus !== 'readable'
      || forcedUndetermined.has(artefact.path)
      || !SUBJECT_ARTEFACT_KINDS.includes(kind)
    ) {
      // A file this run does not read is undetermined, not out of scope: no
      // rule excluded it, and calling it measured would be a claim the run did
      // not earn.
      coverage = 'undetermined';
    } else {
      coverage = 'in_scope';
    }
    return {
      path: artefact.path,
      kind,
      coverage,
      readStatus: artefact.readStatus,
      reason: artefact.reason,
    };
  }).sort((left, right) => compareText(left.path, right.path));

  const counts = { in_scope: 0, out_of_scope: 0, undetermined: 0 };
  for (const artefact of artefacts) counts[artefact.coverage] += 1;

  return {
    root,
    artefacts,
    counts,
    inScopeCount: counts.in_scope,
    isEmpty: counts.in_scope === 0,
  };
}

/** The scope, as Markdown for a reader rather than JSON for a machine. */
export function renderScopeReport(scope) {
  const commit = scope.target_commit;
  return [
    '# R0 — the analysis scope',
    '',
    `Root: \`${scope.root}\``,
    '',
    '## The commit this is fixed to',
    '',
    commit.reason,
    '',
    `- commit: ${commit.commit === null ? '_none — this checkout is not tracked at a commit_' : `\`${commit.commit}\``}`,
    `- work tree root: \`${commit.root}\``,
    `- path beneath it: ${commit.path_within_work_tree === null ? '_not inside a work tree_' : `\`${commit.path_within_work_tree}\``}`,
    `- the project is its own repository: \`${commit.is_own_repository}\``,
    '',
    '## Exclusion rules',
    '',
    `Directories whose contents are recorded rather than measured: ${scope.exclusion_rules.map((rule) => `\`${rule}\``).join(', ')}.`,
    '',
    'An excluded path is still recorded, and is marked `out_of_scope`. It is never dropped from the',
    'record, so that "outside the scope" can never be read as "not there".',
    '',
    '## Permissions',
    '',
    `Held over the target: ${scope.permissions.map((permission) => `\`${permission}\``).join(', ')}. `
      + 'The run holds no write permission over what it measures and does not need one.',
    '',
    '## External transmission',
    '',
    `Policy: \`${scope.external_transmission.policy}\`. ${scope.external_transmission.reason}`,
    '',
  ].join('\n');
}

/** The boundary, as Markdown for a reader rather than JSON for a machine. */
export function renderBoundaryReport(boundary) {
  const lines = [
    '# R0.5 — the scope boundary',
    '',
    `Every artefact beneath \`${boundary.root}\` is classified into exactly one of `
      + `${COVERAGE_STATES.map((state) => `\`${state}\``).join(', ')}.`,
    '',
    '| Coverage state | Artefacts |',
    '|---|---|',
    `| \`in_scope\` | ${boundary.counts.in_scope} |`,
    `| \`out_of_scope\` | ${boundary.counts.out_of_scope} |`,
    `| \`undetermined\` | ${boundary.counts.undetermined} |`,
    '',
  ];

  if (boundary.isEmpty) {
    lines.push(
      '**This scope is empty.** No artefact was classified `in_scope`, so there was nothing to',
      'measure here. An empty scope is reported as empty rather than as a report that happens to',
      'hold no findings, because those two would otherwise read the same and mean opposite things.',
      '',
    );
  }

  const outOfScope = boundary.artefacts.filter((artefact) => artefact.coverage === 'out_of_scope');
  lines.push(
    '## Outside the scope',
    '',
    `These paths are recorded and marked \`out_of_scope\`: they are inside the tree and outside the`,
    'analysis. Their contents were not measured, and that is a statement about this run and not',
    'about them.',
    '',
    ...outOfScope.slice(0, 40).map((artefact) => `- \`${artefact.path}\` (${artefact.kind})`),
    outOfScope.length > 40 ? `- … and ${outOfScope.length - 40} more` : '',
    '',
  );

  const undetermined = boundary.artefacts.filter((artefact) => artefact.coverage === 'undetermined');
  lines.push(
    '## Undetermined',
    '',
    undetermined.length === 0
      ? 'Nothing was left undetermined: every artefact this run could read was classified.'
      : 'These paths could not be classified, and are held apart from both other states:',
    '',
    ...undetermined.map((artefact) => `- \`${artefact.path}\` — ${artefact.reason ?? 'the instrument could not classify it'}`),
    '',
  );

  return `${lines.filter((line) => line !== undefined).join('\n')}\n`;
}

/** The nearest existing ancestor of a path, resolved, with the missing tail re-attached. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function realpathOfNearestExisting(path) {
  const segments = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    segments.unshift(current.slice(current.lastIndexOf(sep) + 1));
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return join(realpathSync(current), ...segments);
}

/**
 * Refuse to publish inside what is being measured.
 *
 * The read-only guarantee is meant to hold by construction rather than by the
 * caller's good behaviour, and this is the construction: the write path is
 * unreachable when it points into the target, so a mistyped `--out` cannot
 * dirty the subject of its own measurement.
 */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
function assertOutputIsOutsideTarget(out, root) {
  const target = realpathOfNearestExisting(root);
  const destination = realpathOfNearestExisting(out);
  if (destination === target || destination.startsWith(`${target}${sep}`)) {
    throw new AnalysisScopeError(
      `the output directory ${out} is inside the target ${root}; the analysis writes only outside what `
      + 'it measures, so that a run cannot change its own subject',
    );
  }
}

/** Write every document the run produced, canonically so a re-run is byte-identical. */
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
/**
 * The language most of the analysed population is written in.
 *
 * A comparison names one corpus language, and a tree that is mostly Rust is a
 * Rust corpus even when it also carries a Dockerfile and a shell script. Ties
 * break alphabetically, so the answer does not depend on the order the tree was
 * walked in.
 */
/**
 * How many files each language contributes, counted from the path alone.
 *
 * A path the syntax layer does not recognise is left out rather than counted as
 * its own language: `unknown` is the absence of a reading, and letting it win a
 * tie would name the population after the instrument's own gap.
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function languageCountsOf(paths) {
  const counts = new Map();
  for (const relativePath of paths) {
    const language = syntaxLanguageOf(relativePath);
    if (language === 'unknown') continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return counts;
}

/**
 * The language most of the analysed population is written in.
 *
 * Ascending order together with a strictly-greater comparison breaks a tie
 * towards the alphabetically first language, so the answer does not depend on
 * the order the tree was walked in.
 */
// [::TICKET::] P22-6, P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-6|P22-7) --for-spec --no-implementation-order`.
function dominantLanguageOf(paths) {
  const byAlphabet = [...languageCountsOf(paths).entries()]
    .sort((left, right) => compareText(left[0], right[0]));
  return byAlphabet
    .reduce((dominant, [language, count]) => (count > dominant.count ? { language, count } : dominant), { language: 'unknown', count: 0 })
    .language;
}

// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function publishDocuments(out, documents) {
  mkdirSync(out, { recursive: true });
  for (const [name, document] of Object.entries(documents)) {
    writeFileSync(join(out, name), typeof document === 'string' ? document : canonicalSerialize(document));
  }
}

/**
 * The report a human and an AI read: what ran, what was measured, what was not.
 *
 * The design's rule is that anything read in order to decide is Markdown in
 * plain English, so this is the surface the analysis is judged from. The JSON
 * beside it exists because a later script consumes it, not because a reader
 * should.
 */
export function renderAnalysisReport(run) {
  const {
    scope,
    boundary,
    structure,
    dependencies,
    surface,
    semantics = null,
    ledger = null,
    history = null,
    gaps = null,
    oracleGap = null,
    redPlan = null,
    counterexamples = null,
    properties = null,
    attempts,
    stagesRun,
  } = run;
  // The title names the last stage that actually ran, and the stages that did
  // not are stated rather than left to be inferred from a section's absence. A
  // report titled for work it did not do is the same overclaim as an adapter
  // that reports a complete result it did not produce.
  const notRun = ANALYSIS_STAGES.filter((stage) => !stagesRun.includes(stage));
  const lines = [
    `# ${stagesRun.length === 1 ? stageLabel(stagesRun[0]) : `R0 to ${stageLabel(stagesRun[stagesRun.length - 1])}`}`
      + ' — scope, structure, dependencies, the execution surface, the semantic material, history, '
      + 'gaps, the oracle validity and the red reconstruction plan',
    '',
    `Stages run: ${stagesRun.map((stage) => `\`${stageLabel(stage)}\``).join(', ')}.`,
    notRun.length === 0
      ? ''
      : `Not run: ${notRun.map((stage) => `\`${stageLabel(stage)}\``).join(', ')}. Nothing below reports on `
        + `${notRun.length === 1 ? 'that stage, and its absence here' : 'those stages, and their absence here'} `
        + 'is not a finding about the project.',
    '',
    renderScopeReport(scope),
    renderBoundaryReport(boundary),
  ];

  if (structure !== null) lines.push(renderStructureReport(structure));
  if (dependencies !== null) lines.push(renderDependencyReport(dependencies));
  if (surface !== null) lines.push(renderExecutionSurfaceReport(surface));
  if (semantics !== null) lines.push(renderSemanticsReport(semantics));
  if (ledger !== null) lines.push(renderClaimLedger(ledger));
  if (history !== null) lines.push(renderHistoryRecord(history));
  if (gaps !== null) lines.push(renderGapsReport(gaps));
  if (oracleGap !== null) lines.push(renderOracleGapReport(oracleGap));
  if (redPlan !== null) lines.push(renderRedReconstructionReport(redPlan));
  if (counterexamples !== null) lines.push(renderCounterexampleReport(counterexamples));
  if (properties !== null) lines.push(renderPropertyTestReport(properties));

  lines.push(
    '# The analysis attempt ledger',
    '',
    'Without this ledger `extracted_count: 0` would mean both "analysed and found nothing" and',
    '"could not analyse", and therefore neither. The two counts are reported separately for that',
    'reason.',
    '',
    '| Count | Value |',
    '|---|---|',
    `| attempts recorded | ${attempts.rows.length} |`,
    `| analysed and extracted nothing | ${attempts.extractedNothingCount} |`,
    `| could not run | ${attempts.couldNotRunCount} |`,
    '',
  );

  const failed = attempts.rows.filter((row) => row.status === 'failed');
  lines.push(
    '## Attempts that could not run',
    '',
    failed.length === 0
      ? 'None: every file the run reached was parsed.'
      : failed.map((row) => `- \`${row.target}\` — phase \`${row.phase}\`, reason \`${row.reason}\``).join('\n'),
    '',
    '## How to read this',
    '',
    'The analysis mode is `syntax_only`. Every fact above was read from source text and its syntax',
    'tree: no name was resolved, no type was checked, and no configuration was replayed. The',
    'execution surface is evidence of presence and not proof of absence. Nothing here decides',
    'whether the project is correct, complete or well designed — that judgement is a human\'s, and',
    'this report exists to put the material for it in front of one.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

/**
 * The invariants R3.5 enumerated, in the shape R6.5's generator reads.
 *
 * `source_fact` is built from the candidate's own anchor, so that a generated
 * property names the line it was read from rather than the run it appeared in.
 *
 * No category is supplied here, and that is the honest input rather than an
 * omission: which category an invariant belongs to is a semantic reading, and
 * this run performs none. The generator records each one as not generated with
 * that reason instead of guessing a category and calling the guess a property
 * (ABOUT-REVERSE 11.5 R-3: an invariant that cannot be classified into a known
 * category cannot be made into a property-based test).
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function propertyInvariantsIn(ledger) {
  return (ledger?.candidates ?? [])
    .filter((candidate) => candidate.kind === 'assert')
    .map((candidate) => ({
      proposition: candidate.proposition,
      source_fact: `${candidate.source_span.file}:${candidate.source_span.line}`,
      kind: candidate.kind,
      scope: candidate.scope,
    }));
}

/**
 * R0 through R2.5 in series, published outside the target.
 *
 * The target is digested before and after. A run that changed what it measured
 * has measured nothing, so the two digests are compared rather than trusted,
 * and a difference is an error rather than a warning.
 *
 * @param {{root: string, out: string, through?: string, permissions?: string[]}} params
 */
// The default is the last declared stage, derived rather than named. A hardcoded
// name here went stale the moment a stage was added after it, and the library
// entry point then silently ran a different prefix from the command line's.
export function analyzeProject({
  root,
  out,
  through = ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1],
  permissions,
} = {}) {
  if (!ANALYSIS_STAGES.includes(through)) {
    throw new AnalysisScopeError(
      `unknown analysis stage ${JSON.stringify(through)}; the stages are ${ANALYSIS_STAGES.join(', ')}. `
      + 'An unrecognised stage is refused rather than ignored, because a run that silently ran '
      + 'everything would look like the result the caller asked for.',
    );
  }
  if (typeof out !== 'string' || out.length === 0) {
    throw new AnalysisScopeError('an analysis run must name the directory it publishes into');
  }
  assertOutputIsOutsideTarget(out, root);

  const scope = resolveScope(root, permissions === undefined ? {} : { permissions });
  const stagesRun = ANALYSIS_STAGES.slice(0, ANALYSIS_STAGES.indexOf(through) + 1);
  const before = digestTree(scope.root, { tolerateUnreadable: true });

  const boundary = classifyArtefacts({ root: scope.root, scope });
  const excludedPaths = boundary.artefacts
    .filter((artefact) => artefact.coverage === 'out_of_scope')
    .map((artefact) => artefact.path);

  // The surface is measured before the dependency graph because the graph's
  // caveat names how many mechanisms stand between it and the running program.
  const surface = stagesRun.includes('r2.5')
    ? measureExecutionSurface({ root: scope.root, excludedPaths })
    : null;
  const structure = stagesRun.includes('r1')
    ? measureStructure({ root: scope.root, excludedPaths })
    : null;
  const dependencies = stagesRun.includes('r2')
    ? measureDependencies({ root: scope.root, excludedPaths, surface })
    : null;

  // R3 reads its population from the boundary R2 measured, so it runs after the
  // dependency graph and is given it rather than left to re-derive one.
  const semantics = stagesRun.includes('r3')
    ? extractSemantics({ root: scope.root, dependencies, excludedPaths })
    : null;
  // R3.5 folds evidence independence over the ledger. The commit channel is
  // consulted when the target is a repository and recorded as not consulted
  // otherwise, so an `unknown` assessment means the channel was absent rather
  // than that it looked and found nothing.
  const inScopePaths = boundary.artefacts
    .filter((artefact) => artefact.coverage === 'in_scope')
    .map((artefact) => artefact.path);
  const ledger = stagesRun.includes('r3.5')
    ? buildClaimLedger({
        root: scope.root,
        excludedPaths,
        history: historyFromGit(scope.root, { files: inScopePaths }),
      })
    : null;

  // R4 → R5 → R5.5 run in series. R4 reconstructs what history says and refuses
  // to read a commit message as intent; R5 enumerates what is missing; R5.5 asks
  // whether the oracle that would have caught any of it is worth anything.
  const history = stagesRun.includes('r4')
    ? reconstructHistory(scope.root, { paths: inScopePaths })
    : null;
  const gaps = stagesRun.includes('r5')
    ? enumerateGaps({ root: scope.root, paths: inScopePaths, boundary, structure, dependencies, surface, ledger })
    : null;
  const classifiedGaps = gaps === null ? null : classifyGaps(gaps);
  const oracleGap = stagesRun.includes('r5.5')
    ? assessOracleValidity({ root: scope.root, ledger })
    : null;

  // R6 plans the red each claim needs, and R6.5 hands R3's invariants to the
  // property generator and lets an obtained counterexample revise the claim it
  // bears on. Neither executes anything: the environment is P22-18's and the
  // ticket that runs a plan is P22-19, so a plan that cannot execute yet is
  // recorded with that reason rather than dropped.
  const redPlan = stagesRun.includes('r6') && ledger !== null
    ? planRedReconstruction({ ledger, oracleGap, gaps: classifiedGaps })
    : null;
  // A counterexample is obtained by executing a plan, which this stage does not
  // do. The empty set is therefore the honest input, and it is reported as empty
  // rather than omitted so that a stage which ran nothing cannot read as a stage
  // that found nothing.
  const counterexamples = stagesRun.includes('r6.5') && ledger !== null
    ? applyCounterexamples([], ledger)
    : null;
  const properties = stagesRun.includes('r6.5') && ledger !== null
    ? generatePropertyTests(propertyInvariantsIn(ledger))
    : null;

  const after = digestTree(scope.root, { tolerateUnreadable: true });
  if (before.sha256 !== after.sha256 || before.unreadable.join(',') !== after.unreadable.join(',')) {
    throw new Error(
      `the analysis modified its target: ${scope.root} hashed ${before.sha256} before the run and `
      + `${after.sha256} after it. A run that changes what it measured cannot be believed.`,
    );
  }

  const attempts = buildAttemptLedger([
    ...(structure?.attempts ?? []),
    ...(dependencies?.attempts ?? []),
    ...(surface?.attempts ?? []),
    ...(semantics?.attempts ?? []),
  ]);
  const report = renderAnalysisReport({
    scope,
    boundary,
    structure,
    dependencies,
    surface,
    semantics,
    ledger,
    history,
    gaps: classifiedGaps,
    oracleGap,
    attempts,
    stagesRun,
  });

  const documents = {
    'ANALYSIS-SCOPE.json': {
      ...scope,
      target_digest: {
        sha256: before.sha256,
        file_count: before.fileCount,
        // A digest over fewer files than the tree holds would otherwise read as
        // a digest over all of it, which is how an unreadable entry becomes
        // invisible in the one record that is meant to prove nothing moved.
        unreadable_paths: [...before.unreadable],
        unmodified: true,
      },
    },
    'SCOPE-BOUNDARY.json': boundary,
    'ANALYSIS-ATTEMPTS.json': attempts,
    'R0-R2-REPORT.md': report,
  };
  if (structure !== null) documents['STRUCTURE.json'] = structure;
  if (dependencies !== null) documents['DEPENDENCIES.json'] = dependencies;
  if (surface !== null) documents['EXECUTION-SURFACE.json'] = surface;
  // R3's raw facts are deliberately not published as a sidecar. The design's
  // sidecar list names `CLAIM-LEDGER.json` and an evidence registry, not a dump
  // of every enumerated fact — and on the subject corpus that dump is thirty
  // megabytes of rows whose propositions the ledger already carries. The
  // material stays in the value the run hands back and in the report's table.
  if (ledger !== null) documents['CLAIM-LEDGER.json'] = ledger;
  if (history !== null) documents['HISTORY-PROVENANCE.json'] = history;
  if (classifiedGaps !== null) {
    documents['GAPS.json'] = classifiedGaps;
    // The candidate `oracle compare --stage r5` consumes, published beside the
    // gaps so the comparison reads the same list the report does.
    documents['GAP-CANDIDATE.json'] = buildGapCandidate(classifiedGaps, { language: dominantLanguageOf(inScopePaths) });
  }
  if (oracleGap !== null) documents['ORACLE-GAP.json'] = oracleGap;
  if (redPlan !== null) documents['RED-RECONSTRUCTION-PLAN.json'] = redPlan;
  if (counterexamples !== null) {
    // The revised ledger is deliberately not republished: it is the ledger above
    // with a handful of revisions, and writing it twice would double a twelve
    // megabyte sidecar to record a few lines. What R6.5 produced is the edge,
    // and the edge is what this document carries.
    documents['COUNTEREXAMPLE-RESULTS.json'] = {
      root: scope.root,
      stage: COUNTEREXAMPLE_STAGE,
      empty: counterexamples.empty,
      applied: counterexamples.applied,
      unobservable: counterexamples.unobservable,
      revisions: counterexamples.ledger.revisions,
      verdict: counterexamples.ledger.verdict,
      caveat: counterexamples.caveat,
    };
  }
  if (properties !== null) documents['GENERATED-PROPERTIES.json'] = properties;

  publishDocuments(out, documents);

  return {
    scope,
    boundary,
    structure,
    dependencies,
    surface,
    semantics,
    ledger,
    history,
    gaps: classifiedGaps,
    oracleGap,
    redPlan,
    counterexamples,
    properties,
    attempts,
    report,
    stagesRun,
  };
}
