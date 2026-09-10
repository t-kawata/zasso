// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
/**
 * R3.5 — the claim ledger, and the evidence independence it is built to refuse.
 *
 * The ledger's job is not to collect support. It is to detect circular
 * corroboration: a unit test, a comment and a README derived from one design
 * decision are not three pieces of evidence, and counting them as three is the
 * reverse-rotation form of a false green (F11). Evidence is therefore graphed
 * by the observable relations that join it, and the number a claim reports is
 * the number of independent components — never the number of evidence records.
 *
 * The ledger holds two collections of different types, and the separation is
 * enforced rather than documented. `claims` carry one of the four provenance
 * values and state what would falsify them. `candidates` are R3's stage-two
 * output: they carry `classification: "candidate"` and
 * `requires_human_approval`, and `assertDecidedFact` refuses one wherever a
 * settled fact is required. A candidate read as a decided contract is a silent
 * failure — it reads as success — which is why the type boundary exists.
 *
 * The three claim families below are read from the population's source text.
 * That reading is deliberately narrow: it finds a `crate::` reference, an
 * assertion and an error return, and it classifies them exactly as it always
 * has, because they are the ledger's own vocabulary and not R3's findings. R3's
 * findings live in `facts` and `candidates`.
 *
 * This module also owns the vocabulary for reading Rust source text, because
 * R0.5 and R3.5 both read it and only one of them may own it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { enumerateSourceFacts, generateCandidates, unavailableChannels } from './semantics.mjs';
import { compareText } from './holdout-ledger.mjs';
import { listArtefacts, renderCappedList } from './analysis-tech.mjs';
import {
  buildEvidence,
  computeIndependence,
  countIndependentSupport,
} from './evidence-independence.mjs';
import {
  INDEPENDENCE_POLICY,
  LINEAGE_RELATIONS,
  PROVENANCE_CLASSES,
} from './provenance.mjs';

export {
  INDEPENDENCE_POLICY,
  LINEAGE_RELATIONS,
  PROVENANCE_CLASSES,
  buildEvidence,
  countIndependentSupport,
};

/** The project's own source lives here. */
export const SOURCE_DIRECTORY = 'src';

/** The language the spike reads. P22-4 decides the toolchain; this is only a file filter. */
export const SOURCE_EXTENSION = '.rs';

/** A `crate::` reference from one top-level module into another. */
const CRATE_REFERENCE = /crate::([a-z_][a-z0-9_]*)/;

