// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
// PX-390 @verifies C001 C003
/**
 * The formulas one package owns, measured from the seed it was given.
 *
 * The denominator is shared by the smooth S8 gate and the formula-handoff detector.
 * A second copy of this filter is what let the handoff disagree with the gate about
 * whether a package owns no formula, so both import this function.
 */
import { parseSeedIdentity } from './identity.mjs';
import { extractFormulas, uniqueFormulas } from './extract.mjs';

/**
 * The formulas a package owns through its seed's source segments.
 *
 * A caller that already parsed the seed or extracted the specification passes them in,
 * so the smooth workspace loop and the handoff detector use one filter without parsing
 * the same document twice.
 *
 * @param {{ seedText?: string, specText?: string, treeManifest: object|null, seed?: object, specFormulas?: Array<object> }} input
 * @returns {{ seed: object, ranges: Array<object>, owned: Array<object>, all: Array<object>, unresolvedSegments: string[] }}
 */
export function ownedFormulasForPackage({ seedText, specText, treeManifest, seed: providedSeed = null, specFormulas = null }) {
  const seed = providedSeed ?? parseSeedIdentity(seedText);
  const segments = Array.isArray(treeManifest?.structure?.segments) ? treeManifest.structure.segments : [];
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const ranges = (seed.sourceSegments ?? []).map((id) => byId.get(id)).filter(Boolean);
  const unresolvedSegments = (seed.sourceSegments ?? []).filter((id) => !byId.has(id));
  const all = Array.isArray(specFormulas) ? specFormulas : uniqueFormulas(extractFormulas(specText));
  const owned = all.filter((formula) => ranges.some((range) => (
    formula.lineStart <= range.line_end && formula.lineEnd >= range.line_start
  )));
  return { seed, ranges, owned, all, unresolvedSegments };
}
