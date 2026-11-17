// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
/**
 * Link enforcement assets to rule ids.
 *
 * An explicit ruleIds list wins; otherwise a rule that names the asset in its
 * verification or statement claims it. An unlinked enforcement asset is a
 * finding, not a silent omission.
 */

import { ASSET_CODES } from '../okf-asset/constants.mjs';

export function linkAssetsToRules({ assets = [], rules = [] }) {
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const links = [];
  const findings = [];
  for (const asset of assets) {
    const explicit = (asset.ruleIds ?? []).filter((id) => ruleIds.has(id));
    const matched = explicit.length
      ? explicit
      : rules
          .filter((rule) => {
            const text = `${rule.verification ?? ''} ${rule.statement ?? ''}`;
            return text.includes(asset.path) || text.includes(asset.path.split('/').pop() ?? '');
          })
          .map((rule) => rule.id);
    const linked = [...new Set(matched)];
    links.push({ asset: asset.path, rules: linked });
    if (linked.length === 0) {
      findings.push({
        code: ASSET_CODES.RULE_UNLINKED,
        path: asset.path,
        reason: 'asset has no rule link',
      });
    }
  }
  return { links, findings };
}