/** An assertion that states a condition without stating whether it is a contract. */
const ASSERTION = /\b(?:debug_)?assert(?:_eq|_ne)?!\s*\(/;

/** An error path that may or may not be a contracted failure. */
const ERROR_PATH = /\bErr\s*\(/;

/** The attribute whose presence makes the shipping composition a build-time question. */
const CFG_ATTRIBUTE = /#\[\s*cfg\(/;

/** `src/api/login.rs` → `src/api`. */
export function directoryOf(relativePath) {
  return relativePath.slice(0, relativePath.lastIndexOf('/'));
}

/** `src/api/login.rs` → `login`. */
export function stemOf(relativePath) {
  const base = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return base.slice(0, base.length - SOURCE_EXTENSION.length);
}

/** Every top-level module a piece of source text names through a `crate::` reference. */
export function crateReferencesIn(sourceText) {
  const references = new Set();
  for (const match of sourceText.matchAll(new RegExp(CRATE_REFERENCE, 'g'))) {
    references.add(match[1]);
  }
  return [...references];
}

/**
 * The partition member a top-level module name resolves to: `src/<name>` when it
 * is a directory, `src/<name>.rs` when it is a file, and nothing when the tree
 * holds neither.
 */
export function resolveSourceMember(root, moduleName) {
  const asDirectory = `${SOURCE_DIRECTORY}/${moduleName}`;
  if (existsSync(join(root, asDirectory))) return asDirectory;
  const asFile = `${asDirectory}${SOURCE_EXTENSION}`;
  if (existsSync(join(root, asFile))) return asFile;
  return null;
}

/**
 * The directory a resolved partition member belongs to.
 *
 * A member that is already a directory is its own owner. Reading it as a path
 * and stripping its last segment would place `src/api` in `src`, and a reference
 * from `src/api` to `src/api` would then be reported as a boundary crossing —
 * a decision card asking whether the module may call itself.
 */
export function owningDirectoryOf(member) {
  return member.endsWith(SOURCE_EXTENSION) ? directoryOf(member) : member;
}

/**
 * The lines a `#[cfg(...)]` attribute governs, 1-indexed.
 *
 * The gate opens at the attribute and closes when brace depth returns to where
 * the attribute sat. An attribute on a single-line item closes immediately, and
 * the item's own line is still gated.
 */
function findCfgGatedLines(lines) {
  const gated = new Set();
  let depth = 0;
  let gateDepth = null;
  let gateStart = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    const depthBefore = depth;
    depth += opens - closes;

    if (gateDepth === null && CFG_ATTRIBUTE.test(line)) {
      gateDepth = depthBefore;
      gateStart = lineNumber;
      gated.add(lineNumber);
      // An attribute on a single-line item opens and closes on its own line:
      // braces were seen and the depth is already back where it started.
      if (opens > 0 && depth <= gateDepth) gateDepth = null;
      continue;
    }

    if (gateDepth !== null) {
      if (lineNumber > gateStart && depth <= gateDepth) {
        // The gated item closed before this line; the gate does not cover it.
        gateDepth = null;
        continue;
      }
      gated.add(lineNumber);
    }
  }
  return gated;
}

/** A claim id that is stable across runs and unique within a ledger. */
function buildClaimId(seed, kind, lineNumber) {
  return `clm-${stemOf(seed)}-${kind}-${lineNumber}`;
}

/** The anchor an evidence record points at, written the way a reader cites it. */
export function formatAnchor(sourceFile, lineNumber) {
  return `${sourceFile}:${lineNumber}`;
}

/**
 * The anchor of a claim's first evidence record, or the fact that none was
 * recorded. A card cites the claim it is about, and an absent anchor must be
 * visible rather than rendered as an empty string.
 */
export function formatClaimAnchor(claim) {
  const span = claim.evidence?.[0]?.source_span;
  return span ? formatAnchor(span.file, span.line) : '(unrecorded)';
}

/** A boundary crossing read out of a `crate::` reference. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildBoundaryClaim({ seed, lineNumber, moduleName, providerMember, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  const provider = providerMember ?? `${SOURCE_DIRECTORY}/${moduleName}`;
  return {
    claim_id: buildClaimId(seed, 'boundary_crossing', lineNumber),
    subjectKind: 'boundary_crossing',
    claim_type: gated ? 'unresolved' : 'observed',
    scope: directoryOf(seed),
    provider,
    statement: `${directoryOf(seed)} consumes ${provider} through the reference at ${anchor}`,
    evidence: [buildEvidence({ file: seed, line: lineNumber }, 'impl')],
    basis: [],
    counterevidence:
      gated
        ? ['the reference sits behind a configuration gate, so whether it ships is not readable from the text']
        : [],
    falsification: `remove the reference at ${anchor} and observe whether the consumer still resolves; `
      + 'the crossing is a contract only if a declared port carries it',
    grill_question: gated
      ? `Which configuration does the crossing at ${anchor} hold in, and is the reference part of the shipped interface?`
      : '',
    normative_decision_id: null,
  };
}

/** A condition read out of an assertion. Inferred, because an assert proves only that a check exists. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildInvariantClaim({ seed, lineNumber, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  return {
    claim_id: buildClaimId(seed, 'invariant', lineNumber),
    subjectKind: 'invariant',
    claim_type: gated ? 'unresolved' : 'inferred',
    scope: directoryOf(seed),
    provider: null,
    statement: `the condition asserted at ${anchor} holds`,
    evidence: [buildEvidence({ file: seed, line: lineNumber }, 'impl')],
    basis: gated
      ? []
      : [`the assertion at ${anchor} exists in the text; that it is an invariant rather than a defensive check is an inference from that text`],
    counterevidence: ['the same shape appears in defensive checks and temporary workarounds, which are not contracts'],
    falsification: `mutate the asserted condition at ${anchor} and observe whether any test fails`,
    grill_question: gated
      ? `Which configuration does the condition at ${anchor} hold in? The assertion sits behind a #[cfg] gate, so what ships cannot be read from the text alone.`
      : '',
    normative_decision_id: null,
  };
}

/** A failure path read out of an error return. Inferred, for the same reason. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildFailureClaim({ seed, lineNumber, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  return {
    claim_id: buildClaimId(seed, 'failure_contract', lineNumber),
    subjectKind: 'failure_contract',
    claim_type: gated ? 'unresolved' : 'inferred',
    scope: directoryOf(seed),
    provider: null,
    statement: `the failure at ${anchor} is a contracted outcome the caller may rely on`,
    evidence: [buildEvidence({ file: seed, line: lineNumber }, 'impl')],
    basis: gated
      ? []
      : [`the error return at ${anchor} exists in the text; that a caller may rely on it is an inference from that text`],
    counterevidence: ['an error path may be a defensive check or a temporary workaround rather than a published failure mode'],
    falsification: `remove the error path at ${anchor} and observe whether any test fails`,
    grill_question: gated
      ? `Which configuration does the failure at ${anchor} hold in, and may a caller rely on it? The path sits behind a #[cfg] gate.`
      : '',
    normative_decision_id: null,
  };
}

/**
 * Confirm a claim's provenance class, and refuse the ones its class requires.
 *
 * A class is not a label a claim may carry without its warrant: `observed`
 * without evidence, `inferred` without a basis, `unresolved` without the
 * question it hands over, or `normative` without a recorded decision are all
 * refusals rather than defaults. A claim stating no falsification condition is
 * refused for the same reason — a proposition nothing could reject is not a
 * proposition about the code.
 */
export function classifyClaim(claim) {
  if (!PROVENANCE_CLASSES.includes(claim.claim_type)) {
    throw new Error(
      `"${claim.claim_type}" is not one of the four provenance values (${PROVENANCE_CLASSES.join(', ')}): `
      + `claim ${claim.claim_id}`,
    );
  }
  if (claim.claim_type === 'observed' && (claim.evidence ?? []).length === 0) {
    throw new Error(`claim ${claim.claim_id} is observed but carries no evidence: observed means read from the text`);
  }
  if (claim.claim_type === 'inferred' && (claim.basis ?? []).length === 0) {
    throw new Error(`claim ${claim.claim_id} is inferred but states no basis: an inference must say what it infers from`);
  }
  if (claim.claim_type === 'unresolved' && !(claim.grill_question ?? '').length) {
    throw new Error(`claim ${claim.claim_id} is unresolved but carries no grill_question: the human grill must be asked something`);
  }
  if (claim.claim_type === 'normative' && !claim.normative_decision_id) {
    throw new Error(
      `claim ${claim.claim_id} is normative but carries no normative_decision_id: a norm without a recorded `
      + 'decision is an invented authority',
    );
  }
  if (!(claim.falsification ?? '').length) {
    throw new Error(
      `claim ${claim.claim_id} states no falsification condition: a proposition nothing could reject is an `
      + 'assertion rather than a claim about the code',
    );
  }
  return claim.claim_type;
}

/** The files whose source text the three claim families are read from. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function claimFamiliesIn(root, { seeds, excludedPaths }) {
  const files = Array.isArray(seeds) && seeds.length > 0
    ? [...seeds]
    : listArtefacts(root)
      .filter((artefact) => !artefact.exclusion && !excludedPaths.includes(artefact.path))
      .map((artefact) => artefact.path)
      .filter((path) => path.endsWith(SOURCE_EXTENSION))
      .sort(compareText);

  const claims = [];
  for (const seed of files) {
    if (!seed.endsWith(SOURCE_EXTENSION)) continue;
    const lines = readFileSync(join(root, seed), 'utf8').split('\n');
    const gated = findCfgGatedLines(lines);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;
      const isGated = gated.has(lineNumber);

      for (const moduleName of crateReferencesIn(line)) {
        const member = resolveSourceMember(root, moduleName);
        if (!member) continue;
        // A reference into the file's own module is not a crossing, and a
        // reference out of the crate is not a member of this population.
        if (owningDirectoryOf(member) === directoryOf(seed)) continue;
        claims.push(buildBoundaryClaim({ seed, lineNumber, moduleName, providerMember: member, gated: isGated }));
      }
      if (ASSERTION.test(line)) claims.push(buildInvariantClaim({ seed, lineNumber, gated: isGated }));
      if (ERROR_PATH.test(line)) claims.push(buildFailureClaim({ seed, lineNumber, gated: isGated }));
    }
  }
  return claims;
}

/**
 * The ledger one population yields.
 *
 * Zero claims is a lawful observation about a population, not a failure: a tree
 * that crosses no boundary and asserts nothing has nothing to classify, and
 * saying so is more honest than raising an error over it.
 *
 * Each claim's evidence is folded before its support is reported, so the number
 * a reader sees is the number of independent components and never the number of
 * records. The fold's policy travels with the ledger.
 */
export function buildClaimLedger(source) {
  if (source === null || source === undefined || typeof source !== 'object') {
    throw new Error('buildClaimLedger needs the population it is to build a ledger for; it was given no population');
  }
  const { root, seeds = null, excludedPaths = [], history = null } = source;
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('a claim ledger must name the root of the population it was built over');
  }

  const claims = claimFamiliesIn(root, { seeds, excludedPaths });
  for (const claim of claims) classifyClaim(claim);

  const foldedByClaim = claims.map((claim) => {
    const folded = computeIndependence(claim.evidence, { root, history });
    return {
      ...claim,
      evidence: folded.evidence,
      support: folded.evidence.map((item) => item.evidence_id).slice(0, folded.independentCount),
      independence_policy: folded.independence_policy,
      unavailable_channels: unavailableChannels(),
    };
  });

  // R3's stage one and stage two. The stage-one facts are enumerated only over
  // the seeds the caller named, so a sliced run enumerates a sliced population.
  const stageOne = enumerateSourceFacts({ root, seeds, excludedPaths });
  const stageTwo = generateCandidates(stageOne);

  const byClass = Object.fromEntries(PROVENANCE_CLASSES.map((name) => [name, 0]));
  for (const claim of foldedByClaim) byClass[claim.claim_type] += 1;

  // The fold that matters for F11 runs over the whole ledger, not over each
  // claim's own records. A claim's `support` answers "how many independent
  // things support this claim"; this answers "how many independent things does
  // the ledger hold at all", and only the second can see that a claim's file and
  // another claim's file were introduced by one commit. Folding per claim alone
  // would leave the defence idle on exactly the corpus it exists for.
  const everyRecord = foldedByClaim.flatMap((claim) => claim.evidence);
  const ledgerFold = computeIndependence(everyRecord, { root, history });

  return {
    root,
    claims: foldedByClaim,
    candidates: stageTwo.candidates,
    // The facts themselves stay out of the ledger. They are stage one's raw
    // material — thirty thousand rows on the subject corpus — and the ledger is
    // the authority for *propositions*, which are the claims and the candidates.
    // What a reader needs from stage one is that it ran and how much it found,
    // and a count by kind says both without the rows. Embedding them would add
    // tens of megabytes to a file every later stage loads.
    factCounts: stageTwo.facts.reduce((counts, fact) => {
      counts[fact.kind] = (counts[fact.kind] ?? 0) + 1;
      return counts;
    }, {}),
    factCount: stageTwo.facts.length,
    coverage: stageTwo.coverage,
    limitations: stageTwo.limitations,
    unavailableChannels: unavailableChannels(),
    byClass,
    independence: {
      rawEvidenceCount: everyRecord.length,
      independentCount: ledgerFold.independentCount,
      foldedAway: everyRecord.length - ledgerFold.independentCount,
      assessments: ledgerFold.evidence.reduce((counts, item) => {
        counts[item.independence_assessment] = (counts[item.independence_assessment] ?? 0) + 1;
        return counts;
      }, {}),
      relations: ledgerFold.policyInputs.strengths,
      historyConsulted: ledgerFold.policyInputs.historyConsulted,
      policy: ledgerFold.independence_policy,
    },
    unresolvedRate: foldedByClaim.length === 0 ? 0 : byClass.unresolved / foldedByClaim.length,
    note: foldedByClaim.length === 0 ? 'nothing to classify' : '',
    independence_policy: INDEPENDENCE_POLICY,
  };
}

