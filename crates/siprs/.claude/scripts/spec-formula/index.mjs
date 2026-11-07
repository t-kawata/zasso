// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The one formula vocabulary every stage imports.
 *
 * The grill proves the transcription, the graph and ticket projections carry the same
 * ids, and the workspace gate compares the whole set. One exporter here keeps those
 * consumers from growing a second parser with a second normalization rule.
 */
export { normalizeFormula } from './normalize.mjs';
export { digestFormula, formulaId, FORMULA_ID_LENGTH, FORMULA_ID_PREFIX } from './digest.mjs';
export { extractFormulas, uniqueFormulas } from './extract.mjs';
export {
  FORMULA_CLASSES,
  FORMULA_LEDGER_TITLE,
  FORMULA_SIDECAR_FILENAME,
  computeRfcDigest,
  readFormulaLedger,
  validateFormulaLedger,
  validateFormulaSidecar,
} from './ledger.mjs';
export {
  INFO_FILENAME,
  SEED_FILENAME,
  SEQUENCES_SUFFIX,
  SpecIdentityError,
  findSequencesArtifact,
  parseInfoSpecification,
  parseSeedIdentity,
  parseSequencesSpec,
  resolveWorkspaceRoot,
  verifySourceIdentity,
} from './identity.mjs';
export { ownedFormulasForPackage } from './ownership.mjs';
export {
  HANDOFF_CLASS,
  HANDOFF_CODE,
  JUDGMENT_CLASSES,
  MECHANICAL_CLASSES,
  applyFormulaHandoff,
  inspectFormulaHandoff,
  resolveSectionHeading,
  sectionMatchesHeading,
} from './handoff.mjs';
