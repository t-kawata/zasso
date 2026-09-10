// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Reconciliation: a reverse-rotation stage's output against the answer key.
 *
 * Comparing an output against a known-correct answer yields a list of named
 * disagreements — never a score, a ratio presented as a grade, or a pass/fail
 * verdict. Whether reverse engineering succeeded is a judgement a human makes
 * after several loop rounds, and a machine that emits a boolean success verdict
 * is wrong by construction. The returned shape has no field that could carry
 * one, and a test asserts that by inspecting the keys.
 *
 * The comparison is by KIND, not by count. Four kinds are distinguished, and
 * the fourth is not a disagreement at all:
 *
 *   missing_from_analysis  the answer key has it and the analysis did not
 *   extra_in_analysis      the analysis produced it and the answer key does not
 *   divergent              both have it, differently
 *   unobserved             the analysis never looked — not agreement, not
 *                          disagreement, and summing it into either destroys
 *                          the only signal that matters
 *
 * Every disagreement also carries the analysis mode that produced it, so a
 * finding from a corpus the toolchain could only read syntactically is
 * distinguishable from one it could resolve semantically.
 *
 * The stage-to-oracle mapping is a declared table. Adding a stage is adding a
 * row.
 */
import { existsSync, readFileSync } from 'node:fs';

import { compareText } from './holdout-ledger.mjs';
import { loadOracleBundle } from './oracle-bundle.mjs';

/**
 * What each stage's output is compared against, and in what unit.
 *
 * The unit is a first-class part of the table because a comparison that does
 * not name its unit cannot be argued with: 146 tickets and 146 strings are not
 * the same claim.
 */
export const STAGE_ORACLE_STAGES = Object.freeze([
  Object.freeze({ stage: 'r1', artefact: 'dirsTree', unit: 'directory', question: 'does the reconstructed structure match the partition?' }),
  Object.freeze({ stage: 'r2', artefact: 'dirsTree', unit: 'directory', question: 'does the reconstructed module boundary match?' }),
  Object.freeze({ stage: 'r3', artefact: 'verifies', unit: 'contract-id', question: 'does a contract candidate match an annotated contract?' }),
  Object.freeze({ stage: 'r5', artefact: 'omissions', unit: 'omission-file', question: 'does a recorded gap match an omission file?' }),
  Object.freeze({ stage: 'r6', artefact: 'ticketMarkers', unit: 'test-name', question: 'does an absent-Red claim match a ticketed test?' }),
  Object.freeze({ stage: 'r8', artefact: 'rfcRoot', unit: 'heading', question: 'does a claim match the canonical RFC?' }),
  Object.freeze({ stage: 'partition', artefact: 'dirsTree', unit: 'directory', question: 'P22-11: does the partition match?' }),
  Object.freeze({ stage: 'grounding', artefact: 'graph', unit: 'node-id', question: 'P22-14: does grounding match the 113-node graph?' }),
  Object.freeze({ stage: 'headers', artefact: 'designHeaders', unit: 'test-file', question: 'P22-15: does a generated header land on a file that has one?' }),
  Object.freeze({ stage: 'mapping', artefact: 'tickets', unit: 'ticket-key', question: 'P22-16: does a test-to-ticket mapping match the 146 tickets?' }),
]);

/** The kind identifiers a disagreement may carry. The keys are the vocabulary. */
export const DISAGREEMENT_KINDS = Object.freeze({
  missingFromAnalysis: 'missing_from_analysis',
  extraInAnalysis: 'extra_in_analysis',
  divergent: 'divergent',
  unobserved: 'unobserved',
});

/** Plain English for each kind, so a report can be read without a decoder. */
export const DISAGREEMENT_KIND_MEANINGS = Object.freeze({
  missing_from_analysis: 'the answer key has it and the analysis did not produce it',
  extra_in_analysis: 'the analysis produced it and the answer key does not have it',
  divergent: 'both have it, and the two differ',
  unobserved: 'the analysis never looked at this region, so it neither agrees nor disagrees',
});

