// [::TICKET::] P22-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-3 --for-spec --no-implementation-order`.
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
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
 * exhaust a round, the levels the design names are used — `boundary`, `contract`
 * and the `bundle` a scope with no boundary claim gathers its conditions into
 * (`PACKET_LEVELS`). A boundary claim is a coarse decision and leads, and the
 * contract level beneath it follows only when that scope's boundary is settled.
 * A boundary that is itself `unresolved` withholds the whole contract level,
 * because there is no point deciding what a package does internally while it is
 * unknown whether the package should exist.
 *
 * One selection decides that shape for both readers of this module: the spike's
 * decision cards, which calibrated it, and the serving packet the exit publishes.
 * What is withheld is always counted and always stated, with the rule that
 * withheld it; silent truncation would read as "everything was considered" when
 * it was not.
 */
import { compareText } from './holdout-ledger.mjs';
import { formatClaimAnchor } from './claim-ledger.mjs';

/**
 * The subject kinds a card may name, from 7.4.1.
 *
 * The spike produces three of the five; the other two are declared because the
 * vocabulary is shared with P22-5 and P22-20 and a closed list that grows
 * silently is not a vocabulary.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
export const CARD_SUBJECT_KINDS = Object.freeze([
  'boundary_crossing',
  'state_transition',
  'invariant',
  'failure_contract',
  'data_lineage',
]);

/**
 * The fields every decision card carries, whatever stage produced it (7.4.1).
 *
 * The spike, the serving layer and the adjudication cards all answer to this
 * one shape, so a card means the same thing wherever a human meets it. A stage
 * that invents its own shape would be asking its reader to learn a second
 * vocabulary for the same decision.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
export const CARD_FIELDS = Object.freeze([
  'claim_id',
  'proposition',
  'question',
  'options',
  'consequences',
  'evidence',
  'counterexamples',
  'default',
  'scope',
  'subjectKind',
]);

/**
 * The list-valued fields, in the order a card prints them, with their headings.
 *
 * `emptyNote` marks the fields that say so when they hold nothing: an evidence
 * list that printed no line at all would read as "there was none to print",
 * which is the one thing a card must never imply. Options and consequences have
 * no note because a card without them is refused before it is rendered
 * (`assertCardIsAdjudicable`).
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
const CARD_SECTIONS = Object.freeze([
  Object.freeze({ key: 'options', label: 'Options', emptyNote: false }),
  Object.freeze({ key: 'consequences', label: 'Consequences', emptyNote: false }),
  Object.freeze({ key: 'evidence', label: 'Evidence', emptyNote: true }),
  Object.freeze({ key: 'counterexamples', label: 'Counterexamples', emptyNote: true }),
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

/**
 * The levels a packet reads in, named as 7.4.1 names them.
 *
 * `boundary` is the coarse decision a scope's local conditions wait on;
 * `contract` is a scope's contract level hung beneath the boundary it belongs
 * to; `bundle` is the local conditions of a scope that has no boundary claim at
 * all, gathered under the first of them. The names are held once so that the
 * selection and the rendering cannot spell the same level two ways.
 */
export const PACKET_LEVELS = Object.freeze(['boundary', 'contract', 'bundle']);

/** A threshold nothing crosses: the caller has not asked for the layered shape. */
const NEVER_LAYERED = Number.POSITIVE_INFINITY;

/**
 * Why a claim the packet does not print was left out.
 *
 * The rule is reported alongside the count, never replaced by it: "1,614
 * withheld" answers nothing a reader can act on, and the reader is the one who
 * has to decide whether the withholding was right.
 */
export const WITHHOLDING_RULES = Object.freeze({
  unresolvedBoundary: 'a scope whose boundary is unresolved withholds its contract level whole',
  servingLimit: 'the claim lies beyond the serving limit',
});

/**
 * The answer every card offers, so a decision the machine cannot make is never lost.
 *
 * Exported because the adjudication cards of P22-20 offer the same answer: when
 * nobody decides, the question belongs to the human grill, not to the default.
 */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
