// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C002
/**
 * Lock, manifest, and coverage ledgers.
 *
 * The lock is the authoritative node list. Every other artifact is derived from
 * it so a rebuild can be compared byte for byte.
 */

import { sha256 } from './redact.mjs';
import { SPEC_VERSION } from './limits.mjs';

export function buildLock({ measured, claims, registry }) {
  const sourceSha = new Map(measured.manifest.map((entry) => [entry.alias, entry.sha256]));
  const nodes = claims.map((claim) => ({
    id: claim.id,
    type: claim.type,
    topic: claim.topic,
    summary: claim.claim,
    text: claim.evidence,
    sources: [claim.source],
    source_sha256: sourceSha.get(claim.source),
    span: claim.span,
    headingPath: claim.headingPath,
    content_sha256: claim.content_sha256,
    links: [],
    conflicts: [],
    supersedes: [],
  }));
  const topics = [...new Set(nodes.map((node) => node.topic))].sort();
  return {
    schema: 'okf-atoms-lock/v1',
    spec_version: SPEC_VERSION,
    sources: measured.manifest.map((entry) => ({ alias: entry.alias, sha256: entry.sha256 })),
    topics,
    nodes,
    claims: registry,
    closure_sha256: sha256(nodes.map((node) => node.id).sort().join('\n')),
  };
}

export function renderManifestToml({ lock }) {
  const sourceSet = lock.sources
    .slice()
    .sort((left, right) => left.alias.localeCompare(right.alias))
    .map((entry) => `${entry.alias}\0${entry.sha256}`)
    .join('\n');
  const lines = [
    `spec_version = "${lock.spec_version}"`,
    `source_set_sha256 = "${sha256(sourceSet)}"`,
    '',
  ];
  for (const entry of lock.sources) {
    lines.push('[[file]]');
    lines.push(`path = "${entry.alias}"`);
    lines.push(`sha256 = "${entry.sha256}"`);
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

export function renderClaimInventory({ claims }) {
  return {
    schema: 'okf-claim-inventory/v1',
    entries: claims.map((claim) => ({
      id: claim.id,
      source: claim.source,
      span: claim.span,
      content_sha256: claim.content_sha256,
    })),
  };
}

export function renderKnowledgeCoverage({ lock }) {
  return {
    schema: 'okf-knowledge-coverage/v1',
    defaults: { Claim: 'must', CodeBlock: 'must' },
    entries: lock.nodes.map((node) => ({
      id: node.id,
      topic: node.topic,
      source: node.sources[0],
      decision: 'must',
    })),
  };
}