/**
 * The evidence modes, ranked low to high. A corpus the toolchain cannot resolve
 * semantically produces `source_static` where a resolved one produces
 * `build_semantic`, so "lower" is well defined rather than a figure of speech.
 */
export const ANALYSIS_MODE_RANK = Object.freeze({
  unobserved: 0,
  source_static: 1,
  build_semantic: 2,
  runtime_dynamic: 3,
});

/** No known differences: used when a stage is compared before the delta is applied. */
export const NO_KNOWN_DELTA = Object.freeze({ measuredNotAssumed: false, expectedDifferences: Object.freeze([]) });

/**
 * The analysis mode a corpus is measured in.
 *
 * A language the toolchain resolves semantically yields `build_semantic`; one
 * it can only read syntactically yields `source_static`; one it cannot read at
 * all was never observed, and saying so is the only honest answer.
 */
export function analysisModeFor({ corpus = { language: 'unknown' }, stack = { languages: [] } } = {}) {
  const language = corpus?.language ?? 'unknown';
  if (language === 'unknown') return 'unobserved';
  if ((stack.languages ?? []).includes(language)) return 'build_semantic';
  return 'source_static';
}

function byName(left, right) {
  return compareText(left.name, right.name);
}

/** The member set a stage is compared against, drawn from the frozen bundle. */
export function extractOracleSet(bundle, unit) {
  switch (unit) {
    case 'directory':
      return bundle.artefacts.dirsTree.directories;
    case 'contract-id':
      return bundle.artefacts.verifies.contractIds;
    case 'omission-file':
      return bundle.artefacts.omissions.files;
    case 'test-name':
      return [...new Set([...bundle.artefacts.ticketMarkers.testBasenames, ...bundle.artefacts.tickets.verifySpecTests])].sort();
    case 'heading':
      return bundle.artefacts.rfcRoot.headings;
    case 'node-id':
      return bundle.artefacts.graph.nodeIds;
    case 'test-file':
      return bundle.artefacts.designHeaders.files;
    case 'ticket-key':
      return bundle.artefacts.tickets.ticketKeys;
    default:
      throw new Error(`no oracle set is defined for unit "${unit}"`);
  }
}

/**
 * What each named member of the oracle set *says*, where the answer key records
 * it. A unit with no values can only be compared by membership, and a stage
 * compared against it can therefore never diverge — only be missing or extra.
 */
export function extractOracleValues(bundle, unit) {
  switch (unit) {
    case 'node-id':
      return bundle.artefacts.graph.nodeTitles ?? {};
    case 'ticket-key':
      return bundle.artefacts.tickets.ticketTitles ?? {};
    default:
      return {};
  }
}

/**
 * The candidate's entries as `{name, value}` pairs, with `value` null when the
 * candidate named a member without saying anything about it.
 *
 * A document whose `entries` is not a list is refused. Reading a string as a
 * character list would report one disagreement per letter, each naming nothing.
 */
function normaliseEntries(candidate) {
  const raw = candidate.entries ?? [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `the candidate document's "entries" must be a list of names or {name, value} objects, but it is a ${typeof raw}`,
    );
  }
  return raw.map((entry, index) => {
    if (typeof entry === 'string') return { name: entry, value: null };
    if (entry !== null && typeof entry === 'object' && typeof entry.name === 'string') {
      return { name: entry.name, value: entry.value ?? null };
    }
    throw new Error(`entry ${index} must be a name or an object carrying a string "name"`);
  });
}

/** Validate an unobserved entry, so a missing reason cannot be rendered as silence. */
function normaliseUnobserved(entry, index) {
  for (const field of ['region', 'stoppedAtPhase', 'reason']) {
    if (typeof entry?.[field] !== 'string' || entry[field].length === 0) {
      throw new Error(`unobserved entry ${index} has no ${field}: an unobserved region must name what was not looked at, when it stopped and why`);
    }
  }
  return {
    kind: DISAGREEMENT_KINDS.unobserved,
    region: entry.region,
    stoppedAtPhase: entry.stoppedAtPhase,
    reason: entry.reason,
  };
}