export const HAND_TO_GRILL = 'hand it to the human grill as unresolved';

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
 * The claims a packet carries, and what hangs beneath what.
 *
 * Below the threshold every claim leads its own card. Above it the levels the
 * design names are used, and three things decide where a fine claim goes.
 *
 *   - A boundary claim is a coarse decision and always leads, at `boundary`.
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
 *
 * Selection and rendering are separated here: this function decides which claims
 * are carried and in what structure, and the two callers — the spike's decision
 * cards and the exit's serving packet — differ only in what they build from the
 * result. One selection is what stops the shape the spike calibrated from
 * drifting away from the shape the exit serves a second time.
 *
 * @returns {{cards: Array<object>, layered: boolean, suppressed: number}} one
 *   entry per leading claim, in reading order, of the shape
 *   `{claim, level, childLevel, children, suppressedChildren}`. `level` and
 *   `childLevel` are `PACKET_LEVELS` values, and are `null` when the packet is
 *   flat — a flat packet has no levels to be at.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
export function selectServingCards(ledger, { threshold = CARD_LAYERING_THRESHOLD } = {}) {
  const claims = [...ledger.claims].sort((left, right) => compareText(left.claim_id, right.claim_id));

  if (claims.length <= threshold) {
    return { cards: claims.map((claim) => selectionEntry(claim, null, null)), layered: false, suppressed: 0 };
  }

  const boundaryClaims = claims.filter((claim) => claim.subjectKind === 'boundary_crossing');
  const contractClaims = claims.filter((claim) => claim.subjectKind !== 'boundary_crossing');
  const scopes = [...new Set(claims.map((claim) => claim.scope))].sort(compareText);
  const scopesWithUnsettledBoundary = new Set(
    boundaryClaims.filter((claim) => claim.claim_type === 'unresolved').map((claim) => claim.scope),
  );

  const carried = boundaryClaims.map((claim) => selectionEntry(claim, PACKET_LEVELS[0], null));
  let suppressed = 0;

  for (const scope of scopes) {
    const localClaims = contractClaims.filter((claim) => claim.scope === scope);
    if (localClaims.length === 0) continue;

    if (scopesWithUnsettledBoundary.has(scope)) {
      suppressed += localClaims.length;
      const leadIndex = carried.findIndex((entry) => entry.claim.scope === scope);
      carried[leadIndex] = { ...carried[leadIndex], childLevel: PACKET_LEVELS[1], suppressedChildren: localClaims.length };
      continue;
    }

    const leadBoundaryIndex = carried.findIndex((entry) => entry.claim.scope === scope);
    if (leadBoundaryIndex === -1) {
      const [leadingClaim, ...followingClaims] = localClaims;
      carried.push(selectionEntry(leadingClaim, PACKET_LEVELS[2], PACKET_LEVELS[2], followingClaims));
      continue;
    }
    carried[leadBoundaryIndex] = { ...carried[leadBoundaryIndex], childLevel: PACKET_LEVELS[1], children: localClaims };
  }

  return { cards: carried, layered: true, suppressed };
}

/** One claim leading a card, with the claims hung beneath it and the level they sit at. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function selectionEntry(claim, level, childLevel, children = [], suppressedChildren = 0) {
  return { claim, level, childLevel, children, suppressedChildren };
}

/**
 * The cards a ledger yields, layered when their number would exhaust a round.
 *
 * The selection is `selectServingCards`'s; this function builds the card a human
 * answers from each claim the selection carries, and nothing else.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
export function renderDecisionCards(ledger) {
  const selection = selectServingCards(ledger);

  return {
    cards: selection.cards.map(buildCardForEntry),
    layered: selection.layered,
    suppressed: selection.suppressed,
  };
}

/** One selected claim as the decision card the human answers. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function buildCardForEntry(entry) {
  const card = buildCard(entry.claim);
  if (entry.suppressedChildren > 0) return { ...card, suppressedChildren: entry.suppressedChildren };
  if (entry.children.length > 0) return { ...card, children: entry.children.map(buildCard) };
  return card;
}

/** The cards as the Markdown the human reads before answering. */
// [::TICKET::] P22-20 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-20 --for-spec --no-implementation-order`.
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
    for (const section of CARD_SECTIONS) {
      const values = card[section.key] ?? [];
      lines.push(`- **${section.label}**`);
      if (section.emptyNote && values.length === 0) lines.push('  - none recorded');
      values.forEach((value) => lines.push(`  - ${value}`));
    }
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

