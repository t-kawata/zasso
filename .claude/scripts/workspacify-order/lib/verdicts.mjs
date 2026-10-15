/**
 * Read each package directory and judge what its own documents account for.
 *
 * The reader is total on purpose. The plan exists to describe a workspace, so a directory the
 * operator can see in the plan but the reader cannot open is answered rather than raised: a
 * missing view is `not-yet` with the reason that says so, an unparseable one is `failed`, and a
 * package whose directory was deleted between the manifest and the run still receives a verdict.
 * A reader that threw would replace the picture with a stack trace, which is the one outcome the
 * plan's own contract — stdout is the picture and nothing else — does not allow.
 *
 * The measurement is not repeated here. Each package's material comes from the readers the gates
 * already use: `readLedgers` for the parsed view, the refused ledger and the locations that do
 * not resolve, `measureDischarge` for the units a ledger omits, and `findDeclarationsThatDidNotBind`
 * for a declaration that bound to nothing. Judging from a second reading of the same files is how
 * a picture and a gate come to disagree about one workspace, so there is only one reading.
 *
 * One directory is passed to `readLedgers` at a time. Its maps are keyed by the package id the
 * view carries, and asking about one directory at a time means a view written into the wrong
 * directory cannot be read as its neighbour's — a question the plan has no way to answer from a
 * whole-workspace reading.
 *
 * Design context: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { findDeclarationsThatDidNotBind } from '../../grill-me-for-rfc/check-obligation-coverage.js';
import { readLedgers } from '../../grill-me-for-rfc/check-ledger-discharge.js';
import { VIEW_JSON_NAME, collectUnitIds } from '../../sequences-slice/lib/material.mjs';
import { measureDischarge } from '../../sequences-slice/lib/obligation-coverage.mjs';
import { judgeSequenceOf } from '../../sequences-slice/lib/package-verdict.mjs';

/**
 * One package's view, told apart from a view that cannot be read.
 *
 * The parse itself is `readLedgers`'s, so there is nothing here to disagree with it about. What
 * the gate discards is the difference this reader needs: it drops an unparseable view the same way
 * it drops an absent one, and those are two different verdicts.
 *
 * @returns {{ view: object|null, readError: string|null }}
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function readView(material, viewPath) {
  const view = material.views[0] ?? null;
  if (view !== null) return { view, readError: null };
  return { view: null, readError: existsSync(viewPath) ? `${VIEW_JSON_NAME} is present and cannot be read` : null };
}

/** Judge one package directory from the material the gates' readers produce for it. */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
function judgeDirectory(directory) {
  const material = readLedgers([directory]);
  const measured = measureDischarge({ views: material.views, ledgersByPackage: material.ledgers });
  const { view, readError } = readView(material, join(directory, VIEW_JSON_NAME));

  // A ledger that was found and refused is not a ledger that is missing, and reporting it as both
  // would name two repairs for one defect — the rule check-ledger-discharge.js states when it
  // filters the same two families apart.
  const ledgerRefusedReason = material.malformed[0]?.reason ?? null;

  return judgeSequenceOf({
    view,
    readError,
    unitIds: view === null ? [] : collectUnitIds(view),
    withoutLedger: ledgerRefusedReason === null && measured.withoutLedger.length > 0,
    ledgerRefusedReason,
    unaccountedUnitIds: measured.unaccounted[0]?.unitIds ?? [],
    unresolvedLocations: material.locations.map((entry) => entry.location),
    declarationDidNotBind: findDeclarationsThatDidNotBind(material.views).length > 0,
  });
}

/**
 * The verdict of every package a workspace's manifest names.
 *
 * Keyed by the manifest's own id rather than by whatever a view calls itself, because the plan
 * prints the manifest's packages: a view whose packageId named something else still belongs to
 * the directory it sits in, and judging it under its own name would leave the printed line
 * without an answer.
 *
 * @param {{ root: string, packages: Array<{ id: string, path: string }> }} input
 * @returns {Map<string, { state: string, reason: string|null }>}
 */
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
export function readSequenceVerdicts({ root, packages }) {
  const verdicts = new Map();
  for (const pkg of packages ?? []) {
    verdicts.set(pkg.id, judgeDirectory(join(root, pkg.path)));
  }
  return verdicts;
}
