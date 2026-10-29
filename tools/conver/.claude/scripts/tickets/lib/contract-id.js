/**
 * contract-id.js — the one contract identifier grammar the ticket pipeline accepts.
 *
 * An edge contract carries a C-format id (C001). A registry boundary contract carries
 * `contract-<boundary_id>` because the allocate registry's `contract_id` is that value and
 * renumbering it would sever the projection. The validator, the Gate S/R annotation
 * scanner and the JSON schema must agree on this set; this module is the single source for
 * the first two, and tickets-schema.json mirrors it.
 */

const CONTRACT_ID_PATTERN = '^(?:C\\d{3}|contract-[A-Za-z0-9_.-]+)$';
const CONTRACT_ID_SOURCE = '(?:C\\d{3}|contract-[A-Za-z0-9_.-]+)';
const CONTRACT_ID_REGEX = new RegExp(CONTRACT_ID_PATTERN);

/**
 * Whether a value is a contract id this pipeline can emit.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function isContractId(value) {
  return typeof value === 'string' && CONTRACT_ID_REGEX.test(value);
}

module.exports = {
  CONTRACT_ID_PATTERN,
  CONTRACT_ID_SOURCE,
  CONTRACT_ID_REGEX,
  isContractId,
};
