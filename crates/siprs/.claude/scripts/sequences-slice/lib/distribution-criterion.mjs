/**
 * When a distribution counts as complete, as a value rather than a judgement.
 *
 * Four rounds of work each closed one named hole and each left residue that the next round found,
 * because every round defined done for itself: "the hole I named is closed" is satisfiable while
 * the property is false, so the property was never the thing being measured. This module is the
 * answer to that. It enumerates the clauses a complete distribution has, each naming the check that
 * measures it, so that a clause and its measurement cannot drift apart and so that a reader asking
 * whether the whole thing is enough gets a list rather than an opinion.
 *
 * The clause list is closed against the claims the gates make. {@link uncoveredClaims} reads the
 * guarantee sentences the gates print and the verdicts they return, and reports any clause a gate
 * claims but no criterion clause covers; the criterion itself carries that as one of its clauses, so
 * a claim added without a measurement fails rather than passing quietly. That is the mechanism, and
 * it is the only part of this module that exists for the future rather than for the present.
 *
 * What it deliberately does not measure. Whether the specification names every procedure the project
 * needs cannot be derived from the specification, so no clause covers it and the boundary is printed
 * by every surface that reports the criterion. A satisfied criterion means the distribution is total
 * relative to the specification and says nothing about the world beyond it.
 */
import { DEMAND_AXES } from './obligation-coverage.mjs';

/**
 * The clauses, in the order a report prints them.
 *
 * Every clause answers a question about one workspace, and none of them is a threshold: a clause
 * holds or it does not, so a reader never has to know what number was chosen.
 */
export const CRITERION_CLAUSES = Object.freeze([
  {
    id: 'K1',
    claim: 'every demand axis is measured against a structure the workspace holds, rather than against the artifact itself',
    measuredBy: 'denominatorOf+gapsIn',
    evaluate: ({ coverage }) => coverage.denominatorGaps.length === 0,
  },
  {
    id: 'K2',
    claim: 'every demand is placed by a named package, by a relation or by a recorded judgment',
    measuredBy: 'measureCoverage',
    evaluate: ({ coverage }) => DEMAND_AXES.every((axis) => coverage.axes[axis].unassigned.length === 0),
  },
  {
    id: 'K3',
    claim: 'every judgment placing a demand cites evidence the workspace holds',
    measuredBy: 'resolveGround',
    evaluate: ({ coverage }) => coverage.unresolvedGrounds.length === 0,
  },
  {
    id: 'K4',
    claim: 'every exemption names the package the duty went to, so no demand is parked instead of placed',
    measuredBy: 'refuseUnexemptibleDemand',
    evaluate: ({ coverage }) => coverage.refusedExemptions.length === 0,
  },
  {
    id: 'K5',
    claim: 'every unit a view holds is accounted for by its own package distribution ledger, and every ledger row names a unit that package holds',
    measuredBy: 'readDistributionLedger',
    evaluate: ({ discharge }) => discharge.unaccounted.length === 0 && discharge.withoutLedger.length === 0,
  },
  {
    id: 'K6',
    claim: 'every ledger location that cites something resolves inside the document it cites',
    measuredBy: 'resolveGround+sectionIdentifiersOf',
    evaluate: ({ locations }) => locations.unresolved.length === 0,
  },
  {
    id: 'K7',
    claim: 'no gate claims more than this criterion measures',
    measuredBy: 'uncoveredClaims',
    evaluate: ({ gateSource }) => uncoveredClaims(gateSource).length === 0,
  },
  {
    id: 'K8',
    // The claim says the distribution reached every directory, and a view is not a distribution: a
    // projection written before the obligation carriage existed is a file that exists and an
    // obligation set that is empty. Measured over one workspace: the allocation named 29 packages,
    // 26 held a view, and one of those 26 held a view the carriage had reached. Evaluated over
    // every parseable view the clause therefore reported the distribution complete for
    // twenty-five directories nothing had been distributed to.
    claim: 'every package the allocation names holds a view projected with the obligation carriage, so the distribution reached every directory rather than most of them',
    measuredBy: 'readViews',
    evaluate: ({ packages }) => packages.named.every((packageId) => packages.carried.includes(packageId)),
    describe: ({ packages }) => (packages.untransported.length === 0
      ? null
      : `not carried: ${packages.untransported.join(', ')}`),
  },
]);