/**
 * The claim output a stage comparison consumes.
 *
 * The unobserved entry is not decoration. The subject tree carries no `@verifies`
 * comment at all, so no claim the analysis produces can be anchored to an
 * annotated contract id; saying that plainly keeps the comparison from reading as
 * agreement when it has in fact looked at nothing.
 */
export function buildClaimCandidate(ledger) {
  return {
    stage: 'r3',
    corpus: { language: 'rust' },
    entries: [
      ...ledger.claims.map((claim) => ({
        name: claim.claim_id,
        value: null,
        evidence_mode: claim.evidence[0]?.evidence_mode ?? 'source_static',
      })),
      ...(ledger.candidates ?? []).map((candidate) => ({
        name: candidate.candidate_id,
        value: null,
        evidence_mode: candidate.evidence_mode ?? 'source_static',
      })),
    ],
    unobserved: [
      {
        region: 'the contract annotations under tests/',
        stoppedAtPhase: 'R3.5',
        reason:
          'PX-203 removed every @verifies comment from the subject, so no claim can be anchored to an '
          + 'annotated contract id yet; the ledger re-derives the anchors only once R5 and R6 run',
      },
    ],
  };
}

/**
 * The ledger as the Markdown a human or an AI reads before deciding anything.
 *
 * The per-claim and per-candidate lists are capped, and the report says how many
 * it did not print. A report that listed every one of four thousand claims would
 * be three megabytes of bullets, which is not something a reader reads — and a
 * silent cap would be worse still, because it would read as the whole of the
 * evidence. The JSON beside this report carries every item.
 */
