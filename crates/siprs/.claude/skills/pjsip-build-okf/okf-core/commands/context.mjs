/**
 * Context commands expose the required set and the assembled payload.
 */

import { resolveRequired } from '../context/resolve-required.mjs';
import { buildContext } from '../context/assemble.mjs';

export function requiredSet({ bundle, entryIds, additionalRequires, profile }) {
  return resolveRequired({ bundle, entryIds, additionalRequires, profile });
}

export function contextArtifact({ bundle, entryIds, budgetBytes, now, additionalRequires, profile }) {
  const required = resolveRequired({ bundle, entryIds, additionalRequires, profile });
  return { required, artifact: buildContext({ bundle, requiredSet: required, budgetBytes, now }) };
}
