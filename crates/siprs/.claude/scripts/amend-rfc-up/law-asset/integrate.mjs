// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Integrate discovered assets into a law skill.
 *
 * This is the missing bridge between the shared asset loader and the law
 * registry: it links assets to rules, applies delivery decisions, renders the
 * asset concepts with x-enforces, and builds the asset ledgers.
 */

import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { discoverAssets } from '../okf-asset/discover.mjs';
import { renderAssetConcept } from '../okf-asset/render.mjs';
import { buildAssetLedgers } from '../okf-asset/ledger.mjs';
import { linkAssetsToRules } from './rule-link.mjs';
import { applyAssetDelivery } from './delivery.mjs';

export function integrateLawAssets(input = {}) {
  const {
    sourceRoot,
    sourcePaths = [],
    freeForm = '',
    manifest = null,
    policy = {},
    rules = [],
    delivery = {},
    ruleConcepts = {},
  } = input;
  const discovery = discoverAssets({
    sourcePaths,
    sourceRoot,
    freeForm,
    manifest,
    policy,
  });
  const links = linkAssetsToRules({ assets: discovery.included, rules });
  const linksByAsset = new Map(links.links.map((link) => [link.asset, link.rules]));
  const deliveryResult = applyAssetDelivery({ assets: discovery.included, delivery });
  const concepts = [];
  const ledgerAssets = [];
  for (const asset of discovery.included) {
    const ruleIds = linksByAsset.get(asset.path) ?? [];
    const requires = ruleIds.map((id) => ruleConcepts[id] ?? `rules/${id}`);
    const concept = renderAssetConcept({
      measurement: asset,
      meta: {
        type: asset.type,
        description: `Enforcement asset ${asset.path}`,
        requires,
        extraFrontmatter: { 'x-enforces': ruleIds },
      },
    });
    concepts.push(concept);
    ledgerAssets.push({ ...asset, conceptId: concept.id });
  }
  const ledgers = buildAssetLedgers({
    assets: ledgerAssets,
    assetRoots: discovery.roots,
  });
  return {
    discovery,
    links,
    delivery: deliveryResult,
    concepts,
    ledgers,
    findings: [...links.findings, ...deliveryResult.findings],
  };
}

export function installAssetRoots({ sourceRoot, targetRoot, assetRoots = [] }) {
  for (const assetRoot of assetRoots) {
    if (!existsSync(join(sourceRoot, assetRoot))) {
      throw Object.assign(new Error(`asset root missing: ${assetRoot}`), {
        code: 'ASSET_INSTALL_MISSING',
      });
    }
    cpSync(join(sourceRoot, assetRoot), join(targetRoot, assetRoot), { recursive: true });
  }
}
