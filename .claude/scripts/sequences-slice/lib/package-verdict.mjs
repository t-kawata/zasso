/**
 * What a package's own documents say about the work it was handed, as one value.
 *
 * The distribution guarantee is established workspace-wide by three gates, and each of them
 * answers a question about the whole: every demand is placed, every unit is accounted for, every
 * package the allocation names carries a view. A reader standing in front of one directory needs
 * the same material answered for that directory, and needs the two ways of falling short told
 * apart — a distribution that reached here and does not hold is a repair, while a directory the
 * distribution never reached is the run itself — because they are different pieces of work.
 *
 * So a package is in one of three states. `complete` when a view a writer that carries
 * obligations wrote holds at least one unit, every unit it holds appears in its own distribution
 * ledger, and every ledger row it holds cites something the document it lives in resolves.
 * `failed` when such a view is there and its verification refutes it. `not-yet` when no attempt
 * exists to judge: no view at all, a view written before the carriage existed, or a view carrying
 * nothing because nothing was declared for the package.
 *
 * The pass is phrased over the units a view carries and never over the field that names their
 * source. Measured over ~/shyme/gaia: the allocation carries no declared_interfaces, no seed
 * carries a serves fence, and all 29 packages read `undeclared` while 84 boundaries reach every
 * one of them through the carries relation — so a rule requiring a declared source would leave
 * that whole workspace permanently unjudged, and an instruction that cannot be satisfied is the
 * defect the gates exist to avoid.
 *
 * The judgement measures nothing. Every limb is a value another reader produced — the ledger
 * parser, the grounding resolver, the discharge measurement, the declaration reader — and this
 * module reads no document at all, so a caller cannot disagree with the gates about one
 * workspace by judging from a second reading of it.
 *
 * Design context: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
 */
import { OBLIGATION_SOURCES } from './obligation.mjs';
import { obligationSourceOf } from './view.mjs';

/** The distribution reached this package and its own documents account for what it carries. */
export const SEQUENCE_VERDICT_COMPLETE = 'complete';
/** The distribution reached this package and its verification refutes what it did. */
export const SEQUENCE_VERDICT_FAILED = 'failed';
/** No attempt exists to judge: nothing was projected, or what was projected carries no obligation. */
export const SEQUENCE_VERDICT_NOT_YET = 'not-yet';

/** No view document was written for this package directory. */
export const PACKAGE_VERDICT_NO_VIEW = 'no-view';
/** A view is there and could not be parsed, so nothing can be judged from it. */
export const PACKAGE_VERDICT_UNREADABLE_VIEW = 'unreadable-view';
/** A view a writer that predates the obligation carriage wrote, whatever units it holds. */
export const PACKAGE_VERDICT_VIEW_PREDATES_THE_CARRIAGE = 'view-predates-the-carriage';
/** A current view carrying nothing, with nothing declared for the package either. */
export const PACKAGE_VERDICT_NOTHING_DECLARED = 'nothing-declared';
/** A view declaring obligations that bound to no unit: a wiring defect, not an unmade decision. */
export const PACKAGE_VERDICT_DECLARATION_DID_NOT_BIND = 'declaration-did-not-bind';
/** A ledger is there and refused for its shape, which is not the same as a ledger that is absent. */
export const PACKAGE_VERDICT_LEDGER_REFUSED = 'ledger-refused';
/** The view carries units and the package has no distribution ledger to account for them. */
export const PACKAGE_VERDICT_WITHOUT_LEDGER = 'without-ledger';
/** The ledger is well formed and omits a unit the package was handed. */
export const PACKAGE_VERDICT_UNACCOUNTED_UNIT = 'unaccounted-unit';
/** A ledger row cites a location the document it lives in does not hold. */
export const PACKAGE_VERDICT_UNRESOLVED_LOCATION = 'unresolved-location';

