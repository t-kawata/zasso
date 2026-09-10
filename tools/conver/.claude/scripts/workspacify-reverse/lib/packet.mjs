// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
/**
 * R7 — the decision packet: what a human is asked, and in what shape.
 *
 * A card's subject is one falsifiable proposition, never a file, a class or a
 * module (7.4.1). The reader answers a structured question whose options are
 * enumerated, each with the consequence of choosing it, so the answer is a
 * choice between named futures rather than prose. That is the whole point: the
 * machine supplies the material and the human supplies the judgement, and a card
 * that asks for an essay has moved the judgement back onto the machine without
 * saying so.
 *
 * Layering is the design's answer to decision fatigue. When the count would
 * exhaust a round, the design's two levels are used: a boundary claim is a
 * coarse decision and leads, and the contract level beneath it follows only when
 * that scope's boundary is settled. A boundary that is itself `unresolved`
 * withholds the whole contract level, because there is no point deciding what a
 * package does internally while it is unknown whether the package should exist.
 * What is withheld is always counted and always stated; silent truncation would
 * read as "everything was considered" when it was not.
 */
import { compareText } from './holdout-ledger.mjs';
import { formatClaimAnchor } from './claim-ledger.mjs';

/**
 * The subject kinds a card may name, from 7.4.1.
 *
 * The spike produces three of the five; the other two are declared because the
 * vocabulary is shared with P22-5 and a closed list that grows silently is not
 * a vocabulary.
 */
export const CARD_SUBJECT_KINDS = Object.freeze([
  'boundary_crossing',
  'state_transition',
  'invariant',
  'failure_contract',
  'data_lineage',
]);

/**
 * The count above which cards are layered rather than listed flat.
 *
 * R-7 states that the threshold is to be decided by measurement, so this value
 * is provisional by construction: the spike exists to produce the number that
 * calibrates it. It is named rather than inline so the one place to change it is
 * the one place that explains it.
 */
export const CARD_LAYERING_THRESHOLD = 12;

/** The answer every card offers, so a decision the machine cannot make is never lost. */
const HAND_TO_GRILL = 'hand it to the human grill as unresolved';

/** How many cards a claim kind's material supports before the grill. */
const OPTIONS_BY_SUBJECT_KIND = Object.freeze({
  boundary_crossing: Object.freeze([
    'record it as a boundary contract — the layering is intended',
    'record it as a residual — the crossing is an accident of history',
  ]),
  invariant: Object.freeze([
    'record it as an invariant of the module',
    'record it as a precondition of the public entry point',
    'record it as a defensive check with no contract — a residual',
  ]),
  failure_contract: Object.freeze([
    'record it as a failure contract — the error is part of the boundary contract',
    'record it as an implementation detail — callers may not rely on it',
  ]),
  state_transition: Object.freeze([
    'record it as a guarded transition with a named guard',
    'record it as an unguarded transition — a residual',
  ]),
  data_lineage: Object.freeze([
    'record it as a lineage the partition must carry',
    'record it as an incidental path — a residual',
  ]),
});

/** What choosing each option costs, one per option. */
const CONSEQUENCES_BY_SUBJECT_KIND = Object.freeze({
  boundary_crossing: Object.freeze([
    'the crossing becomes a named I/O boundary the partition has to carry',
    'the crossing becomes a RESIDUE entry, and the RFC records it as unexplained',
  ]),
  invariant: Object.freeze([
    'the ledger records an invariant the Red reconstruction must falsify',
    'the ledger records a precondition the caller is required to satisfy',
    'no contract is recorded and the condition stays unexplained',
  ]),
  failure_contract: Object.freeze([
    'callers may rely on the failure, and the Red reconstruction must prove it',
    'the error stays internal and no caller obligation is recorded',
  ]),
  state_transition: Object.freeze([
    'the guard becomes part of the transition contract',
    'the transition stays unguarded and the question goes to the next loop round',
  ]),
  data_lineage: Object.freeze([
    'the field becomes a lineage the origin spec must trace end to end',
    'the path is dropped from the origin spec',
  ]),
});

/** The question a card asks, phrased so that either answer is refutable. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildQuestion(claim) {
  const anchor = formatClaimAnchor(claim);
  switch (claim.subjectKind) {
    case 'boundary_crossing':
      return `Is the crossing from \`${claim.scope}\` into \`${claim.provider}\` at \`${anchor}\` `
        + 'an intended boundary or an accident of history?';
    case 'invariant':
      return `Is the condition asserted at \`${anchor}\` a precondition, an invariant, or a defensive check?`;
    case 'failure_contract':
      return `Is the failure at \`${anchor}\` a contracted outcome a caller may rely on?`;
    default:
      return `Is "${claim.statement}" a contract of \`${claim.scope}\`?`;
  }
}

/** The evidence lines a card shows, each naming its mode and its independent weight. */
function buildEvidenceLines(claim) {
  const independent = claim.support.length;
  return claim.evidence.map((item) => {
    const span = item.source_span;
    return `\`${span.file}:${span.line}\` (${item.evidence_mode}; ${independent} independent support)`;
  });
}

