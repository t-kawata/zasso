// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-460 --for-spec --no-implementation-order` alternate form.
// ledger-discharge-reader.mjs — the pure reading behind the discharge gate.
//
// `check-ledger-discharge.js` is a program. Its readers are also consumed by the pipeline
// marks (and through them by the conver bundle), so they live here: importing a program for
// one reader would execute the program. The gate keeps its rendering and entry point.

import fs from 'node:fs';
import path from 'node:path';

import { readDistributionLedger } from '../../sequences-slice/lib/distribution-ledger.mjs';
import { resolveGround, sectionIdentifiersOf } from '../../sequences-slice/lib/obligation-ground.mjs';
import { VIEW_JSON_NAME, collectUnitIds } from '../../sequences-slice/lib/material.mjs';
import { packageDirectoriesOf } from '../../sequences-slice/lib/package-directories.mjs';

/** The document a package's distribution ledger is an appendix of. */
export const RFC_FILENAME = 'RFC.md';

/** The manifest that names each package directory, including the workspace root as ".". */
export const TREE_MANIFEST_FILENAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** Read and parse one JSON file, or null when it cannot be read. */
export function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Read a text file, or null when it cannot be read. */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function readTextOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Every package directory the workspace names that carries a view, in manifest path order.
 *
 * The tree manifest is the authority, including for the workspace root when its path is ".".
 * When the manifest is absent or carries no package list, the walk falls back to the crates
 * directory; a root view in that state is a stray file and is not read.
 */
export function findPackageDirectories(root, treeManifest = undefined) {
  const manifest = treeManifest === undefined ? readJsonOrNull(path.join(root, TREE_MANIFEST_FILENAME)) : treeManifest;
  return packageDirectoriesOf(root, manifest, { fallbackMarkers: [VIEW_JSON_NAME] })
    .map((entry) => entry.directory)
    .filter((directory) => fs.existsSync(path.join(directory, VIEW_JSON_NAME)));
}

/** The document a ledger lives in, as the resolver reads one: its own line count and nothing else. */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function documentViewOf(rfcText) {
  return { spec: { lines: String(rfcText).split('\n').length }, sections: [], operations: [], sequences: [] };
}

/**
 * The units each package's ledger accounts for, and the packages whose ledger cannot be read.
 *
 * The parser answers three states and this keeps them apart rather than collapsing them into one
 * finding, because the repairs differ: a package with no ledger has not been grilled yet, a
 * package with a malformed ledger has written one the gate refuses, and a package whose ledger is
 * well formed but short has accounted for a subset of what it was handed.
 *
 * @param {string[]} directories
 * @returns {{ ledgers: Map<string, Set<string>>, malformed: Array<{ packageId: string, reason: string }>, views: object[] }}
 */
export function readLedgers(directories) {
  const ledgers = new Map();
  const malformed = [];
  const locations = [];
  const ledgerRows = new Map();
  const views = [];

  for (const directory of directories) {
    const view = readJsonOrNull(path.join(directory, VIEW_JSON_NAME));
    if (view === null) continue;
    views.push(view);

    const unitIds = collectUnitIds(view);
    if (unitIds.length === 0) continue;

    const rfcText = readTextOrNull(path.join(directory, RFC_FILENAME));
    if (rfcText === null) continue;

    const verdict = readDistributionLedger(rfcText, new Set(unitIds));
    if (verdict === null) continue;
    if (!verdict.ok) {
      malformed.push({ packageId: String(view.packageId), reason: verdict.reason });
      continue;
    }
    ledgers.set(String(view.packageId), new Set(verdict.rows.map((row) => row.unit)));
    ledgerRows.set(String(view.packageId), { rows: verdict.rows, rfcText });

    // A location is resolved against the document it lives in, which is the only place its labels
    // exist. Only a location that cites something and contradicts the document is reported: one that
    // cites nothing was accepted before this and is still accepted, so a tightening does not become
    // a new obligation on rows nobody wrote as citations.
    const labels = sectionIdentifiersOf(rfcText);
    for (const row of verdict.rows) {
      const { unresolved } = resolveGround(row.location, documentViewOf(rfcText), { sections: labels });
      if (unresolved.length > 0) locations.push({ packageId: String(view.packageId), location: String(row.location), unresolved });
    }
  }
  return { ledgers, ledgerRows, malformed, locations, views };
}
