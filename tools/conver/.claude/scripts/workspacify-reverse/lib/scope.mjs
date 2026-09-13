// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
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
import {
  renderDecisionCards,
  renderServing,
  renderServingMarkdown,
  renderWithholdingCounts,
  renderWithholdingNote,
} from './packet.mjs';
// [::TICKET::] P23-8: R7's two more lanes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
import {
  assertAuthorityRecorded,
  assertLanesAreSeparate,
  blockCanonisation,
  classifySecurityLane,
  measureFalsification,
  renderLaneReport,
} from './security-lane.mjs';
import {
  ADJUDICATION_STATES,
  MISMATCH_KINDS,
  adjudicateCandidates,
  assertNoCandidateLost,
  deriveMismatches,
  generateCandidates,
  mapDirNodes,
  physicalPartition,
  renderAdjudicationCards,
} from './reflexion.mjs';
import {
  buildOriginSpec,
  buildOriginSpecCandidate,
  renderOriginSpec,
  validateOriginSpec,
} from './origin-spec.mjs';
import { buildCapabilityProfile } from './capability-profile.mjs';
import { assessEligibility, renderEligibility } from './eligibility.mjs';
import { EXCLUSION_RULES, buildAttemptLedger, listArtefacts } from './analysis-tech.mjs';
import { measureStructure, renderStructureReport, syntaxLanguageOf } from './structure.mjs';
import { extractSemantics, renderSemanticsReport } from './semantics.mjs';
import { reconstructHistory, renderHistoryRecord } from './history.mjs';
import { buildGapCandidate, classifyGaps, enumerateGaps, renderGapsReport } from './gaps.mjs';
import { assessOracleValidity, renderOracleGapReport } from './oracle-gap.mjs';
import { planRedReconstruction, renderRedReconstructionReport } from './red-reconstruction.mjs';
import { STAGE as COUNTEREXAMPLE_STAGE, applyCounterexamples, renderCounterexampleReport } from './counterexample.mjs';
import { deriveCounterexamples, runCounterexamples } from './counterexample-run.mjs';
import { generatePropertyTests, renderPropertyTestReport } from './property-tests.mjs';
import { historyFromGit } from './evidence-independence.mjs';
import { measureDependencies, renderDependencyReport } from './dependencies.mjs';
import { measureExecutionSurface, renderExecutionSurfaceReport } from './execution-surface.mjs';
import { measureDynamicCoupling, renderDynamicCoupling } from './dynamic-coupling.mjs';
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
 * The stages R0 through R8, in the order the design runs them.
 *
 * `--through` selects an inclusive prefix, so a run can stop at the structural
 * measurement and say so. An unknown stage is refused rather than ignored: a
 * mistyped `--through` that silently ran everything would answer a question
 * nobody asked and look like a complete result.
 */
export const ANALYSIS_STAGES = Object.freeze([
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
  'r0', 'r0.5', 'r1', 'r2', 'r2.5', 'r3', 'r3.5', 'r4', 'r5', 'r5.5', 'r6', 'r6.5', 'r7', 'r8',
]);

// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
/**
 * The order the pipeline evaluates the stages in.
 *
 * It is not `ANALYSIS_STAGES` order, and the difference is deliberate. The
 * execution surface (R2.5) is measured before the structural measurement (R1)
 * and the dependency graph (R2), because the graph's caveat has to state how
 * many mechanisms stand between it and the running program, and the surface is
 * what counts them. R2 therefore consumes a product of R2.5 and could not run
 * before it.
 *
 * The stage *numbering* is the design's; this list is what the code does. The
 * set is the same — a full run reaches every declared stage — and the two are
 * asserted equal, so a stage added to one list cannot be silently missed by the
 * other. The order is declared here rather than left to the sequence of the
 * calls inside the pipeline, so that a reader can see it without reading the
 * pipeline and a test can assert it as a list.
 */
