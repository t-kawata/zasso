/**
 * Classify an API-gate finding as a false positive or a repairable surface.
 *
 * The gate says what is inconsistent; it does not say where the authored repair lives.
 * A finding whose source no longer reproduces is a false positive and must not send the
 * AI to edit correct code. A real finding names the RFC line or the allocate decision
 * the caller can edit. The plan is read-only: it never writes or applies a candidate.
 */
import { SmoothSequencesError } from '../smooth-sequences/lib/errors.mjs';

/** The classification of one finding. */
export const CLASSIFICATION = Object.freeze({
  FALSE_POSITIVE: 'false-positive',
  REPAIR_CANDIDATE: 'repair-candidate',
  ADVISORY: 'advisory',
  UNRESOLVED: 'unresolved',
});

const UNKNOWN_FINDING_CODE = 'UNKNOWN_FINDING_CODE';
const ALLOCATE_DECISIONS_PATH = 'workspace/allocate/DECISIONS.json';

/** The declaration whose shape the call must match. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function findDeclaration(surfaces, symbol) {
  return surfaces.flatMap((surface) => surface.declarations ?? []).find((entry) => entry.symbol === symbol) ?? null;
}

/** The call references in the finding's package. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function collectCallReferences(surfaces, finding) {
  const packageId = finding.package ?? finding.packageId;
  return surfaces
    .flatMap((surface) => surface.references ?? [])
    .filter((reference) => reference.symbol === finding.symbol
      && reference.kind === 'call'
      && (reference.packageId === packageId || reference.package === packageId));
}

/** The expected argument count of a verifier declaration. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function computeExpectedArity(declaration, symbol) {
  return declaration.parameterCount + (symbol.includes('::') && declaration.receiver === true ? 1 : 0);
}

/** An arity finding the source does or does not still support. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function classifyArity(finding, surfaces) {
  const declaration = findDeclaration(surfaces, finding.symbol);
  if (declaration === null) {
    return { classification: CLASSIFICATION.UNRESOLVED, reason: 'no declaration for the symbol is readable' };
  }
  const references = collectCallReferences(surfaces, finding);
  if (references.length === 0) {
    return { classification: CLASSIFICATION.UNRESOLVED, reason: 'no call reference for the symbol is readable' };
  }
  const expectedArity = computeExpectedArity(declaration, finding.symbol);
  if (references.every((reference) => reference.argumentCount === expectedArity)) {
    return {
      classification: CLASSIFICATION.FALSE_POSITIVE,
      candidate: null,
      reason: `the source calls ${finding.symbol} with ${expectedArity} argument(s)`,
      evidence: { argumentCount: expectedArity },
    };
  }
  const reference = references.find((entry) => entry.argumentCount !== expectedArity);
  return {
    classification: CLASSIFICATION.REPAIR_CANDIDATE,
    surface: reference.rfcPath ?? finding.rfcPath,
    candidate: { line: reference.line, argumentCount: reference.argumentCount, expectedArity },
    reason: `${finding.symbol} is called with ${reference.argumentCount} argument(s) and declared with ${expectedArity}`,
  };
}

/** A missing dependency boundary, as an allocate-decisions candidate. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function classifyDependency(finding, surfaces, allocateManifest, treeManifest) {
  const importedPackage = /\(([^)]+)\)/.exec(finding.cause ?? '')?.[1] ?? null;
  const consumerPackage = finding.package ?? finding.packageId;
  if (importedPackage === null || consumerPackage === undefined) {
    return { classification: CLASSIFICATION.UNRESOLVED, reason: 'the imported package is not readable from the finding' };
  }
  const boundary = (treeManifest?.dependencies?.boundaries ?? [])
    .find((entry) => entry.provider_package === importedPackage && entry.consumer_package === consumerPackage);
  return {
    classification: CLASSIFICATION.REPAIR_CANDIDATE,
    surface: ALLOCATE_DECISIONS_PATH,
    candidate: {
      boundary_id: boundary?.id ?? `boundary-${consumerPackage}-${importedPackage}`,
      provider_package: importedPackage,
      consumer_package: consumerPackage,
    },
    reason: `${consumerPackage} imports ${finding.symbol} without a declared boundary`,
  };
}

/** An undefined symbol, as a package RFC re-export candidate. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function classifySymbol(finding) {
  const importedPackage = /from\s+([^,\s]+)/.exec(finding.cause ?? '')?.[1] ?? null;
  if (importedPackage === null) {
    return { classification: CLASSIFICATION.UNRESOLVED, reason: 'the imported package is not readable from the finding' };
  }
  return {
    classification: CLASSIFICATION.REPAIR_CANDIDATE,
    surface: finding.artifact ?? finding.rfcPath,
    candidate: {
      kind: 're-export',
      symbol: finding.symbol,
      importedPackage,
      text: `pub use ${importedPackage}::${finding.symbol};`,
    },
    reason: `${finding.symbol} is imported from ${importedPackage} but not declared there`,
  };
}

/** A finding the plan cannot turn into a deterministic candidate. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function classifyUnresolved(finding) {
  return { classification: CLASSIFICATION.UNRESOLVED, reason: `no deterministic repair for ${finding.code}` };
}

/** A finding that is advisory by construction. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
function classifyAdvisory(finding) {
  return { classification: CLASSIFICATION.ADVISORY, reason: `${finding.code} is advisory` };
}

/** The classifier for every finding code the gate emits. */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
export const REPAIR_CLASSIFIERS = Object.freeze({
  ARITY_MISMATCH: classifyArity,
  GENERIC_ARITY_MISMATCH: classifyUnresolved,
  SYMBOL_UNDEFINED: classifySymbol,
  SYMBOL_DUPLICATE: classifyUnresolved,
  KIND_MISMATCH: classifyUnresolved,
  DEPENDENCY_EDGE_MISSING: classifyDependency,
  UNPARSED_SURFACE: classifyAdvisory,
  UNSCOPED_SYMBOL: classifyAdvisory,
});

/**
 * Build the plan for every finding.
 *
 * @param {{ surfaces?: object[], findings?: object[], allocateManifest?: object,
 *   treeManifest?: object }} input
 * @returns {{ entries: Array<object> }}
 */
// [::TICKET::] PX-387 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-387 --for-spec --no-implementation-order`.
export function buildRepairPlan(input = {}) {
  const { surfaces = [], findings = [], allocateManifest = {}, treeManifest = {} } = input;
  return {
    entries: findings.map((finding) => {
      const classifier = REPAIR_CLASSIFIERS[finding.code];
      if (classifier === undefined) {
        throw new SmoothSequencesError(`unknown finding code ${finding.code}`, {
          code: UNKNOWN_FINDING_CODE,
          repair: 'Add the code to REPAIR_CLASSIFIERS with the authored surface it restores.',
        });
      }
      const result = classifier(finding, surfaces, allocateManifest, treeManifest);
      return { finding, ...result };
    }),
  };
}