/** One decision card, built from one claim. */
// [::TICKET::] P22-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-5 --for-spec --no-implementation-order`.
function buildCard(claim) {
  const options = [...(OPTIONS_BY_SUBJECT_KIND[claim.subjectKind] ?? OPTIONS_BY_SUBJECT_KIND.boundary_crossing), HAND_TO_GRILL];
  const consequences = [
    ...(CONSEQUENCES_BY_SUBJECT_KIND[claim.subjectKind] ?? CONSEQUENCES_BY_SUBJECT_KIND.boundary_crossing),
    'no contract is recorded and the question is carried to the next loop round',
  ];
  return {
    claim_id: claim.claim_id,
    claimType: claim.claim_type,
    subjectKind: claim.subjectKind,
    scope: claim.scope,
    proposition: claim.statement,
    question: buildQuestion(claim),
    options,
    consequences,
    evidence: buildEvidenceLines(claim),
    counterexamples: [...(claim.counterevidence ?? [])],
    default: claim.claim_type === 'unresolved' ? options[options.length - 1] : options[0],
  };
}

/**
 * The cards a ledger yields, layered when their number would exhaust a round.
 *
 * Below the threshold every claim gets its own card. Above it the two levels the
 * design names are used: a boundary claim is a coarse decision and always leads,
 * and the contract level of a scope follows it only when that scope's boundary
 * is settled. Three things decide where a fine card goes.
 *
 *   - A scope with an `unresolved` boundary withholds its contract level whole
 *     (7.4.1). There is no point deciding what a package does internally while
 *     it is unknown whether the package should exist.
 *   - A scope whose boundaries are all settled hangs its contract level from one
 *     of them. From one only: hanging the same children from every sibling would
 *     carry each decision several times over in the same packet.
 *   - A scope with no boundary claim at all has no coarse level, so its local
 *     conditions are bundled under the first of them — the contract bundle 7.4.1
 *     permits for conditions sharing a scope, an oracle and an authority.
 *
 * The last branch is what keeps the threshold honest. Without it a slice whose
 * claims are all local emits every card flat while still reporting that layering
 * happened, which is the explosion the threshold exists to prevent.
 */
export function renderDecisionCards(ledger) {
  const cards = [...ledger.claims].sort((left, right) => compareText(left.claim_id, right.claim_id)).map(buildCard);
  const thresholdCrossed = cards.length > CARD_LAYERING_THRESHOLD;

  if (!thresholdCrossed) {
    return { cards, layered: false, suppressed: 0 };
  }

  const boundaryCards = cards.filter((card) => card.subjectKind === 'boundary_crossing');
  const contractCards = cards.filter((card) => card.subjectKind !== 'boundary_crossing');
  const scopes = [...new Set(cards.map((card) => card.scope))].sort(compareText);
  const scopesWithUnsettledBoundary = new Set(
    boundaryCards.filter((card) => card.claimType === 'unresolved').map((card) => card.scope),
  );

  const emitted = [...boundaryCards];
  let suppressed = 0;

  for (const scope of scopes) {
    const localCards = contractCards.filter((card) => card.scope === scope);
    if (localCards.length === 0) continue;

    if (scopesWithUnsettledBoundary.has(scope)) {
      suppressed += localCards.length;
      const leadIndex = emitted.findIndex((card) => card.scope === scope);
      emitted[leadIndex] = { ...emitted[leadIndex], suppressedChildren: localCards.length };
      continue;
    }

    const leadBoundaryIndex = emitted.findIndex((card) => card.scope === scope);
    if (leadBoundaryIndex === -1) {
      const [leadingCard, ...followingCards] = localCards;
      emitted.push(followingCards.length === 0 ? leadingCard : { ...leadingCard, children: followingCards });
      continue;
    }
    emitted[leadBoundaryIndex] = { ...emitted[leadBoundaryIndex], children: localCards };
  }

  return { cards: emitted, layered: true, suppressed };
}

/** The cards as the Markdown the human reads before answering. */
export function renderCardsMarkdown(cards) {
  const lines = ['## Decision cards', ''];

  if (cards.length === 0) {
    lines.push('No card was produced: the slice held no claim to decide.', '');
    return lines.join('\n');
  }

  const suppressedCount = cards.reduce((total, card) => total + (card.suppressedChildren ?? 0), 0);
  if (suppressedCount > 0) {
    lines.push(
      `${suppressedCount} contract card(s) suppressed beneath an unresolved boundary. They are`,
      'withheld, not dropped: settle the boundary card above them and they are emitted in full.',
      '',
    );
  }

  cards.forEach((card, index) => {
    lines.push(`## Card ${index + 1} — \`${card.claim_id}\``, '');
    lines.push(`One falsifiable proposition: ${card.proposition}`, '');
    lines.push('### Question', '', card.question, '');
    lines.push('- **Options**');
    card.options.forEach((option) => lines.push(`  - ${option}`));
    lines.push('- **Consequences**');
    card.consequences.forEach((consequence) => lines.push(`  - ${consequence}`));
    lines.push('- **Evidence**');
    if (card.evidence.length === 0) lines.push('  - none recorded');
    card.evidence.forEach((item) => lines.push(`  - ${item}`));
    lines.push('- **Counterexamples**');
    if (card.counterexamples.length === 0) lines.push('  - none recorded');
    card.counterexamples.forEach((item) => lines.push(`  - ${item}`));
    lines.push('- **Default**', `  - ${card.default}`, '');
    if (card.children) {
      lines.push(
        `  - this card leads \`${card.scope}\`: ${card.children.length} related decision(s) are attached`,
        '    beneath it and are not expanded here',
      );
      lines.push('');
    }
  });

  return lines.join('\n');
}

