// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
/**
 * R3.5 — the claim ledger, and the evidence independence it is built to refuse.
 *
 * The ledger's job is not to collect support. It is to detect circular
 * corroboration: a unit test, a comment and a README derived from one design
 * decision are not three pieces of evidence, and counting them as three is the
 * reverse-rotation form of a false green (F11). Evidence is therefore graphed
 * by the observable relations that join it, and the number of *independent*
 * components is what a claim reports — never the number of evidence records.
 *
 * Where the text cannot settle a question, the ledger says so rather than
 * guessing. A guard, an assert and an error path do not distinguish a
 * precondition from a defensive check (R3 says so explicitly), so a claim read
 * out of an assertion is `inferred` and not `observed`. Code behind a `#[cfg]`
 * gate has a composition that only a build reveals, so a claim inside one is
 * `unresolved` and carries the question it hands to the human grill. And a
 * `normative` claim without a recorded decision is refused outright: the chain
 * `claim_id → normative_decision_id → residual_id` is what makes a norm a norm,
 * and a machine that asserts one anyway has invented an authority.
 *
 * This module also owns the vocabulary for reading Rust source text, because
 * R0.5 and R3.5 both read it and only one of them may own it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The project's own source lives here. */
export const SOURCE_DIRECTORY = 'src';

/** The language the spike reads. P22-4 decides the toolchain; this is only a file filter. */
export const SOURCE_EXTENSION = '.rs';

/**
 * The four provenance values, in the design's order.
 *
 * Shared with P22-5 rather than repeated, so the spike and the real
 * implementation cannot drift into two vocabularies.
 */
export const PROVENANCE_CLASSES = Object.freeze(['observed', 'inferred', 'normative', 'unresolved']);

/**
 * The closed vocabulary of lineage relations, and how strongly each one joins.
 *
 * A strong relation collapses its endpoints into one vote. `similar_wording` is
 * deliberately weak: a resemblance between a comment and a test name is a
 * candidate for a human to review, never a machine's conclusion that two
 * artefacts share one origin.
 */
export const LINEAGE_RELATIONS = Object.freeze({
  same_syntax_span: 'strong',
  same_generator: 'strong',
  same_commit: 'strong',
  same_patch: 'strong',
  same_guard: 'strong',
  same_error_path: 'strong',
  similar_wording: 'weak',
});

/** The aggregation policy, stored beside the evidence so a human can later correct it. */
export const INDEPENDENCE_POLICY =
  'Evidence joined by a strong lineage relation forms one connected component and counts as one '
  + 'independent piece of support. similar_wording never collapses automatically. The number of '
  + 'components is what a claim reports; the number of evidence records is not.';

/** A `crate::` reference from one top-level module into another. */
const CRATE_REFERENCE = /crate::([a-z_][a-z0-9_]*)/;