export function renderClaimLedger(ledger) {
  const lines = [
    '## Claim ledger',
    '',
    `Claims: ${ledger.claims.length} · candidates: ${ledger.candidates?.length ?? 0}`,
    '',
    '| class | count | what it means |',
    '|---|---|---|',
    `| observed | ${ledger.byClass.observed} | read from the source text or its syntax |`,
    `| inferred | ${ledger.byClass.inferred} | an inference the source text supports but does not state |`,
    `| normative | ${ledger.byClass.normative} | settled only by a recorded human decision |`,
    `| unresolved | ${ledger.byClass.unresolved} | not decidable here; handed to the human grill |`,
    '',
    '### Evidence independence',
    '',
    `${ledger.independence.rawEvidenceCount} evidence record(s) fold to `
      + `**${ledger.independence.independentCount} independent** component(s). `
      + (ledger.independence.foldedAway === 0
        ? 'Nothing folded, so no two records were found to share a derivation.'
        : `${ledger.independence.foldedAway} record(s) share a derivation with another record and therefore count `
          + 'once — the difference between the number of records and the number of things they support.'),
    '',
    `Relations found: ${Object.keys(ledger.independence.relations).length === 0
      ? 'none'
      : Object.entries(ledger.independence.relations)
        .map(([relation, strength]) => `\`${relation}\` (${strength})`)
        .join(', ')}.`,
    `Commit channel consulted: ${ledger.independence.historyConsulted ? 'yes' : 'no'}.`,
    `Assessments: ${Object.entries(ledger.independence.assessments)
      .map(([name, count]) => `${name} ${count}`)
      .join(', ')}. An \`unknown\` assessment means no consulted channel could settle the question, which is a `
      + 'different statement from "these are independent" and the one the design requires.',
    '',
  ];

  if (ledger.claims.length === 0) {
    lines.push('Nothing to classify.', '');
    return lines.join('\n');
  }

  lines.push(`Unresolved rate: ${ledger.unresolvedRate}`, '', '### Claims', '');
  lines.push(...renderCappedList(ledger.claims, (claim) => {
    const anchor = claim.evidence[0]?.source_span;
    const entry = [
      `- \`${claim.claim_id}\` (${claim.claim_type}, ${claim.subjectKind}) — ${claim.statement}`,
      `  - evidence: \`${anchor.file}:${anchor.line}\` (${claim.evidence[0].evidence_mode})`,
      `  - independent support: ${claim.support.length} (records: ${claim.evidence.length})`,
      `  - falsified by: ${claim.falsification}`,
    ];
    if (claim.claim_type === 'unresolved') {
      entry.push(`  - to the grill: ${claim.grill_question}`);
    }
    return entry.join('\n');
  }));

  if ((ledger.candidates ?? []).length > 0) {
    lines.push('', '### Candidates — observed, classification undecided', '');
    lines.push(...renderCappedList(ledger.candidates, (candidate) => {
      if (candidate.kind === 'state_machine') {
        return [
          `- \`${candidate.carrier}\` (state_machine candidate, ${candidate.claim_type})`,
          `  - states seen: ${candidate.states_seen.length === 0 ? '(none declared in this file)' : candidate.states_seen.map((state) => `\`${state}\``).join(', ')}`,
          `  - transitions seen: ${candidate.transitions_seen.length}`,
          `  - declared gaps: ${candidate.missing.length}`
            + (candidate.missing.length === 0
              ? ''
              : ` — ${candidate.missing.map((gap) => `\`${gap.reason}\``).join(', ')}`),
        ].join('\n');
      }
      const span = candidate.source_span;
      const entry = [
        `- \`${candidate.candidate_id}\` (${candidate.kind}, ${candidate.claim_type})`,
        `  - at: \`${span.file}:${span.line}\``,
        `  - undecided: ${candidate.undecided}`,
      ];
      if (candidate.grill_question) entry.push(`  - to the grill: ${candidate.grill_question}`);
      return entry.join('\n');
    }));
  }

  lines.push('', `Independence policy: ${ledger.independence_policy}`, '');
  lines.push('### Observation channels this run did not use', '');
  for (const channel of ledger.unavailableChannels) {
    lines.push(`- \`${channel.channel}\` — ${channel.reason}`);
  }
  lines.push('');
  return lines.join('\n');
}
