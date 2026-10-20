/**
 * The vocabulary a smooth-sequences run judges.
 *
 * A terminal status name and an interface name are workspace facts, not properties of the
 * detector. The artifact may state them in `vocabulary`; when it does not, this module
 * derives them from the records the workspace already carries: the active operation status
 * graphs, the allocate manifest's declared interface columns, and the operation columns the
 * artifact pins as an interface surface. A vocabulary no record states is withheld with a
 * named reason, so an absent answer is never read as a pass.
 */
import { collectCandidateColumns } from '../../sequences-slice/lib/obligation.mjs';

import { SmoothSequencesError } from './errors.mjs';

export const VOCABULARY_FIELD = 'vocabulary';
export const TERMINAL_STATUS_CHECK = 'S3.terminal-status';
export const INTERFACE_MAPPING_CHECK = 'S3.interface-mapping';

const ACTIVE_DISPOSITION = 'active';
const DECLARED_INTERFACES_FIELD = 'declared_interfaces';
const WITHHELD_LAYER = 'vocabulary';

/** One withheld-surface record, shaped the same way every other withheld entry is. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function buildWithheldEntry(check, reason) {
  return { layer: WITHHELD_LAYER, check, reason };
}

/** The error a declaration that violates its shape raises. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function invalidVocabulary(artifactPath, detail) {
  return new SmoothSequencesError(`${VOCABULARY_FIELD} is not valid in ${artifactPath}: ${detail}`, {
    code: 'INVALID_VOCABULARY',
    path: artifactPath,
    repair: `Declare ${VOCABULARY_FIELD} as an object of non-empty string arrays, or remove it so the detector derives the names.`,
  });
}

/** A declared list of non-empty strings, de-duplicated in first-seen order, or null. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function readDeclaredNames(value, fieldName, artifactPath) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw invalidVocabulary(artifactPath, `${VOCABULARY_FIELD}.${fieldName} must be an array of non-empty strings`);
  }
  const names = [];
  for (const entry of value) {
    const name = entry.trim();
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** The two declared lists, each null when the field is absent or null. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function readDeclaredVocabulary(artifact, artifactPath) {
  const declared = artifact?.[VOCABULARY_FIELD];
  if (declared === undefined || declared === null) return { terminalStatuses: null, requiredInterfaces: null };
  if (typeof declared !== 'object' || Array.isArray(declared)) {
    throw invalidVocabulary(artifactPath, `${VOCABULARY_FIELD} must be an object`);
  }
  return {
    terminalStatuses: readDeclaredNames(declared.terminalStatuses, 'terminalStatuses', artifactPath),
    requiredInterfaces: readDeclaredNames(declared.requiredInterfaces, 'requiredInterfaces', artifactPath),
  };
}

/**
 * The statuses an active operation ends at.
 *
 * A status with an empty target list is terminal in that operation. The union is what makes
 * the check non-circular: if one operation ends at a status and another leaves it, the
 * second is the contradiction, and deriving per operation would never see it.
 */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function deriveTerminalStatuses(artifact) {
  const names = [];
  let sawStatusGraph = false;
  for (const operation of artifact?.operations ?? []) {
    if (operation?.disposition !== ACTIVE_DISPOSITION) continue;
    const transitions = operation.allowed_status_transitions;
    if (transitions === null || typeof transitions !== 'object' || Array.isArray(transitions)) continue;
    sawStatusGraph = true;
    for (const [source, targets] of Object.entries(transitions)) {
      if (Array.isArray(targets) && targets.length === 0 && !names.includes(source)) names.push(source);
    }
  }
  return sawStatusGraph && names.length > 0 ? names : null;
}

/** The interface columns the allocate manifest declares, in first-seen order. */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function declaredInterfaceColumns(allocateManifest) {
  const declared = allocateManifest?.[DECLARED_INTERFACES_FIELD];
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) return [];
  const columns = [];
  for (const entries of Object.values(declared)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const column = entry?.column;
      if (typeof column !== 'string' || column.trim() === '') continue;
      const name = column.trim();
      if (!columns.includes(name)) columns.push(name);
    }
  }
  return columns;
}

/**
 * The interface columns, from the declaration the workspace owns.
 *
 * The allocate manifest is preferred because it states which columns are interfaces without
 * reading the operations the check will judge. The pins are the fallback: a column whose
 * value instantiates a pinned vocabulary is an interface surface even when no manifest names
 * it. Neither source ever consults whether an operation carries the column, so a missing
 * mapping stays a finding rather than shrinking the required set.
 */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
function deriveRequiredInterfaces(artifact, allocateManifest) {
  const declared = declaredInterfaceColumns(allocateManifest);
  if (declared.length > 0) return declared;
  const activeArtifact = {
    ...artifact,
    operations: (artifact?.operations ?? []).filter((operation) => operation?.disposition === ACTIVE_DISPOSITION),
  };
  const pinned = collectCandidateColumns(activeArtifact);
  return pinned.length > 0 ? pinned : null;
}

/**
 * Load the vocabulary a workspace states or implies.
 *
 * @param {{ artifact: object, artifactPath: string, allocateManifest: object }} input
 * @returns {{ terminalStatuses: string[]|null, requiredInterfaces: string[]|null,
 *   withheld: Array<{layer: string, check: string, reason: string}> }}
 */
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
export function loadVocabulary({ artifact, artifactPath, allocateManifest }) {
  const declared = readDeclaredVocabulary(artifact, artifactPath);
  const terminalStatuses = declared.terminalStatuses ?? deriveTerminalStatuses(artifact);
  const requiredInterfaces = declared.requiredInterfaces ?? deriveRequiredInterfaces(artifact, allocateManifest);

  const withheld = [];
  if (terminalStatuses === null) {
    withheld.push(buildWithheldEntry(
      TERMINAL_STATUS_CHECK,
      `terminalStatuses is not declared in ${VOCABULARY_FIELD} and no active operation status graph ends at a status`,
    ));
  }
  if (requiredInterfaces === null) {
    withheld.push(buildWithheldEntry(
      INTERFACE_MAPPING_CHECK,
      `requiredInterfaces is not declared in ${VOCABULARY_FIELD}, no ${DECLARED_INTERFACES_FIELD} column exists, and no pinned operation column names an interface`,
    ));
  }

  return Object.freeze({
    terminalStatuses,
    requiredInterfaces,
    withheld: Object.freeze(withheld),
  });
}