/**
 * Compare one stage's output against the frozen answer key.
 *
 * Refuses to run against an oracle whose digest no longer matches what was
 * frozen: a comparison against a changed answer key measures nothing.
 *
 * @param {object} params
 * @param {string} params.stage - a stage declared in STAGE_ORACLE_STAGES
 * @param {string} params.projectRoot - project holding the frozen bundle
 * @param {string} params.candidatePath - the stage's output document
 * @param {object} [params.knownDelta] - expected differences, so they are labelled rather than found
 * @param {object} [params.stack] - the languages the chosen toolchain resolves semantically
 */
export function reconcile({ stage, projectRoot, candidatePath, knownDelta = NO_KNOWN_DELTA, stack = { languages: [] } }) {
  const row = STAGE_ORACLE_STAGES.find((candidateRow) => candidateRow.stage === stage);
  if (!row) {
    throw new Error(
      `no stage is declared as "${stage}" — the declared stages are: ${STAGE_ORACLE_STAGES.map((entry) => entry.stage).join(', ')}`,
    );
  }
  if (!existsSync(candidatePath)) {
    throw new Error(`stage "${stage}" has no output to compare: ${candidatePath} does not exist`);
  }

  const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
  if (candidate.stage && candidate.stage !== stage) {
    throw new Error(`the candidate document declares stage "${candidate.stage}" but the comparison asked for "${stage}"`);
  }

  const loaded = loadOracleBundle({ projectRoot });
  if (loaded.drifted.length > 0) {
    throw new Error(
      `the oracle has changed since it was frozen (${loaded.drifted.map((entry) => `${entry.name}: ${entry.frozen} -> ${entry.observed}`).join('; ')}). `
      + 'A comparison against a changed oracle is refused, not run: it would measure nothing.',
    );
  }

  const oracleSet = new Set(extractOracleSet(loaded.bundle, row.unit));
  const analysisMode = analysisModeFor({ corpus: candidate.corpus, stack });

  const expectedByName = new Map((knownDelta.expectedDifferences ?? []).map((entry) => [entry.name, entry]));
  const expectedByOracleName = new Map(
    (knownDelta.expectedDifferences ?? []).filter((entry) => entry.oracleName).map((entry) => [entry.oracleName, entry]),
  );

  const oracleValues = extractOracleValues(loaded.bundle, row.unit);
  const disagreements = [];
  const expected = [];
  const recorded = new Set();
  const entriesByName = new Map();
  for (const entry of normaliseEntries(candidate)) {
    if (!entriesByName.has(entry.name)) entriesByName.set(entry.name, entry.value);
  }

  const recordExpected = (entry) => {
    if (recorded.has(entry.name)) return;
    recorded.add(entry.name);
    expected.push({ name: entry.name, oracleName: entry.oracleName ?? null, kind: entry.kind, evidence: entry.evidence, analysisMode });
  };

  for (const [name, value] of entriesByName) {
    const known = expectedByName.get(name);
    if (known) {
      recordExpected(known);
      continue;
    }
    if (!oracleSet.has(name)) {
      disagreements.push({
        kind: DISAGREEMENT_KINDS.extraInAnalysis,
        name,
        analysisMode,
        evidence: 'present in the analysis output and in no answer-key member',
      });
      continue;
    }
    const oracleValue = oracleValues[name] ?? null;
    if (value !== null && oracleValue !== null && value !== oracleValue) {
      disagreements.push({
        kind: DISAGREEMENT_KINDS.divergent,
        name,
        analysisMode,
        evidence: `the answer key records ${JSON.stringify(oracleValue)} and the analysis produced ${JSON.stringify(value)}`,
      });
    }
  }

  for (const name of oracleSet) {
    if (entriesByName.has(name)) continue;
    const known = expectedByOracleName.get(name);
    if (known) {
      recordExpected(known);
      continue;
    }
    disagreements.push({
      kind: DISAGREEMENT_KINDS.missingFromAnalysis,
      name,
      analysisMode,
      evidence: 'present in the answer key and not produced by the analysis',
    });
  }

  const rawUnobserved = candidate.unobserved ?? [];
  if (!Array.isArray(rawUnobserved)) {
    throw new Error(
      `the candidate document's "unobserved" must be a list of {region, stoppedAtPhase, reason} entries, but it is a ${typeof rawUnobserved}`,
    );
  }
  const unobserved = rawUnobserved.map(normaliseUnobserved);

  const findings = [];
  if (disagreements.length === 0) {
    findings.push({
      id: 'zero-disagreement',
      message: 'Zero disagreements. Two independent derivations agreeing exactly is a contamination signal rather than accuracy: scrutinise the candidate before treating this as a result.',
    });
  }
  if (unobserved.length > 0) {
    findings.push({
      id: 'unobserved-regions',
      message: `${unobserved.length} region(s) were never observed. They are not agreement and not disagreement; only a human can decide what their absence costs this measurement.`,
    });
  }

  return {
    stage,
    candidatePath,
    oracleSha256: loaded.bundle.sha256,
    disagreements: disagreements.sort((left, right) => compareText(left.kind, right.kind) || byName(left, right)),
    unobserved: unobserved.sort((left, right) => compareText(left.region, right.region)),
    expected: expected.sort(byName),
    findings,
  };
}

