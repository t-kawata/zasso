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
