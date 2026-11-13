// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C009
/**
 * Shared engine drift guard.
 *
 * The OKF engine copies stable law modules at build time. This check proves the
 * copy and the law original still share one byte sequence. A drift is a build
 * failure, never an automatic overwrite.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './redact.mjs';

/** Remove the provenance header before comparing semantic module bytes. */
export function normalizeSharedModule(text) {
  return String(text).split('\n').filter((line) => !line.startsWith('// [::TICKET::]')).join('\n');
}

export function assertEngineDrift({ engineDir, lawSkillDir, mutate = null }) {
  const manifest = JSON.parse(readFileSync(join(engineDir, 'source/shared-engine.json'), 'utf8'));
  if (manifest.schema !== 'okf-shared-engine/v1' || !Array.isArray(manifest.modules)) {
    throw Object.assign(new Error('shared-engine manifest is invalid'), { code: 'ENGINE_DRIFT' });
  }
  for (const entry of manifest.modules) {
    const copyText = normalizeSharedModule(readFileSync(join(engineDir, entry.copy), 'utf8'));
    let lawText = normalizeSharedModule(readFileSync(join(lawSkillDir, 'scripts/lib', entry.law), 'utf8'));
    if (mutate === entry.law) lawText += '\n// drift\n';
    if (sha256(copyText) !== entry.sha256 || sha256(lawText) !== entry.sha256) {
      throw Object.assign(new Error(`shared module drifted: ${entry.copy} / ${entry.law}`), { code: 'ENGINE_DRIFT' });
    }
  }
  return true;
}
