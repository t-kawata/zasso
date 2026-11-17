/**
 * Validate an AI-authored asset proposal against the deterministic discovery.
 *
 * The AI proposes; this module decides. A proposal cannot invent a path,
 * omit a strong signal, override a secret/CJK policy, or drop a link without
 * evidence.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ASSET_CODES } from './constants.mjs';
import { measureAsset } from './measure.mjs';
import { classifyAsset } from './classify.mjs';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function finding(code, path, reason, extra = {}) {
  return { code, path, reason, severity: 'error', ...extra };
}

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function measureAt(root, relativePath) {
  return measureAsset({
    absolutePath: join(root, relativePath),
    relativePath,
    root,
  });
}

/**
 * @param {{proposal:object, discovery:object, root:string}} input
 */
export function validateSemanticProposal({ proposal, discovery, root, policy = {} }) {
  const findings = [];
  if (proposal?.schema !== 'okf-asset-plan/v1') {
    findings.push(finding(ASSET_CODES.SEMANTIC_PATH_MISSING, '', 'proposal schema is invalid'));
  }
  const baseIncluded = new Map((discovery?.included ?? []).map((entry) => [entry.path, entry]));
  const proposedIncludes = new Map((proposal?.include ?? []).map((entry) => [entry.path, entry]));
  const proposedExcludes = new Map((proposal?.exclude ?? []).map((entry) => [entry.path, entry]));

  for (const item of proposal?.include ?? []) {
    if (!item.path || !existsSync(join(root, item.path))) {
      findings.push(finding(ASSET_CODES.SEMANTIC_PATH_MISSING, item.path ?? '', 'proposed path does not exist'));
      continue;
    }
    if (!item.governing) {
      findings.push(finding(ASSET_CODES.SEMANTIC_UNLINKED, item.path, 'proposed asset has no governing concept'));
    }
    const measured = measureAt(root, item.path);
    const decision = classifyAsset(measured, policy);
    if (!decision.include) {
      findings.push(
        finding(ASSET_CODES.SEMANTIC_POLICY_VIOLATION, item.path, `policy: ${decision.code}`),
      );
    }
    if (item.confidence === 'low') {
      findings.push(
        finding(ASSET_CODES.SEMANTIC_LOW_CONFIDENCE, item.path, 'low-confidence addition', {
          severity: policy.lowConfidence === 'exclude' ? 'error' : 'warning',
        }),
      );
    }
  }

  for (const path of baseIncluded.keys()) {
    if (!proposedIncludes.has(path) && !proposedExcludes.has(path)) {
      findings.push(finding(ASSET_CODES.SEMANTIC_OMISSION, path, 'strong-signal asset is not decided'));
    }
  }

  for (const [path, item] of proposedExcludes) {
    if (baseIncluded.has(path) && !item.quote) {
      findings.push(
        finding(ASSET_CODES.SEMANTIC_EXCLUSION_UNREVIEWED, path, 'strong-signal exclusion has no evidence'),
      );
    }
  }

  const ok = findings.every((entry) => entry.severity !== 'error');
  const included = [...baseIncluded.values()];
  for (const item of proposal?.include ?? []) {
    if (!item.path || included.some((entry) => entry.path === item.path)) continue;
    if (!existsSync(join(root, item.path))) continue;
    const measured = measureAt(root, item.path);
    const decision = classifyAsset(measured, policy);
    if (!decision.include) continue;
    included.push({
      ...measured,
      type: decision.type,
      selectedBy: 'semantic',
      evidence: item.quote ?? '',
      confidence: item.confidence ?? 'medium',
      governingConcepts: item.governing ? [item.governing] : [],
    });
  }
  const excluded = [...(discovery?.excluded ?? [])];
  for (const item of proposal?.exclude ?? []) {
    excluded.push({
      path: item.path,
      code: ASSET_CODES.SEMANTIC_EXCLUDED,
      reason: item.reason ?? 'excluded by semantic proposal',
    });
  }
  return {
    ok,
    findings,
    discovery: {
      ...(discovery ?? {}),
      mode: 'semantic',
      roots: [...new Set(included.map((entry) => entry.path.split('/')[0]))].sort(),
      included,
      excluded,
      proposalPath: null,
      counts: {
        included: included.length,
        excluded: excluded.length,
        ambiguous: discovery?.ambiguous?.length ?? 0,
        bytes: included.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
      },
    },
  };
}