export const ANALYSIS_EVALUATION_ORDER = Object.freeze([
  'r0', 'r0.5', 'r2.5', 'r1', 'r2', 'r3', 'r3.5', 'r4', 'r5', 'r5.5', 'r6', 'r6.5', 'r7', 'r8',
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

/**
 * A stage's result, or `null` when the run stopped before reaching it.
 *
 * `runStage` is the caller's notifier rather than something this closes over, so
 * a call site in another function can use it too. The `stagesRun.includes(...)
 * ? runStage(...) : null` sites already in `analyzeProject` are deliberately not
 * migrated here: they read the same, and moving them would bury this ticket's
 * change in a rename.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
function stageResult(stagesRun, name, produce, runStage) {
  return stagesRun.includes(name) ? runStage(name, produce) : null;
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
 * Record a document under its name when the stage that produces it ran.
 *
 * A document whose stage did not run is absent rather than empty. An empty
 * document reads as a stage that looked and found nothing, which is a different
 * fact from a stage that was never asked to run — design 2.4's rule that an
 * unstated zero cannot be told apart from a measured one.
 *
 * The map is the local accumulator this function's caller is building, so this
 * writes into it rather than copying it; the name says what happens and the call
 * reads as the sentence it is.
 */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function publishWhenPresent(documents, name, value) {
  if (value !== null) documents[name] = value;
}

/**
 * One ledger gathering every stage's attempts.
 *
 * Each stage that measures reports its own attempts, and the ledger's value is
 * that they are counted in one place: "analysed and found nothing" and "could
 * not analyse" are told apart by the two counts only because every attempt is
 * beside every other. Naming the five sources once here keeps the assembly
 * readable as the sentence it is, rather than as a spread that widens every
 * time a stage is added.
 */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
export function buildAnalysisAttemptLedger({ structure, dependencies, surface, semantics, dynamicCoupling }) {
  return buildAttemptLedger([
    ...(structure?.attempts ?? []),
    ...(dependencies?.attempts ?? []),
    ...(surface?.attempts ?? []),
    ...(semantics?.attempts ?? []),
    ...(dynamicCoupling?.attempts ?? []),
  ]);
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
    eligibility = null,
    structure,
    dependencies,
    surface,
    dynamicCoupling = null,
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
    // The assessment is R0's output, so it is rendered inside R0's section —
    // after the scope that fixes it and before the boundary R0.5 draws.
    ...(eligibility === null ? [] : [renderEligibility(eligibility)]),
    renderBoundaryReport(boundary),
  ];

  if (structure !== null) lines.push(renderStructureReport(structure));
  if (dependencies !== null) lines.push(renderDependencyReport(dependencies));
  if (surface !== null) lines.push(renderExecutionSurfaceReport(surface));
  if (dynamicCoupling !== null) lines.push(renderDynamicCoupling(dynamicCoupling));
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
 * R6.5's two halves, built in one place.
 *
 * The counterexample half and the property half were two near-identical
 * `stagesRun.includes('r6.5') && ledger !== null ? runStage(...) : null`
 * expressions whose only difference was the function they called. Reading them
 * together is what makes the stage legible: it derives the counterexamples from
 * the plan R6 just built, runs each one through the isolation, and hands R3's
 * invariants to the property generator.
 *
 * The derivation comes first and is not skippable. Handing the reverse edge a
 * literal empty set — which is what this stage did — made a stage that had nothing
 * to do indistinguishable from a plan that had nothing in it.
 *
 * @param {object} params
 * @param {string} params.root - the subject every counterexample is isolated from
 * @param {object} params.ledger - the claim ledger R6.5 revises
 * @param {object} params.redPlan - the R6 plan the counterexamples are derived from
 * @param {object} params.reconstruction - how R6.5 executes, as `{ executor }`
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
async function runR65({ root, ledger, redPlan, reconstruction }) {
  const { executor = null } = reconstruction;
  const derived = deriveCounterexamples({ redPlan, ledger });
  const records = executor === null
    ? derived
    : (await runCounterexamples({ root, counterexamples: derived, execute: executor })).counterexamples;

  return {
    counterexamples: applyCounterexamples(records, ledger),
    properties: generatePropertyTests(propertyInvariantsIn(ledger)),
  };
}

// [::TICKET::] P22-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-9 --for-spec --no-implementation-order`.
/**
 * R0 through R2.5 in series, published outside the target.
 *
 * The target is digested before and after. A run that changed what it measured
 * has measured nothing, so the two digests are compared rather than trusted,
 * and a difference is an error rather than a warning.
 *
 * The run is asynchronous because R6.5 executes: the counterexample channel runs
 * each counterexample inside the disposable worktree the isolation owns, and that
 * isolation is asynchronous. Every other stage is a synchronous reading, so the
 * function returns a promise for the sake of the one stage that must wait.
 *
 * @param {{root: string, out: string, through?: string, options?: object}} params
 * @param {object} [params.options] - the caller's own contributions to the run
 * @param {Function} [params.options.onStage] - called with each stage identifier as the pipeline reaches
 *        it, so a caller can attribute a failure to the stage it happened in
 * @param {object} [params.options.reconstruction] - how R6.5 executes, as `{ executor }`. Without an executor
 *        every counterexample is refused with `executor-missing`, which is a result rather than a gap
 */
// The default is the last declared stage, derived rather than named. A hardcoded
// name here went stale the moment a stage was added after it, and the library
// entry point then silently ran a different prefix from the command line's.
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/** The name the old cycle's partition keeps when its cycle is interrupted: left where it is, and read as material. */
const DIRS_TREE_FILE = 'RFC-ROOT-Dirs-Tree.json';

/**
 * Which of the four cases the logical side of the comparison is in.
 *
 * Four, not two, because "there is no prior partition", "the prior partition is
 * on disk and unreadable" and "the prior partition names nothing" are three
 * different measurements and only the last two are statements about the corpus.
 * Collapsing them would print an absence over a file that is present, which is
 * the shape design 2.4 forbids: an unrecorded difference reads the same as no
 * difference. Each state is a distinct machine-readable value so that a consumer
 * reading the sidecar — rather than the prose beside it — can tell them apart.
 */
export const LOGICAL_PARTITION_STATES = Object.freeze({
  /** No prior partition on disk — the normal case for a project that came in by pattern 1 or 3. */
  UNDECIDED: 'undecided',
  /** A prior partition is on disk and could not be read as JSON. */
  UNREADABLE: 'unreadable',
  /** A prior partition on disk that maps no directory. */
  EMPTY: 'empty',
  /** A prior partition on disk with at least one mapped directory. */
  STATED: 'stated',
});

/** The prior partition as a sorted list, so it serialises and compares in one order. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function logicalPartitionOf(dirsTree) {
  return [...mapDirNodes(dirsTree).entries()]
    .map(([path, mappedNodeIds]) => ({ path, mappedNodeIds }))
    .sort((left, right) => compareText(left.path, right.path));
}

/**
 * Read the prior partition and say which of the three cases this is.
 *
 * The design is explicit that reading the old `*-Dirs-Tree.json` as *the*
 * partition is failure mode F3 in its most expensive form, because those are the
 * boundaries the whole act exists to redraw (design 3.2). So the file is read as
 * material for a comparison and never as an answer: the cards put the prior
 * beside the measured layout, and what to do about the difference is the reader's.
 *
 * A file that is present and unparseable is reported as present, with the reason.
 * Treating it as absent would allow a broken prior to pass as a project that
 * never had one, which is a statement the run cannot make.
 */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function readPriorPartition(root) {
  const path = join(root, DIRS_TREE_FILE);
  if (!existsSync(path)) {
    return {
      dirsTree: null,
      logical: null,
      logicalState: LOGICAL_PARTITION_STATES.UNDECIDED,
      logicalReason: `No prior partition is on disk at ${DIRS_TREE_FILE}, which is the normal case for a project that `
        + 'came in by pattern 1 or 3: the logical partition is undecided, so the cards below are a prompt rather '
        + 'than a comparison.',
    };
  }

  let dirsTree;
  try {
    dirsTree = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      dirsTree: null,
      logical: null,
      // Its own state, not `undecided`: a consumer reading the sidecar has to be
      // able to tell a project that never had a prior partition from one whose
      // prior partition is on disk and broken, and only the reason string would
      // otherwise carry the difference.
      logicalState: LOGICAL_PARTITION_STATES.UNREADABLE,
      logicalReason: `A prior partition is on disk at ${DIRS_TREE_FILE} and could not be read (${error.message}), so `
        + 'the logical partition is undecided for a different reason than absence: the file is present and its '
        + 'content is unknown.',
    };
  }

  const logical = logicalPartitionOf(dirsTree);
  return {
    dirsTree,
    logical,
    logicalState: logical.length === 0 ? LOGICAL_PARTITION_STATES.EMPTY : LOGICAL_PARTITION_STATES.STATED,
    logicalReason: logical.length === 0
      ? `A prior partition is on disk at ${DIRS_TREE_FILE} and names no package, so its emptiness is a measurement `
        + 'about the prior cycle rather than an absence of one.'
      : '',
  };
}

/**
 * R7's security lane: the classification, the canonisation blocks it implies, and
 * the two assertions, run before either is published.
 *
 * The lane presents material. `blockCanonisation` is a refusal to canonise and not
 * a decision to reject, so a blocked claim is published with what it is missing
 * and the run continues — the distinction between "this document is wrong" (the
 * assertions throw and nothing is published) and "this claim is blocked" (a record
 * is published and the run carries on) is carried by which of the two happens.
 *
 * The falsification plan is the claim's own recorded evidence. That is the only
 * observation-channel record this run holds, and `isStrongFalsification` reads
 * exactly its `evidence_mode` — so the budget is compared against a measurement
 * the run took rather than against a plan invented at this call site. Today every
 * record is `source_static` and every lane claim is therefore blocked; the day a
 * channel observes behaviour, this predicate admits the claim without a second rule.
 */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function buildSecurityLane(ledger) {
  const classification = classifySecurityLane(ledger);
  // Run on the classification that is about to be published, so a document that
  // lost a lane fails here rather than passing over an object nothing wrote.
  assertLanesAreSeparate(classification);

  const blocks = classification.lane.security.map((claim) => {
    const falsificationPlan = claim.evidence ?? [];
    return {
      ...blockCanonisation(claim, { authorityRecord: null, falsificationPlan }),
      // C002 requires the count found beside the count required, so a reader can
      // see how far short a plan fell. Both come from the module that owns the
      // budget rather than from a second count taken at this call site.
      falsification: measureFalsification(claim, falsificationPlan),
    };
  });

  // Every claim the document would mark canonisable must carry an authority
  // record. No run records a human authority yet, so this is the empty set today
  // — and the day one is recorded, this is what refuses a claim without it.
  for (const block of blocks.filter((entry) => entry.canonisation_blocked === false)) {
    assertAuthorityRecorded(block.authority);
  }

  return {
    root: classification.root,
    classification,
    blocks,
    blockedCount: blocks.filter((block) => block.canonisation_blocked).length,
  };
}

/**
 * The adjudication state the cards carry.
 *
 * A state belongs to a candidate, and a card draws its options from several. The
 * step that records decisions is Step 5 and is not a stage of this analysis, so
 * R7 adjudicates nothing and every candidate — and therefore every card — is
 * unresolved.
 *
 * A set whose candidates disagree is refused rather than summarised. Picking one
 * candidate's state for a card built from another's options would settle the
 * question the card asks, and a card that arrives already answered is the
 * machine taking a judgement reserved for the reader (ABOUT-REVERSE 6.2 item 1).
 */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function singleAdjudicationState(candidates) {
  const states = [...new Set(candidates.map((candidate) => candidate.adjudication))];
  if (states.length !== 1) {
    throw new Error(
      `the candidate set carries ${states.length} different adjudication states (${states.join(', ')}), so the cards `
      + 'cannot state one: a card draws its options from several candidates, and choosing one of their states would '
      + 'decide the question the card asks',
    );
  }
  return states[0];
}

/** How many mismatches of each declared kind, zeros included. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function countMismatchesByKind(mismatches) {
  return Object.fromEntries(
    MISMATCH_KINDS.map((kind) => [kind, mismatches.filter((mismatch) => mismatch.kind === kind).length]),
  );
}

/**
 * R7's adjudication cards: the two partitions, the cards, and the mismatches the
 * record must carry.
 *
 * The conservation check runs between generation and publication, on the list
 * that is published. A rendering step cannot then lose what the computation
 * preserved, because the thing asserted over is the thing written.
 *
 * The mismatches are derived over the whole candidate set and then attached to
 * the card of the directory they belong to, so the count the document states and
 * the entries a reader can see are the same list rather than two derivations of it.
 */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function buildAdjudication({ structure, dependencies, prior }) {
  const physical = physicalPartition(structure);
  const priorFacts = {
    logical: prior.logical,
    logicalState: prior.logicalState,
    logicalReason: prior.logicalReason,
  };

  // A measurement that placed no directory leaves nothing to partition, and this
  // lane is material: an empty target is a case the analysis already reports
  // explicitly, and a lane that threw here would be the gate design 1.2 forbids.
  // So the absence is published as the measurement it is, in the same shape the
  // serving packet uses for its own empty case.
  if (physical.groups.length === 0) {
    return {
      physical,
      ...priorFacts,
      empty: true,
      generated: [],
      candidates: [],
      cards: [],
      adjudicationState: ADJUDICATION_STATES[0],
      withheld: [],
      mismatches: [],
      recordedMismatchCount: 0,
      mismatchCounts: countMismatchesByKind([]),
      mismatchCountsByCandidate: {},
      cardsWithNoMismatch: 0,
    };
  }

  const generated = generateCandidates({ structure, dependencies, dirsTree: prior.dirsTree });
  const candidates = adjudicateCandidates(generated);
  assertNoCandidateLost(generated, candidates);

  const { cards, withheld } = renderAdjudicationCards(candidates);
  const mismatches = candidates.flatMap((candidate) => deriveMismatches(candidate, physical));
  const adjudicationState = singleAdjudicationState(candidates);
  const cardsWithState = cards.map((card) => ({
    ...card,
    adjudication: adjudicationState,
    mismatches: mismatches.filter((mismatch) => mismatch.path === card.scope),
  }));

  return {
    physical,
    ...priorFacts,
    empty: false,
    generated,
    candidates,
    cards: cardsWithState,
    // The single state the cards carry, published beside them so a reader can
    // check each card against it rather than having to infer it from the set.
    adjudicationState,
    withheld,
    mismatches,
    recordedMismatchCount: mismatches.length,
    mismatchCounts: countMismatchesByKind(mismatches),
    mismatchCountsByCandidate: Object.fromEntries(candidates.map((candidate) => [
      candidate.candidate_id,
      mismatches.filter((mismatch) => mismatch.candidate_id === candidate.candidate_id).length,
    ])),
    cardsWithNoMismatch: cardsWithState.filter((card) => card.mismatches.length === 0).length,
  };
}

/** R7's security lane as the Markdown a human reads before holding authority. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function renderSecurityLaneMarkdown(lane) {
  return [
    renderLaneReport(lane.classification),
    '',
    '## What is blocked from canonisation',
    '',
    ...renderWithholdingCounts({ served: lane.classification.counts.security, withheld: 0 }),
    `- blocked from canonisation: ${lane.blockedCount}`,
    '',
    ...lane.blocks
      .filter((block) => block.canonisation_blocked)
      .flatMap((block) => [
        `- \`${block.claim_id}\` — ${block.reason}`,
        `  - falsification channels found: ${block.falsification.channelsFound}, required: ${block.falsification.channelsRequired}`,
      ]),
    '',
    'A blocked claim is withheld from canonisation, not from this page: every one of them is listed above,',
    'and the block is a refusal to promote it into what the code ought to do. Whether the authority for a',
    'safety boundary is the right authority is not mechanisable and is not claimed here; the lane publishes',
    'which authority is required and leaves the judgement with the reader (ABOUT-REVERSE 4.6).',
    '',
  ].join('\n');
}

/** R7's adjudication cards as the Markdown that puts the two partitions side by side. */
// [::TICKET::] P23-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-8 --for-spec --no-implementation-order`.
function renderAdjudicationMarkdown(adjudication) {
  if (adjudication.empty) {
    return [
      '# Adjudication cards — the logical boundary and the physical one, side by side',
      '',
      'This card set is empty. The structure measurement placed no directory, so there was no boundary to put',
      'beside another: that is an explicit empty result from a run that looked, not a report that merely looks',
      'short, and no candidate was dropped in producing it — there was none to drop.',
      '',
    ].join('\n');
  }

  const logicalLines = adjudication.logicalState === LOGICAL_PARTITION_STATES.STATED
    ? adjudication.logical.map((entry) => `- \`${entry.path}\` — ${entry.mappedNodeIds.map((node) => node.nodeId).join(', ')}`)
    : [adjudication.logicalReason];

  return [
    '# Adjudication cards — the logical boundary and the physical one, side by side',
    '',
    'These cards present two partitions and decide neither. Which partition the RFC records is the first of',
    'the six judgements ABOUT-REVERSE 6.2 reserves for the AI, and a document that picked one would take it.',
    '',
    '## Physical partition',
    '',
    ...adjudication.physical.groups.map((group) => `- \`${group.name}\``),
    '',
    '## Logical partition',
    '',
    ...logicalLines,
    '',
    '## Cards',
    '',
    ...renderWithholdingCounts({ served: adjudication.cards.length, withheld: adjudication.withheld.length }),
    `- cards with no mismatch: ${adjudication.cardsWithNoMismatch}`,
    ...MISMATCH_KINDS.map((kind) => `- ${kind}: ${adjudication.mismatchCounts[kind]}`),
    '',
    ...adjudication.cards.flatMap((card) => [
      `### \`${card.scope}\``,
      '',
      `- adjudication: ${card.adjudication}`,
      `- options: ${card.options.length}`,
      `- mismatches: ${card.mismatches.length === 0 ? 'none' : card.mismatches.map((mismatch) => `${mismatch.kind} \`${mismatch.path}\``).join(', ')}`,
      '',
    ]),
    '## What was withheld',
    '',
    ...renderWithholdingNote({
      withheldCount: adjudication.withheld.length,
      subject: 'measured directory entries',
      entries: adjudication.withheld.map((entry) => ({ count: 1, reason: `\`${entry.directory}\` — ${entry.reason}` })),
    }),
    '',
    'A candidate whose mismatches are zero agrees with the measured layout by construction, which is what that',
    'rule asserts rather than a finding about the architecture: a zero difference is a signal rather than a clean',
    'result (design 2.4, F1). A mismatch recorded above is not a contradiction — a contradiction is an',
    '*unrecorded* inconsistency, and the record is this page.',
    '',
  ].join('\n');
}

