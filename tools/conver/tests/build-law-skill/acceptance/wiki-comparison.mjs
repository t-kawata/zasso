// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
/**
 * Build the same 19 source documents as a plain *-okf wiki so the law and
 * wiki bundles can be compared on one OKF core.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMiniSkillV2 } from '../../build-okf-skill/lib/fixture-v2.mjs';

export async function buildWikiFromSources({ repoRoot, sourceRoot = 'docs/archive/IMPLEMENTATION-SPEC' } = {}) {
  const sourceDir = join(repoRoot, sourceRoot);
  const names = [
    '00-FOUNDATION.md', '10-CONTRACTS.md', '15-RULE-REGISTRY.md', '20-CORE.md',
    '21-OPERATION.md', '22-IDENTITY.md', '30-REST.md', '31-WEBSOCKET.md', '32-CLI.md',
    '33-GRPC.md', '34-MCP.md', '35-A2A.md', '40-CONFORMANCE.md', '45-DOCUMENTATION.md',
    '47-VALIDATION.md', '48-IMPLEMENTATION-BLUEPRINT.md', '50-PROJECT-TEMPLATE.md',
    '55-IMPLEMENTATION-CONTRACTS.md', '90-MIGRATION.md',
  ];
  const sources = Object.fromEntries(names.map((name) => [name, readFileSync(join(sourceDir, name), 'utf8')]));
  const skill = await buildMiniSkillV2({ sources, name: 'rust-interface-okf' });
  return { ...skill, core: 'okf-core' };
}
