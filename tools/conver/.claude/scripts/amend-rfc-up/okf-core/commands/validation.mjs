// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * Validation commands keep conformance, lint, and profile as separate modes.
 */

import { validateConformance } from '../validation/conformance.mjs';
import { lintBundle } from '../validation/lint.mjs';
import { checkProfile } from '../validation/profile.mjs';

export function runValidation({ bundle, mode = 'conformance', profile = {}, now = new Date() }) {
  if (mode === 'conformance') return validateConformance(bundle);
  if (mode === 'lint') return lintBundle(bundle, { now });
  if (mode === 'profile') return checkProfile(bundle, profile);
  throw Object.assign(new Error(`unknown validation mode: ${mode}`), { code: 'UNKNOWN_MODE' });
}
