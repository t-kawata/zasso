// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
/**
 * R0.5 — the analysis scope of one vertical slice, and what running it cost.
 *
 * A slice is one use case's execution path, and 7.7.1 Pass 1 fixes boundaries
 * along it rather than sweeping any package horizontally. So a slice is named
 * by a word, resolved to the source files that carry that word, and then carried
 * outward by the `crate::` references those files make into other top-level
 * modules. Nothing here decides anything: which directories a slice crosses is
 * a fact about the text.
 *
 * The measurement lives beside the scope because R-7's instrument and R0.5's
 * subject are the same run. It is deliberately a separate function from the
 * report's rendering so the numbers can be asserted without the prose, and it
 * is a pure function of its inputs — including the decision time and the human
 * interventions, which the harness cannot observe and which are therefore
 * recorded by hand and passed in. A script that timed itself would be reporting
 * wall-clock as if it were judgement.
 *
 * The executor never reads the answer key. `runSpike` is handed a subject root
 * and nothing else, and a project holding no oracle tree at all must still
 * complete — that is what makes the number a measurement of the analysis rather
 * than of the analysis plus its answer.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEPENDENCY_DIRECTORY_NAMES,
  NEVER_WALKED_DIRECTORY_NAMES,
  compareText,
  digestTree,
  listTreeFiles,
} from './holdout-ledger.mjs';
import {
  SOURCE_DIRECTORY,
  SOURCE_EXTENSION,
  buildClaimLedger,
  crateReferencesIn,
  directoryOf,
  owningDirectoryOf,
  resolveSourceMember,
  stemOf,
} from './claim-ledger.mjs';
import { renderDecisionCards } from './packet.mjs';

/**
 * The walk the slice is resolved over. Dependencies are somebody else's source
 * and build output is not source at all, so neither can name a slice.
 */
export const SLICE_WALK_EXCLUSIONS = Object.freeze([
  ...NEVER_WALKED_DIRECTORY_NAMES,
  ...DEPENDENCY_DIRECTORY_NAMES,
]);

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