/**
 * Refuse a packet whose counts do not account for every unresolved claim.
 *
 * The three numbers are named in the failure because the reader has to be able
 * to see which one moved: a packet that quietly shrank would read as an
 * analysis that had less left open than it did, which is the one thing a serving
 * stage must never say. The identity is checked rather than assumed, so a later
 * change to the selection fails a run instead of dropping a claim.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
export function assertPacketReconciles({ unresolvedCount, servedCount, withheldFromServing }) {
  if (servedCount + withheldFromServing === unresolvedCount) return undefined;
  throw new Error(
    `the serving packet accounts for ${servedCount} served and ${withheldFromServing} withheld claim(s), which is `
    + `${servedCount + withheldFromServing} of the ${unresolvedCount} unresolved claim(s) the ledger holds. `
    + 'A packet that does not account for every one of them may not be published: withheld is not dropped, and a '
    + 'claim missing from both counts is a claim the reader was never told about.',
  );
}

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
 *
 * `layered` asks for the shape the spike calibrated: a boundary card leads and
 * the contract level it governs follows it, instead of a flat list in
 * identifier order. It is off by default so that the callers that have not asked
 * for the change keep the packet they had; the exit asks for it at its one call
 * site. It is not a ranking: a boundary leads because the level beneath it is
 * undecidable while the boundary is open, so the ordering is a dependency and
 * the reader must not read the first layer as the answer.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
export function renderServing(ledger, { limit = SERVING_LIMIT, layered = false } = {}) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('renderServing needs the claim ledger it is to serve; it was given no ledger with claims');
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`the serving limit must be a whole number of claims; it was given ${JSON.stringify(limit)}`);
  }

  const unresolved = ledger.claims.filter((claim) => claim.claim_type === 'unresolved');
  const selection = selectServingCards(
    { ...ledger, claims: unresolved },
    { threshold: layered ? CARD_LAYERING_THRESHOLD : NEVER_LAYERED },
  );
  const reading = flattenSelection(selection.cards);
  // Every claim the packet carries is built, printed or not. A card that asks
  // nothing is refused wherever it sits, rather than only on the page the limit
  // happens to end at.
  const carried = reading.map((piece) => ({ ...buildServedClaim(piece.claim), level: piece.level, lead: piece.lead }));
  const served = carried.slice(0, limit);
  const withheldFromServing = unresolved.length - served.length;

  assertPacketReconciles({
    unresolvedCount: unresolved.length,
    servedCount: served.length,
    withheldFromServing,
  });

  return {
    served,
    servedCount: served.length,
    settledCount: ledger.claims.length - unresolved.length,
    withheldFromServing,
    totalClaims: ledger.claims.length,
    empty: ledger.claims.length === 0,
    layered: selection.layered,
    layers: selection.layered ? summarizeLayers(served) : [],
    withheld: summarizeWithholdings({ selection, reading, servedCount: served.length, withheldFromServing }),
  };
}

/**
 * A selection as the order its claims are read: each leading claim, then what
 * hangs beneath it. `lead` names the card a hung claim sits under, so the reader
 * can see which boundary a contract level belongs to.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function flattenSelection(entries) {
  return entries.flatMap((entry) => [
    { claim: entry.claim, level: entry.level, lead: null },
    ...entry.children.map((claim) => ({ claim, level: entry.childLevel, lead: entry.claim.claim_id })),
  ]);
}

/**
 * The levels the packet serves, each with its card count and the scopes it covers.
 *
 * A level that holds nothing is reported at zero rather than omitted: a reader
 * who cannot see the contract level is missing has no way to tell an empty level
 * from one the packet failed to mention.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function summarizeLayers(served) {
  return PACKET_LEVELS.map((level) => {
    const atLevel = served.filter((card) => card.level === level);
    return { level, cardCount: atLevel.length, scopes: scopeNamesOf(atLevel) };
  });
}

/** Why the claims the packet does not print were left out, rule by rule. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function summarizeWithholdings({ selection, reading, servedCount, withheldFromServing }) {
  const withheld = [];

  if (selection.suppressed > 0) {
    withheld.push({
      rule: 'unresolvedBoundary',
      count: selection.suppressed,
      scopes: scopeNamesOf(selection.cards.filter((entry) => entry.suppressedChildren > 0).map((entry) => entry.claim)),
    });
  }

  const beyondLimit = withheldFromServing - selection.suppressed;
  if (beyondLimit > 0) {
    withheld.push({
      rule: 'servingLimit',
      count: beyondLimit,
      scopes: scopeNamesOf(reading.slice(servedCount).map((piece) => piece.claim)),
    });
  }

  return withheld;
}

/** The scopes a set of claims covers, each named once, in code-unit order. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function scopeNamesOf(claims) {
  return [...new Set(claims.map((claim) => claim.scope))].sort(compareText);
}

/** The heading every serving packet opens with, shared by the empty and full pages. */
const SERVING_HEADING = '## Serving — the claims a human has to decide';

