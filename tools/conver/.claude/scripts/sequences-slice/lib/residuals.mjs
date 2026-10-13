/**
 * The disposition of the class names no manifest in the workspace owns.
 *
 * Ten class names occur as an operation's result_object_classes and appear in
 * inventory.objects nowhere, in inventory.claims nowhere, and in inventory.terms nowhere.
 * That is a gap in the upstream manifests, which this tool may not edit, so the most this
 * code can be held to is that it disposes of every one of them: the disposition is total
 * by construction, and an undeclared name lands in the unaccounted bucket rather than
 * disappearing into a count.
 *
 * The names are recorded rather than derived because deriving them is exactly the reading
 * that cannot be mechanised: deciding whether a class name denotes the same thing as a
 * term entry is a reading of a natural-language specification. Recording them turns the
 * undecidable question into a decidable one — either every name is disposed or the
 * unaccounted bucket is not empty — while keeping the reading visible where it can be
 * reviewed.
 */

// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const DECLARED_RESIDUAL_CLASS_NAMES = Object.freeze([
  'CitationCertificate',
  'CommunityCertificate',
  'ForumGenesis',
  'GenesisCertificate',
  'OriginLot',
  'ReciprocalCertificate',
  'RootEntry',
  'RootEntryCertificate',
  'SeedAllocationRegistry',
  'StorageAuditResponse',
]);

/**
 * Where each unmatched class name goes.
 *
 * A name is resolved through the claim table if that table carries it, through the term
 * index if that index carries it, and is a declared residual if it was recorded as one.
 * Anything else is unaccounted, which is the state a caller must treat as a finding
 * rather than as a zero.
 *
 * The term index carries canonical_name values that are normative modal phrases — 17 of
 * them across 777 entries — so it cannot carry an object class name at all. It is
 * consulted by canonical_name and never by substring: a substring match over a term
 * record hits CommunityCertificate, which appears inside prose the record quotes, and a
 * false hit is worse than an honest miss.
 *
 * @param {string[]} unmatchedClassNames - the class names no manifest owned
 * @param {{
 *   claimNames?: string[],
 *   termNames?: string[],
 *   declaredResiduals?: readonly string[],
 * }} [options]
 * @returns {{
 *   resolvedThroughClaims: string[],
 *   resolvedThroughTerms: string[],
 *   declaredResiduals: string[],
 *   unaccounted: string[],
 * }}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function disposeUnmatchedClassNames(unmatchedClassNames, options = {}) {
  const {
    claimNames = [],
    termNames = [],
    declaredResiduals = DECLARED_RESIDUAL_CLASS_NAMES,
  } = options;

  const claimed = new Set(claimNames);
  const termed = new Set(termNames);
  const declared = new Set(declaredResiduals);

  const disposition = {
    resolvedThroughClaims: [],
    resolvedThroughTerms: [],
    declaredResiduals: [],
    unaccounted: [],
  };

  for (const name of [...unmatchedClassNames].sort()) {
    if (claimed.has(name)) disposition.resolvedThroughClaims.push(name);
    else if (termed.has(name)) disposition.resolvedThroughTerms.push(name);
    else if (declared.has(name)) disposition.declaredResiduals.push(name);
    else disposition.unaccounted.push(name);
  }
  return disposition;
}
