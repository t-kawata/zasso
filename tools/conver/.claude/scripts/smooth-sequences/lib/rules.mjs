/**
 * The workspace vocabulary a smooth-sequences run reads.
 *
 * A terminal status name and an interface name are project vocabulary, not properties of
 * the detector. The workspace declares its own names in SMOOTH-SEQUENCES-RULES.json, and
 * an undeclared key is withheld with a named reason rather than guessed. The file is
 * optional: a project that declares nothing still gets every structural check, and the
 * two vocabulary checks are reported as withheld instead of silently passing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from './errors.mjs';

export const RULES_FILE_NAME = 'SMOOTH-SEQUENCES-RULES.json';
export const RULES_SCHEMA_VERSION = 1;

const TERMINAL_STATUS_CHECK = 'S3.terminal-status';
const INTERFACE_MAPPING_CHECK = 'S3.interface-mapping';

/** One withheld-surface record, shaped the same way every other withheld entry is. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function buildWithheldEntry(check, declaration) {
  return {
    layer: 'rules',
    check,
    reason: `${declaration} is not declared in ${RULES_FILE_NAME}`,
  };
}

/** The withheld record for a rules file that declares neither vocabulary. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function buildAbsentRulesWithheld() {
  return [
    buildWithheldEntry(TERMINAL_STATUS_CHECK, 'terminalStatuses'),
    buildWithheldEntry(INTERFACE_MAPPING_CHECK, 'requiredInterfaces'),
  ];
}

/** The error a malformed rules file raises. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function buildUnreadableRulesError(filePath, detail) {
  return new SmoothSequencesError(`${RULES_FILE_NAME} is not valid: ${filePath}`, {
    code: 'UNREADABLE_RULES',
    path: filePath,
    repair: `Repair ${RULES_FILE_NAME} (${detail}) or remove it so the vocabulary checks are withheld.`,
  });
}

/** A declared list of non-empty strings, de-duplicated in first-seen order, or null. */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function readDeclaredNames(value, fieldName, filePath) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw buildUnreadableRulesError(filePath, `${fieldName} must be an array of non-empty strings`);
  }
  const names = [];
  for (const entry of value) {
    const name = entry.trim();
    if (!names.includes(name)) names.push(name);
  }
  return Object.freeze(names);
}

/**
 * Load the workspace rules.
 *
 * @param {string} root — the workspace root holding the two manifests
 * @returns {{ terminalStatuses: string[]|null, requiredInterfaces: string[]|null,
 *   withheld: Array<{layer: string, check: string, reason: string}> }}
 */
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
export function loadRules(root) {
  const filePath = join(root, RULES_FILE_NAME);
  if (!existsSync(filePath)) {
    return Object.freeze({ terminalStatuses: null, requiredInterfaces: null, withheld: Object.freeze(buildAbsentRulesWithheld()) });
  }

  let document;
  try {
    document = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw buildUnreadableRulesError(filePath, error.message);
  }
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw buildUnreadableRulesError(filePath, 'the document must be a JSON object');
  }
  if (document.schemaVersion !== RULES_SCHEMA_VERSION) {
    throw buildUnreadableRulesError(filePath, `schemaVersion must be ${RULES_SCHEMA_VERSION}`);
  }

  const terminalStatuses = readDeclaredNames(document.terminalStatuses, 'terminalStatuses', filePath);
  const requiredInterfaces = readDeclaredNames(document.requiredInterfaces, 'requiredInterfaces', filePath);
  const withheldEntries = [];
  if (terminalStatuses === null) withheldEntries.push(buildWithheldEntry(TERMINAL_STATUS_CHECK, 'terminalStatuses'));
  if (requiredInterfaces === null) withheldEntries.push(buildWithheldEntry(INTERFACE_MAPPING_CHECK, 'requiredInterfaces'));

  return Object.freeze({
    terminalStatuses,
    requiredInterfaces,
    withheld: Object.freeze(withheldEntries),
  });
}
