/**
 * One package directory, read once: the material a judgement rests on, and the judgement.
 *
 * Three readers ask the same question about one directory — the implementation plan, the discharge
 * gate and the per-directory report — and they have to answer it the same way, because a report
 * that names a repair the gate does not is a report nobody can act on. So the reading lives here
 * once, and each of them receives both halves of it: the material, which names what is missing, and
 * the verdict, which says what kind of missing it is. A caller that only needs the verdict takes it
 * and ignores the rest rather than reading the directory a second time.
 *
 * The reading is total on purpose. A directory the operator can see but the reader cannot open is
 * answered rather than raised: a missing view is a verdict with the reason that says so, an
 * unparseable one is answered as failed, and a directory that was deleted between the manifest and
 * the run still receives both halves. A reader that threw would replace a picture with a stack
 * trace, which is the one outcome the plan's own contract does not allow.
 *
 * One directory is passed to `readLedgers` at a time. Its maps are keyed by the package id the view
 * carries, and asking about one directory at a time means a view written into the wrong directory
 * cannot be read as its neighbour's — a question a whole-workspace reading has no way to answer.
 *
 * Design context: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { VIEW_JSON_NAME, collectUnitIds } from '../sequences-slice/lib/material.mjs';
import { measureDischarge } from '../sequences-slice/lib/obligation-coverage.mjs';
import { judgeSequenceOf } from '../sequences-slice/lib/package-verdict.mjs';

import { findDeclarationsThatDidNotBind } from './check-obligation-coverage.js';
import { readLedgers } from './check-ledger-discharge.js';

/**
 * Whether a parsed document is a projected view at all.
 *
 * A document that parses into an array, a string or a number is not a view, and reading it as one
 * would answer for it that the projection predates the obligation carriage — the state that sends
 * the operator to the projection over a directory whose contents are what need looking at. The
 * predicate accepts the view a slice that predates the carriage wrote, which carries neither the
 * source field nor the obligation units, so the shape it insists on is the one every view has had.
 */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
function isAProjectedView(document) {
  return typeof document === 'object' && document !== null && !Array.isArray(document);
}

/**
 * One package's view, told apart from a document that is not one.
 *
 * The parse itself is the ledger reader's, so there is nothing here to disagree with it about. What
 * that reader discards is the difference this one needs: it drops a view it cannot use the same way
 * it drops an absent one, and those are two different answers — one sends the operator to the
 * projection, the other to the directory.
 *
 * @returns {{ view: object|null, readError: string|null }}
 */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
function readView(material, viewPath) {
  const parsed = material.views[0] ?? null;
  if (isAProjectedView(parsed)) return { view: parsed, readError: null };
  return {
    view: null,
    readError: existsSync(viewPath) ? `${VIEW_JSON_NAME} is present and cannot be read as a view` : null,
  };
}

/**
 * One package directory, as the material its judgement rests on and the judgement itself.
 *
 * Every value in the material is produced by a reader that already existed for it — the ledger
 * parser, the discharge measurement, the declaration reader — so this decides nothing and measures
 * nothing. A caller that judged from a second reading of the same files would be a second thing to
 * drift, and the drift would be invisible until a report and a gate disagreed.
 *
 * @param {string} directory — one package's directory
 * @returns {{ material: object, verdict: { state: string, reason: string|null } }}
 */
// [::TICKET::] PX-270 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-270 --for-spec --no-implementation-order`.
export function readPackageObligationState(directory) {
  const ledgers = readLedgers([directory]);
  const measured = measureDischarge({ views: ledgers.views, ledgersByPackage: ledgers.ledgers });
  const { view, readError } = readView(ledgers, join(directory, VIEW_JSON_NAME));

  // A ledger that was found and refused is not a ledger that is missing, and answering both the
  // same way would name two repairs for one defect — the rule the discharge gate applies when it
  // filters the same two families apart.
  const ledgerRefusedReason = ledgers.malformed[0]?.reason ?? null;

  const material = {
    view,
    readError,
    unitIds: view === null ? [] : collectUnitIds(view),
    withoutLedger: ledgerRefusedReason === null && measured.withoutLedger.length > 0,
    ledgerRefusedReason,
    unaccountedUnitIds: measured.unaccounted[0]?.unitIds ?? [],
    unresolvedLocations: ledgers.locations.map((entry) => entry.location),
    declarationDidNotBind: findDeclarationsThatDidNotBind(ledgers.views).length > 0,
  };
  return { material, verdict: judgeSequenceOf(material) };
}