export async function analyzeProject({
  root,
  out,
  through = ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1],
  options = {},
} = {}) {
  const { onStage = null, reconstruction = {} } = options;
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

  // The caller may watch a run go past. A stage that fails is then reported by
  // the caller under the name of the stage it failed in, rather than arriving
  // as a stack trace from a pipeline that only names itself.
  //
  // One stage's work may span more than one call — R0 fixes the scope and then
  // reads the eligibility assessment — so a stage is announced the first time
  // the pipeline reaches it and not again. The caller attributes a failure to
  // the stage it happened in, and a repeated identifier would report a stage
  // that was reached once as a stage that ran twice.
  const announced = new Set();
  const runStage = (stage, produce) => {
    if (typeof onStage === 'function' && !announced.has(stage)) {
      announced.add(stage);
      onStage(stage);
    }
    return produce();
  };

  // The permissions are not configurable: a run holds read access to its target
  // and nothing else, so `resolveScope`'s own default is the only value there is.
  const scope = runStage('r0', () => resolveScope(root));
  const stagesRun = ANALYSIS_STAGES.slice(0, ANALYSIS_STAGES.indexOf(through) + 1);
  const before = digestTree(scope.root, { tolerateUnreadable: true });

  const boundary = runStage('r0.5', () => classifyArtefacts({ root: scope.root, scope }));
  const excludedPaths = boundary.artefacts
    .filter((artefact) => artefact.coverage === 'out_of_scope')
    .map((artefact) => artefact.path);

  // R0's eligibility assessment. It reads the R0 channel — the artefact walk, the
  // subject root and the target commit R0 resolved — and nothing later, so its
  // findings are the same at every depth a run can stop at, and the material
  // exists at the moment the decision is cheap. No stage below reads it back: a
  // stage that branched on it would be the refusal condition design 1.2 forbids.
  const eligibility = stageResult(
    stagesRun,
    'r0',
    () => assessEligibility({
      artefacts: boundary.artefacts,
      root: scope.root,
      history: scope.target_commit,
    }),
    runStage,
  );

  // The surface is measured before the dependency graph because the graph's
  // caveat names how many mechanisms stand between it and the running program.
  const surface = stagesRun.includes('r2.5')
    ? runStage('r2.5', () => measureExecutionSurface({ root: scope.root, excludedPaths }))
    : null;
  // R2.5's dynamic half joins the static list against what a session inside a
  // disposable copy actually observed. It is the first stage that does more
  // than read, which is why the sandbox and not the subject tree is where the
  // session runs, and why the run's own before-and-after digest below is the
  // second, independent check that the subject did not move.
  const dynamicCoupling = surface === null
    ? null
    : runStage('r2.5', () => measureDynamicCoupling({
      root: scope.root,
      staticMechanisms: surface.mechanisms,
      sandboxOptions: {},
    }));
  const structure = stagesRun.includes('r1')
    ? runStage('r1', () => measureStructure({ root: scope.root, excludedPaths }))
    : null;
  const dependencies = stagesRun.includes('r2')
    ? runStage('r2', () => measureDependencies({ root: scope.root, excludedPaths, surface }))
    : null;

  // R3 reads its population from the boundary R2 measured, so it runs after the
  // dependency graph and is given it rather than left to re-derive one.
  const semantics = stagesRun.includes('r3')
    ? runStage('r3', () => extractSemantics({ root: scope.root, dependencies, excludedPaths }))
    : null;
  // R3.5 folds evidence independence over the ledger. The commit channel is
  // consulted when the target is a repository and recorded as not consulted
  // otherwise, so an `unknown` assessment means the channel was absent rather
  // than that it looked and found nothing.
  const inScopePaths = boundary.artefacts
    .filter((artefact) => artefact.coverage === 'in_scope')
    .map((artefact) => artefact.path);
  const ledger = stagesRun.includes('r3.5')
    ? runStage('r3.5', () => buildClaimLedger({
      root: scope.root,
      excludedPaths,
      history: historyFromGit(scope.root, { files: inScopePaths }),
      // R-1 is enforced where the claims first exist, and the mechanisms it is
      // enforced against are R2.5's measurement rather than one re-derived here.
      // A stage that measured its own surface would be free to disagree with the
      // one published beside it.
      mechanisms: surface?.mechanisms ?? [],
    }))
    : null;

  // R4 → R5 → R5.5 run in series. R4 reconstructs what history says and refuses
  // to read a commit message as intent; R5 enumerates what is missing; R5.5 asks
  // whether the oracle that would have caught any of it is worth anything.
  const history = stagesRun.includes('r4')
    ? runStage('r4', () => reconstructHistory(scope.root, { paths: inScopePaths }))
    : null;
  const gaps = stagesRun.includes('r5')
    ? runStage('r5', () => enumerateGaps({ root: scope.root, paths: inScopePaths, boundary, structure, dependencies, surface, ledger }))
    : null;
  const classifiedGaps = gaps === null ? null : classifyGaps(gaps);
  const oracleGap = stagesRun.includes('r5.5')
    ? runStage('r5.5', () => assessOracleValidity({ root: scope.root, ledger }))
    : null;

  // R6 plans the red each claim needs, and R6.5 hands R3's invariants to the
  // property generator and lets an obtained counterexample revise the claim it
  // bears on. Neither executes anything: the environment is P22-18's and the
  // ticket that runs a plan is P22-19, so a plan that cannot execute yet is
  // recorded with that reason rather than dropped.
  const redPlan = stagesRun.includes('r6') && ledger !== null
    ? runStage('r6', () => planRedReconstruction({ ledger, oracleGap, gaps: classifiedGaps }))
    : null;
  // R6.5's input is derived from the plan R6 just built rather than manufactured
  // empty: a hidden `[]` here made a stage that falsified nothing publish a
  // document reading as a result over a plan carrying one entry per claim. An
  // empty derived set is now a statement about the plan, and it is distinguishable
  // from a plan whose counterexamples were all derived and none executed.
  const r65 = stagesRun.includes('r6.5') && ledger !== null
    ? await runStage('r6.5', () => runR65({ root: scope.root, ledger, redPlan, reconstruction }))
    : null;
  const counterexamples = r65 === null ? null : r65.counterexamples;
  const properties = r65 === null ? null : r65.properties;

  // R7 and R8 are the analysis's exit. R7 serves the claims a human still has
  // to decide; R8 emits the spec every later command reads and states what this
  // analysis could not prove. They run last because they read everything the
  // stages above produced, and the spec is validated before it is published so
  // that a claim resting on evidence that is not there is demoted rather than
  // emitted with a dangling reference.
  const serving = stagesRun.includes('r7') && ledger !== null
    ? runStage('r7', () => renderServing(ledger, { layered: true }))
    : null;
  // R7's two more lanes. N3 and N4 were both modules complete, tested and
  // unreachable: a classification nothing read and a card set nothing rendered.
  // Each is built here, asserted against itself before publication, and published
  // twice — once as the Markdown a human reads and once as the JSON a later
  // consumer reads without parsing prose.
  const securityLane = stagesRun.includes('r7') && ledger !== null
    ? runStage('r7', () => buildSecurityLane(ledger))
    : null;
  // The cards consume R1, R2 and the prior partition, so they are built only when
  // all three stages ran: `generateCandidates` refuses half the evidence rather
  // than deriving candidates from it (see `requireMeasurements`).
  const adjudication = stagesRun.includes('r7') && structure !== null && dependencies !== null
    ? runStage('r7', () => buildAdjudication({
      structure,
      dependencies,
      prior: readPriorPartition(scope.root),
    }))
    : null;
  const originSpec = stagesRun.includes('r8') && ledger !== null
    ? runStage('r8', () => validateOriginSpec(
      buildOriginSpec({ root: scope.root, ledger, treeHash: before.sha256 }),
      { root: scope.root },
    ))
    : null;
  const profile = stagesRun.includes('r8')
    ? buildCapabilityProfile({ ledger, gaps: classifiedGaps, surface, redPlan, counterexamples })
    : null;

  const after = digestTree(scope.root, { tolerateUnreadable: true });
  if (before.sha256 !== after.sha256 || before.unreadable.join(',') !== after.unreadable.join(',')) {
    throw new Error(
      `the analysis modified its target: ${scope.root} hashed ${before.sha256} before the run and `
      + `${after.sha256} after it. A run that changes what it measured cannot be believed.`,
    );
  }

  const attempts = buildAnalysisAttemptLedger({ structure, dependencies, surface, semantics, dynamicCoupling });
  const report = renderAnalysisReport({
    scope,
    boundary,
    eligibility,
    structure,
    dependencies,
    surface,
    dynamicCoupling,
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
    // R0 always runs, so the assessment is published by every run of every depth.
    // It is added unconditionally rather than guarded, because a document set
    // that changed shape with what the assessment found would make the finding
    // into a gate (design 1.2).
    'ELIGIBILITY.json': eligibility,
    'ANALYSIS-ATTEMPTS.json': attempts,
    'R0-R2-REPORT.md': report,
  };
  if (structure !== null) documents['STRUCTURE.json'] = structure;
  if (dependencies !== null) documents['DEPENDENCIES.json'] = dependencies;
  if (surface !== null) documents['EXECUTION-SURFACE.json'] = surface;
  // The dynamic half's document is published beside the static one it is the
  // counterpart of, so a reader comparing the two surfaces reads them from the
  // same run and cannot be shown one that disagrees with the other.
  if (dynamicCoupling !== null) documents['DYNAMIC-COUPLING.json'] = dynamicCoupling;
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
      // True only when the plan carried no reconstruction ticket. The three counts
      // beside it are what make the other emptiness — a plan whose counterexamples
      // were all derived and none executed — readable as the different fact it is.
      empty: counterexamples.empty,
      derivedCount: counterexamples.counts.derivedCount,
      executedCount: counterexamples.counts.executedCount,
      refusedCount: counterexamples.counts.refusedCount,
      refusedByReason: counterexamples.counts.refusedByReason,
      applied: counterexamples.applied,
      unobservable: counterexamples.unobservable,
      worktrees: counterexamples.applied.flatMap((record) => (record.worktreeRecord === null ? [] : [record.worktreeRecord])),
      revisions: counterexamples.ledger.revisions,
      verdict: counterexamples.ledger.verdict,
      caveat: counterexamples.caveat,
    };
  }
  if (properties !== null) documents['GENERATED-PROPERTIES.json'] = properties;
  // R7's serving packet is Markdown because a human reads it to decide; R8's
  // spec is published both ways, with the Markdown rendered from the sidecar
  // beside it so the two cannot disagree. The candidate is the form the final
  // comparison against the answer key consumes.
  if (serving !== null) documents['R7-SERVING.md'] = renderServingMarkdown(serving);
  publishWhenPresent(documents, 'SECURITY-LANE.json', securityLane);
  publishWhenPresent(documents, 'R7-SECURITY-LANE.md', securityLane === null ? null : renderSecurityLaneMarkdown(securityLane));
  publishWhenPresent(documents, 'ADJUDICATION-CANDIDATES.json', adjudication);
  publishWhenPresent(documents, 'R7-ADJUDICATION.md', adjudication === null ? null : renderAdjudicationMarkdown(adjudication));
  if (originSpec !== null) {
    documents['ORIGIN-LONG-SPEC.json'] = originSpec;
    documents['ORIGIN-LONG-SPEC.md'] = renderOriginSpec(originSpec);
    documents['ORIGIN-SPEC-CANDIDATE.json'] = buildOriginSpecCandidate(originSpec);
  }
  if (profile !== null) documents['CAPABILITY-PROFILE.json'] = profile;

  publishDocuments(out, documents);

  return {
    scope,
    boundary,
    eligibility,
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
    serving,
    securityLane,
    adjudication,
    originSpec,
    profile,
    attempts,
    report,
    stagesRun,
  };
}