/**
 * Every reason a verdict can carry, in the order the judgement tests them.
 *
 * A closed list, because a caller deciding what to do about a failed package has to know the
 * whole set of things that can have failed, and because a reason invented at a call site would
 * be a state the plan prints and nobody can act on.
 */
export const PACKAGE_VERDICT_REASONS = Object.freeze([
  PACKAGE_VERDICT_UNREADABLE_VIEW,
  PACKAGE_VERDICT_NO_VIEW,
  PACKAGE_VERDICT_VIEW_PREDATES_THE_CARRIAGE,
  PACKAGE_VERDICT_NOTHING_DECLARED,
  PACKAGE_VERDICT_DECLARATION_DID_NOT_BIND,
  PACKAGE_VERDICT_LEDGER_REFUSED,
  PACKAGE_VERDICT_WITHOUT_LEDGER,
  PACKAGE_VERDICT_UNACCOUNTED_UNIT,
  PACKAGE_VERDICT_UNRESOLVED_LOCATION,
]);

/** The source a view carries when it was projected before the relations existed. */
const UNCARRIED_SOURCE = OBLIGATION_SOURCES[2];

/** A verdict of the named state, carrying the reason it was reached. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function verdictOf(state, reason) {
  return { state, reason };
}

/**
 * Judge one package from the material already read about it.
 *
 * The limbs are tested in the order a reader would ask them: is there anything to judge, did the
 * writer that made it know about obligations, does it carry any, and does its own account of them
 * hold. Each answer is a fact another reader produced, so this decides and never measures.
 *
 * @param {object} material — one package's facts, all of them optional
 * @param {object|null} [material.view] — the parsed view, or null when there is none
 * @param {string|null} [material.readError] — why the view could not be parsed, when it could not
 * @param {string[]} [material.unitIds] — the unit ids the view distributes, as collectUnitIds reads them
 * @param {boolean} [material.withoutLedger] — the package has units and no ledger to account for them
 * @param {string|null} [material.ledgerRefusedReason] — why the package's ledger was refused
 * @param {string[]} [material.unaccountedUnitIds] — units its ledger does not name
 * @param {string[]} [material.unresolvedLocations] — ledger rows citing what the document lacks
 * @param {boolean} [material.declarationDidNotBind] — a declaration that bound to no unit
 * @returns {{ state: string, reason: string|null }}
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
export function judgeSequenceOf(material) {
  const {
    view = null,
    readError = null,
    unitIds = [],
    withoutLedger = false,
    ledgerRefusedReason = null,
    unaccountedUnitIds = [],
    unresolvedLocations = [],
    declarationDidNotBind = false,
  } = material ?? {};

  if (readError !== null) return verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_UNREADABLE_VIEW);
  if (view === null || view === undefined) return verdictOf(SEQUENCE_VERDICT_NOT_YET, PACKAGE_VERDICT_NO_VIEW);
  if (obligationSourceOf(view) === UNCARRIED_SOURCE) {
    return verdictOf(SEQUENCE_VERDICT_NOT_YET, PACKAGE_VERDICT_VIEW_PREDATES_THE_CARRIAGE);
  }
  if ((unitIds ?? []).length === 0) {
    return declarationDidNotBind
      ? verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_DECLARATION_DID_NOT_BIND)
      : verdictOf(SEQUENCE_VERDICT_NOT_YET, PACKAGE_VERDICT_NOTHING_DECLARED);
  }
  if (ledgerRefusedReason !== null) return verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_LEDGER_REFUSED);
  if (withoutLedger === true) return verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_WITHOUT_LEDGER);
  if ((unaccountedUnitIds ?? []).length > 0) return verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_UNACCOUNTED_UNIT);
  if ((unresolvedLocations ?? []).length > 0) return verdictOf(SEQUENCE_VERDICT_FAILED, PACKAGE_VERDICT_UNRESOLVED_LOCATION);
  return verdictOf(SEQUENCE_VERDICT_COMPLETE, null);
}