/**
 * The boundary every surface prints beside the criterion.
 *
 * Stated rather than left to be inferred, because a list of clauses that all hold reads as a claim
 * about the project and is only a claim about the document it was measured from.
 */
export const CRITERION_BOUNDARY = 'not measured: whether the specification names every procedure the project needs. A satisfied criterion means the distribution is complete relative to the specification, and says nothing about the world beyond it.';

/** The clause a gate may claim, and the clause of this criterion that measures it. */
export const CLAIM_CLAUSES = Object.freeze([
  { pattern: /every demand is placed by a named package/i, clause: 'K2' },
  { pattern: /by a route that resolves/i, clause: 'K3' },
  { pattern: /every placement is traceable to an RFC section anchor and a ledger row/i, clause: 'K6' },
  { pattern: /every unit every view holds is accounted for/i, clause: 'K5' },
  { pattern: /exemption names the package/i, clause: 'K4' },
  { pattern: /every axis is measured against a structure the workspace holds/i, clause: 'K1' },
  { pattern: /every package the allocation names (carries a view|holds a view projected with the obligation carriage)/i, clause: 'K8' },
  { pattern: /the distribution reached every directory/i, clause: 'K8' },
]);

/** The sentence a gate writes to state what it claims, which is the text the closure reads. */
const CLAIM = /(?<!not )guarantees?:\s*([^\n'"]+)/gi;

/** The sentence a gate writes to state that it is not claiming the thing it cannot measure. */
const LIMIT = /does not guarantee/;

/**
 * Every clause a source claims in a guarantee sentence, as plain strings.
 *
 * The claims are read as data rather than trusted, so the closure runs over the same text a reader
 * sees. A source carrying no guarantee line is an error rather than an empty result: an extractor
 * that found nothing would report every claim covered, which is the failure this whole module exists
 * to make impossible.
 *
 * @param {string} sourceText
 * @returns {string[]}
 */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function claimsIn(sourceText) {
  const claims = [];
  for (const match of String(sourceText ?? '').matchAll(CLAIM)) {
    const sentence = match[1].trim().replace(/[.;]$/, '');
    // A guarantee sentence is a list, and each item of it is a separate thing claimed. Reading the
    // sentence whole would allow one covered item to carry the others.
    for (const fragment of sentence.split(/, and |, /)) claims.push(fragment.replace(/^and\s+/, '').trim());
  }
  if (claims.length === 0 && !LIMIT.test(String(sourceText ?? ''))) {
    throw new Error('no guarantee line to read: the closure cannot be established over a source that neither claims nor states its limit');
  }
  return claims;
}

/**
 * The claims a source makes that no criterion clause covers.
 *
 * A claim is covered when it matches a declared pattern, and the declaration names the clause that
 * measures it. The declaration is what forces the work: a claim added without an entry fails here,
 * and an entry naming a clause that does not exist fails the assertion that every declared clause is
 * a real one. Matching on declared patterns rather than on the words of the claim is deliberate — a
 * comparison loose enough to accept a reworded sentence is loose enough to accept a reworded claim
 * about something nobody measures, which is the failure this exists to catch.
 *
 * @param {string} sourceText
 * @returns {string[]}
 */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
export function uncoveredClaims(sourceText) {
  return claimsIn(sourceText).filter((claim) => !CLAIM_CLAUSES.some((entry) => entry.pattern.test(claim)));
}

/**
 * One finding per clause, in the criterion's own order.
 *
 * @param {{ coverage: object, discharge: object, locations: object, packages: object, gateSource: string }} context
 * @returns {Array<{ id: string, claim: string, measuredBy: string, holds: boolean, detail: string|null }>}
 */
// [::TICKET::] PX-263 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-263 --for-spec --no-implementation-order`.
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
export function criterionFindings(context) {
  return CRITERION_CLAUSES.map((clause) => ({
    id: clause.id,
    claim: clause.claim,
    measuredBy: clause.measuredBy,
    holds: clause.evaluate(context) === true,
    // What the clause saw, when the clause can say it. A finding that reports only that a clause is
    // short leaves the reader to work out which directories to open, which is the work this value
    // exists to remove.
    detail: typeof clause.describe === 'function' ? clause.describe(context) ?? null : null,
  }));
}
