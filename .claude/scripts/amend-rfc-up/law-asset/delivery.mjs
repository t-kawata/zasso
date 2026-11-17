// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Bind fact-bearing assets to the law delivery ledger.
 *
 * A Procedure asset is fact-bearing. It is delivered as must, or as a
 * reference with an explicit delivered_by. Anything else is an omission.
 */

import { ASSET_CODES } from '../okf-asset/constants.mjs';

export function applyAssetDelivery({ assets = [], delivery = {} }) {
  const entries = [...(delivery.entries ?? [])];
  const byAsset = new Map(entries.map((entry) => [entry.asset, entry]));
  const findings = [];
  for (const asset of assets) {
    const factBearing = asset.type === 'Procedure';
    if (!factBearing) continue;
    const entry = byAsset.get(asset.path);
    if (!entry) {
      findings.push({
        code: ASSET_CODES.DELIVERY_OMISSION,
        path: asset.path,
        reason: 'fact-bearing asset has no delivery decision',
      });
      continue;
    }
    if (entry.mode === 'reference' && !entry.deliveredBy) {
      findings.push({
        code: ASSET_CODES.DELIVERY_OMISSION,
        path: asset.path,
        reason: 'reference delivery has no delivered_by',
      });
    }
  }
  return { entries, findings };
}