/**
 * How many unresolved claims one serving packet prints before it stops.
 *
 * The cap exists because a ledger over a real crate holds thousands of claims
 * and a list nobody finishes is not material. It is named rather than inline so
 * that the one place to change it is the one place that explains it — and what
 * it withholds is always stated, because a silent cap reads as "everything was
 * considered" when it was not.
 */
export const SERVING_LIMIT = 100;

/** `file:line` and how the evidence was read, in the form a reader can act on. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function renderServedEvidence(item) {
  const span = item.source_span;
  return `\`${span.file}:${span.line}\` (${item.evidence_mode})`;
}

/**
 * One unresolved claim as the material a reader decides from.
 *
 * The question is the claim's own and is never re-phrased here: the claim that
 * could not be settled is what is being asked about, and a second wording would
 * be a second proposition. The default is the hand-to-grill option, because a
 * decision the machine cannot make must still have somewhere to go.
 */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function buildServedClaim(claim) {
  if (typeof claim.grill_question !== 'string' || claim.grill_question.length === 0) {
    throw new Error(
      `claim ${claim.claim_id} is unresolved but carries no grill_question: a card that asks nothing is not a `
      + 'decision, it is a statement with a box beside it',
    );
  }
  return {
    claim_id: claim.claim_id,
    claim_type: claim.claim_type,
    scope: claim.scope,
    proposition: claim.statement,
    question: claim.grill_question,
    evidence: (claim.evidence ?? []).map(renderServedEvidence),
    counterexamples: [...(claim.counterevidence ?? [])],
    default: HAND_TO_GRILL,
  };
}

/**
 * The claims a human has to decide, with the material that decision needs.
 *
 * Only `unresolved` claims are served. The rest are not withheld — they are
 * settled — and the count of them is reported, so that a short packet cannot be
 * read as a small analysis.
 */
export function renderServing(ledger, { limit = SERVING_LIMIT } = {}) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('renderServing needs the claim ledger it is to serve; it was given no ledger with claims');
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`the serving limit must be a whole number of claims; it was given ${JSON.stringify(limit)}`);
  }

  const unresolved = [...ledger.claims]
    .filter((claim) => claim.claim_type === 'unresolved')
    .sort((left, right) => compareText(left.claim_id, right.claim_id));
  const served = unresolved.slice(0, limit).map(buildServedClaim);

  return {
    served,
    servedCount: served.length,
    settledCount: ledger.claims.length - unresolved.length,
    withheldFromServing: unresolved.length - served.length,
    totalClaims: ledger.claims.length,
    empty: ledger.claims.length === 0,
  };
}

/** The serving packet as the Markdown the human reads before answering. */
export function renderServingMarkdown(serving) {
  const lines = ['## Serving — the claims a human has to decide', ''];

  if (serving.empty) {
    lines.push(
      'This serving packet is empty. The ledger held no claim at all, so there was nothing to hand over: that',
      'is an explicit empty result from a run that looked, not a report that merely looks short.',
      '',
    );
    return lines.join('\n');
  }

  lines.push(
    `${serving.servedCount} unresolved claim(s) are set out below, each with the question it raises, the`,
    'evidence available for it and the answer that applies if nobody decides. The remaining',
    `${serving.settledCount} claim(s) were settled by the analysis and are not repeated here.`,
    '',
  );

  if (serving.withheldFromServing > 0) {
    lines.push(
      `${serving.withheldFromServing} further unresolved claim(s) were not printed here. They are withheld,`,
      'not dropped: the JSON beside this report carries every one of them, and the count is stated so that',
      'this page cannot read as the whole of what was left open.',
      '',
    );
  }

  for (const claim of serving.served) {
    lines.push(`### \`${claim.claim_id}\``, '');
    lines.push(`One falsifiable proposition: ${claim.proposition}`, '');
    lines.push(`**Question** — ${claim.question}`, '');
    lines.push('- **Evidence**');
    if (claim.evidence.length === 0) lines.push('  - none recorded');
    for (const item of claim.evidence) lines.push(`  - ${item}`);
    lines.push('- **Counterexamples**');
    if (claim.counterexamples.length === 0) lines.push('  - none recorded');
    for (const item of claim.counterexamples) lines.push(`  - ${item}`);
    lines.push(`- **Default** — ${claim.default}`, '');
  }

  return lines.join('\n');
}
