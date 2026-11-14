/**
 * Facet profiles declare what a complete one-hop answer contains.
 *
 * A profile is data: the traversal engine reads requiredFacets and facetKinds
 * and never invents a requirement. A skill that needs a different definition
 * adds a profile instead of branching inside the engine.
 */

import defaultProfile from './default.json' with { type: 'json' };
import lawImplement from './law-implement.json' with { type: 'json' };
import lawReview from './law-review.json' with { type: 'json' };
import lawWiki from './law-wiki.json' with { type: 'json' };
import okfWiki from './okf-wiki.json' with { type: 'json' };

const PROFILES = new Map([
  ['default', defaultProfile],
  ['law-implement', lawImplement],
  ['law-review', lawReview],
  ['law-wiki', lawWiki],
  ['okf-wiki', okfWiki],
]);

export function loadProfile(name = 'default') {
  if (typeof name === 'object' && name !== null) return name;
  const profile = PROFILES.get(String(name));
  if (!profile) throw Object.assign(new Error(`unknown profile: ${name}`), { code: 'UNKNOWN_PROFILE' });
  return profile;
}

export function listProfiles() {
  return [...PROFILES.keys()].sort();
}