/**
 * The serving packet as the Markdown the human reads before answering.
 *
 * The page is built in the order it is read: the counts, then the levels when
 * the packet is layered, then the cards themselves, and last what was withheld
 * and why. The withholding note comes last because it is what a reader turns to
 * after deciding, to see whether anything was held back.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
export function renderServingMarkdown(serving) {
  if (serving.empty) {
    return [
      SERVING_HEADING,
      '',
      'This serving packet is empty. The ledger held no claim at all, so there was nothing to hand over: that',
      'is an explicit empty result from a run that looked, not a report that merely looks short.',
      '',
    ].join('\n');
  }

  const lines = [SERVING_HEADING, '', ...renderPacketHeader(serving)];

  if (serving.layers.length > 0) {
    lines.push(...renderLayerSummary(serving.layers));
  }

  for (const claim of serving.served) lines.push(...renderServedCard(claim));

  lines.push(...renderWithholdingNote(serving));

  return lines.join('\n');
}

/** The counts a reader needs before the cards: served, settled and withheld. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderPacketHeader(serving) {
  return [
    `${serving.servedCount} unresolved claim(s) are set out below, each with the question it raises, the`,
    'evidence available for it and the answer that applies if nobody decides. The remaining',
    `${serving.settledCount} claim(s) were settled by the analysis and are not repeated here.`,
    '',
  ];
}

/**
 * The levels this packet reads in, and the sentence that keeps the order honest.
 *
 * The first line denies the reading a layered page invites. A reader who takes
 * the boundary layer for the important half has read a dependency as a ranking,
 * and would answer the coarse card and treat the rest as detail.
 */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderLayerSummary(layers) {
  return [
    'The packet is layered. A boundary card leads because the contract level beneath it cannot be',
    'decided while that boundary is open — not because the boundary matters more.',
    '',
    ...layers.flatMap(renderLayer),
  ];
}

/** One level of the packet, with how many cards it holds and the scopes they cover. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderLayer(layer) {
  return [`- **${layer.level}** — ${layer.cardCount} card(s)${renderScopes(layer.scopes)}`, ''];
}

/** One served claim, stating the level it sits at and the card it hangs from. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderServedCard(claim) {
  const lines = [`### \`${claim.claim_id}\``, ''];

  if (claim.lead !== null) lines.push(`Under \`${claim.lead}\`, at the **${claim.level}** level.`, '');

  lines.push(`One falsifiable proposition: ${claim.proposition}`, '');
  lines.push(`**Question** — ${claim.question}`, '');
  lines.push('- **Evidence**');
  if (claim.evidence.length === 0) lines.push('  - none recorded');
  for (const evidenceLine of claim.evidence) lines.push(`  - ${evidenceLine}`);
  lines.push('- **Counterexamples**');
  if (claim.counterexamples.length === 0) lines.push('  - none recorded');
  for (const counterexample of claim.counterexamples) lines.push(`  - ${counterexample}`);
  lines.push(`- **Default** — ${claim.default}`, '');

  return lines;
}

/** What was not printed, and the rule each part of it was withheld under. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderWithholdingNote(serving) {
  if (serving.withheldFromServing === 0) return [];

  return [
    `${serving.withheldFromServing} further unresolved claim(s) were not printed here. They are withheld,`,
    'not dropped: the JSON beside this report carries every one of them, and the count is stated so that',
    'this page cannot read as the whole of what was left open.',
    '',
    ...serving.withheld.map((entry) => `- ${entry.count} withheld — ${WITHHOLDING_RULES[entry.rule]}${renderScopes(entry.scopes)}`, ''),
  ];
}

/** `, covering \`a\`, \`b\`` when any scope is named, and nothing when none is. */
// [::TICKET::] P23-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-3 --for-spec --no-implementation-order`.
function renderScopes(scopes) {
  return scopes.length === 0 ? '' : `, covering ${scopes.map((scope) => `\`${scope}\``).join(', ')}`;
}
