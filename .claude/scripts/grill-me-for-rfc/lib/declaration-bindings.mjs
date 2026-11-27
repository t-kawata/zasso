// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-460 --for-spec --no-implementation-order` alternate form.
// declaration-bindings.mjs — the pure declaration-binding rule, free of the gate's CLI.
//
// `check-obligation-coverage.js` is a program; importing it for this one predicate used to
// execute the program when a library consumer (the pipeline marks, and through them the
// conver bundle) pulled it in. The rule is one expression, so it lives here and both the
// gate and the reader import it.

import { OBLIGATION_SOURCES } from '../../sequences-slice/lib/obligation.mjs';

/** The source name that marks a view as carrying declarations of its own. */
const DECLARED_SOURCE = OBLIGATION_SOURCES[0];

/**
 * The packages whose view declares obligation units that bound to nothing.
 *
 * @param {Array<object>} views — parsed per-package views
 * @returns {string[]} — the package ids, stringified
 */
export function findDeclarationsThatDidNotBind(views) {
  return views
    .filter((view) => view?.obligationSource === DECLARED_SOURCE && (view.obligationUnits ?? []).length === 0)
    .map((view) => String(view.packageId));
}