/** Render a reconciliation as the Markdown a human reads. */
export function renderReconciliation(result) {
  const lines = ['## Reconciliation', '', `Stage: \`${result.stage}\``, `Candidate: \`${result.candidatePath}\``, ''];

  const byKind = {};
  for (const disagreement of result.disagreements) {
    (byKind[disagreement.kind] ??= []).push(disagreement);
  }

  const kindOrder = [DISAGREEMENT_KINDS.missingFromAnalysis, DISAGREEMENT_KINDS.extraInAnalysis, DISAGREEMENT_KINDS.divergent];
  lines.push(`### Disagreements (${result.disagreements.length})`, '');
  if (result.disagreements.length === 0) {
    lines.push('None.');
    lines.push('');
  }
  for (const kind of kindOrder) {
    const group = byKind[kind];
    if (!group || group.length === 0) continue;
    lines.push(`**${kind}** — ${DISAGREEMENT_KIND_MEANINGS[kind]} (${group.length})`);
    lines.push('');
    for (const disagreement of group) {
      lines.push(`- \`${disagreement.name}\` — ${disagreement.evidence} (analysis mode: ${disagreement.analysisMode})`);
    }
    lines.push('');
  }

  lines.push(`### Unobserved (${result.unobserved.length})`, '');
  if (result.unobserved.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    lines.push('These regions were never looked at. They are not agreement and not disagreement, and summing them into either would hide the only signal that matters.');
    lines.push('');
    for (const entry of result.unobserved) {
      lines.push(`- \`${entry.region}\` — stopped at ${entry.stoppedAtPhase}: ${entry.reason}`);
    }
    lines.push('');
  }

  lines.push(`### Expected differences (${result.expected.length})`, '');
  if (result.expected.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    lines.push('Known and intentional differences between the two trees, recorded so they are not classified as findings.');
    lines.push('');
    for (const entry of result.expected) {
      lines.push(`- \`${entry.name}\` (${entry.kind}) — ${entry.evidence}`);
    }
    lines.push('');
  }

  if (result.findings.length > 0) {
    lines.push('### Findings', '');
    for (const finding of result.findings) lines.push(`- ${finding.message}`);
    lines.push('');
  }

  return lines.join('\n');
}