/** An assertion that states a condition without stating whether it is a contract. */
const ASSERTION = /\b(?:debug_)?assert(?:_eq|_ne)?!\s*\(/;

/** An error path that may or may not be a contracted failure. */
const ERROR_PATH = /\bErr\s*\(/;

/** The attribute whose presence makes the shipping composition a build-time question. */
const CFG_ATTRIBUTE = /#\[\s*cfg\(/;

const STRONG = 'strong';

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

/** One evidence record, in the shape the design's schema names. */
function buildEvidence(seed, lineNumber, sourceKind) {
  return {
    evidence_id: `ev-${stemOf(seed)}-${lineNumber}`,
    source_kind: sourceKind,
    evidence_mode: 'source_static',
    source_span: { file: seed, line: lineNumber },
    lineage_edges: [],
  };
}

/** A boundary crossing read out of a `crate::` reference. */
function buildBoundaryClaim({ seed, lineNumber, moduleName, providerMember, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  const provider = providerMember ?? `${SOURCE_DIRECTORY}/${moduleName}`;
  return {
    claim_id: buildClaimId(seed, 'boundary_crossing', lineNumber),
    subjectKind: 'boundary_crossing',
    claim_type: gated ? 'unresolved' : 'observed',
    scope: directoryOf(seed),
    provider,
    proposition: `${directoryOf(seed)} consumes ${provider} through the reference at ${anchor}`,
    evidence: [buildEvidence(seed, lineNumber, 'impl')],
    basis: [],
    counterevidence:
      gated
        ? [`the reference sits behind a configuration gate, so whether it ships is not readable from the text`]
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
function buildInvariantClaim({ seed, lineNumber, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  return {
    claim_id: buildClaimId(seed, 'invariant', lineNumber),
    subjectKind: 'invariant',
    claim_type: gated ? 'unresolved' : 'inferred',
    scope: directoryOf(seed),
    provider: null,
    proposition: `the condition asserted at ${anchor} holds`,
    evidence: [buildEvidence(seed, lineNumber, 'impl')],
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
function buildFailureClaim({ seed, lineNumber, gated }) {
  const anchor = formatAnchor(seed, lineNumber);
  return {
    claim_id: buildClaimId(seed, 'failure_contract', lineNumber),
    subjectKind: 'failure_contract',
    claim_type: gated ? 'unresolved' : 'inferred',
    scope: directoryOf(seed),
    provider: null,
    proposition: `the failure at ${anchor} is a contracted outcome the caller may rely on`,
    evidence: [buildEvidence(seed, lineNumber, 'impl')],
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
 * refusals rather than defaults.
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
  return claim.claim_type;
}

/**
 * How many *independent* pieces of support a set of evidence records amounts to.
 *
 * Records joined by a strong lineage relation form one component; records joined
 * only by `similar_wording` do not. A record whose edge names an evidence id not
 * present is ignored rather than counted: an edge with no other end is not a
 * relation.
 */
export function countIndependentSupport(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return 0;

  const positionOf = new Map(evidence.map((item, position) => [item.evidence_id, position]));
  const parent = evidence.map((_, position) => position);

  const rootOf = (position) => {
    let current = position;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  const join = (left, right) => {
    const leftRoot = rootOf(left);
    const rightRoot = rootOf(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  for (const item of evidence) {
    for (const edge of item.lineage_edges ?? []) {
      if (LINEAGE_RELATIONS[edge.relation] !== STRONG) continue;
      const target = positionOf.get(edge.target);
      if (target === undefined) continue;
      join(positionOf.get(item.evidence_id), target);
    }
  }

  return new Set(evidence.map((_, position) => rootOf(position))).size;
}

/**
 * The ledger one vertical slice yields.
 *
 * Zero claims is a lawful observation about a slice, not a failure: a slice that
 * crosses no boundary and asserts nothing has nothing to classify, and saying so
 * is more honest than raising an error over it.
 */
export function buildClaimLedger(slice) {
  const claims = [];

  for (const seed of slice.seeds) {
    const lines = readFileSync(join(slice.root, seed), 'utf8').split('\n');
    const gated = findCfgGatedLines(lines);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;
      const isGated = gated.has(lineNumber);

      for (const moduleName of crateReferencesIn(line)) {
        const member = resolveSourceMember(slice.root, moduleName);
        if (!member) continue;
        // A reference into the file's own module is not a crossing, and a
        // reference out of the crate is not a member of this slice.
        if (owningDirectoryOf(member) === directoryOf(seed)) continue;
        claims.push(buildBoundaryClaim({ seed, lineNumber, moduleName, providerMember: member, gated: isGated }));
      }
      if (ASSERTION.test(line)) claims.push(buildInvariantClaim({ seed, lineNumber, gated: isGated }));
      if (ERROR_PATH.test(line)) claims.push(buildFailureClaim({ seed, lineNumber, gated: isGated }));
    }
  }

  for (const claim of claims) classifyClaim(claim);

  const byClass = Object.fromEntries(PROVENANCE_CLASSES.map((name) => [name, 0]));
  for (const claim of claims) byClass[claim.claim_type] += 1;

  const withSupport = claims.map((claim) => ({
    ...claim,
    support: claim.evidence.map((item) => item.evidence_id).slice(0, countIndependentSupport(claim.evidence)),
  }));

  return {
    claims: withSupport,
    byClass,
    unresolvedRate: claims.length === 0 ? 0 : byClass.unresolved / claims.length,
    note: claims.length === 0 ? 'nothing to classify' : '',
    independencePolicy: INDEPENDENCE_POLICY,
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
    entries: ledger.claims.map((claim) => ({ name: claim.claim_id, value: null })),
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

/** The ledger as the Markdown a human or an AI reads before deciding anything. */
export function renderClaimLedger(ledger) {
  const lines = [
    '## Claim ledger',
    '',
    `Claims: ${ledger.claims.length}`,
    '',
    '| class | count | what it means |',
    '|---|---|---|',
    `| observed | ${ledger.byClass.observed} | read from the source text or its syntax |`,
    `| inferred | ${ledger.byClass.inferred} | an inference the source text supports but does not state |`,
    `| normative | ${ledger.byClass.normative} | settled only by a recorded human decision |`,
    `| unresolved | ${ledger.byClass.unresolved} | not decidable here; handed to the human grill |`,
    '',
  ];

  if (ledger.claims.length === 0) {
    lines.push('Nothing to classify.', '');
    return lines.join('\n');
  }

  lines.push(`Unresolved rate: ${ledger.unresolvedRate}`, '', '### Claims', '');
  for (const claim of ledger.claims) {
    const anchor = claim.evidence[0]?.source_span;
    lines.push(
      `- \`${claim.claim_id}\` (${claim.claim_type}, ${claim.subjectKind}) — ${claim.proposition}`,
      `  - evidence: \`${anchor.file}:${anchor.line}\` (${claim.evidence[0].evidence_mode})`,
      `  - independent support: ${claim.support.length} (records: ${claim.evidence.length})`,
      `  - falsified by: ${claim.falsification}`,
    );
    if (claim.claim_type === 'unresolved') {
      lines.push(`  - to the grill: ${claim.grill_question}`);
    }
  }
  lines.push('', `Independence policy: ${ledger.independencePolicy}`, '');
  return lines.join('\n');
}
