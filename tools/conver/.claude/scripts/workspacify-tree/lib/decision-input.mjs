// [::TICKET::] PX-177 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`.
/**
 * AI decision input contract.
 *
 * The AI operator authors design decisions (workspace, ownership,
 * dependencies, adapters, REVIEW approvals) as a JSON file. This module loads
 * the file and validates it against the decisions schema, giving the operator
 * fast feedback before the gate pipeline runs.
 */
import { readFileSync } from 'node:fs';

import { WorkSpacifyTreeError } from './errors.mjs';
import { loadSchema, validateAgainstSchema } from './manifest-schema.mjs';

/**
 * Read and parse a decision input file.
 *
 * @param {string} absPath - absolute path to the decisions JSON file
 * @returns {object} parsed decisions
 */
export function loadDecisionInput(absPath) {
  let rawText;
  try {
    rawText = readFileSync(absPath, 'utf8');
  } catch {
    throw new WorkSpacifyTreeError(`cannot read decision input: ${absPath}`, { gateId: 'G3', exitCode: 1 });
  }
  try {
    return JSON.parse(rawText);
  } catch {
    throw new WorkSpacifyTreeError(`decision input is not valid JSON: ${absPath}`, { gateId: 'G3', exitCode: 1 });
  }
}

/**
 * Validate decision input against the decisions schema.
 *
 * @param {object} decisions - parsed decisions object
 * @returns {{ ok: boolean, errors: Array<object> }}
 */
export function assertDecisionSchema(decisions) {
  const schema = loadSchema('workspacify-tree-decisions.schema.json');
  const result = validateAgainstSchema(decisions, schema);
  return { ok: result.valid, errors: result.errors };
}
