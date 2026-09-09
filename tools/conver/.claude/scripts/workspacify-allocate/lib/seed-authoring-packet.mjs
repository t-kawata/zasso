// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-190 @verifies C002
/**
 * Per-package authoring packet (corrected ALLOCATE §9.2).
 *
 * The machine cannot write seed prose, but it can hand the AI a dense packet:
 * the package identity, its owned inventory items resolved from the manifest,
 * real source excerpts sliced from the co-located specification, and the
 * dependency/forbidden-boundary context copied from the manifest edges.
 */
import { deriveExpectedAllocation, lookupInventoryItem } from './allocation-model.mjs';

/** Default half-window (in lines) for the name-occurrence excerpt fallback. */
export const DEFAULT_EXCERPT_WINDOW_LINES = 3;

/**
 * Resolve a source excerpt for an inventory item.
 *
 * A source ref with an in-bounds line range wins. When no usable ref exists,
 * the canonical name's first occurrence is wrapped in a ±windowLines window.
 * An item that cannot be pinned to the source text yields null so the author
 * treats it as REVIEW_REQUIRED instead of guessing.
 *
 * @param {{ sourceText: string, sourceRefs: Array<object>, canonicalName: string, windowLines?: number }} input
 * @returns {string|null}
 */
export function resolveSourceExcerpt({ sourceText, sourceRefs = [], canonicalName = '', windowLines = DEFAULT_EXCERPT_WINDOW_LINES }) {
  const lines = sourceText.split('\n');
  for (const ref of sourceRefs) {
    if (typeof ref.line_start === 'number' && typeof ref.line_end === 'number') {
      const start = Math.max(0, ref.line_start - 1);
      const end = Math.min(lines.length, ref.line_end);
      if (start < end) {
        return lines.slice(start, end).join('\n');
      }
    }
  }
  if (canonicalName) {
    const matchIndex = lines.findIndex((line) => line.includes(canonicalName));
    if (matchIndex >= 0) {
      const start = Math.max(0, matchIndex - windowLines);
      const end = Math.min(lines.length, matchIndex + windowLines + 1);
      return lines.slice(start, end).join('\n');
    }
  }
  return null;
}

/**
 * Build the authoring packet for one package.
 *
 * @param {{ manifest: object, sourceText: string, packageId: string }} input
 * @returns {object} authoring packet
 */
export function buildAuthoringPacket({ manifest, sourceText, packageId }) {
  const packages = manifest.workspace?.packages ?? [];
  const pkg = packages.find((candidate) => candidate.id === packageId);
  if (!pkg) {
    throw new Error(`package not found in manifest: ${packageId}`);
  }

  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace?.ownership?.entries ?? [], packages });
  const expectedItems = expectedByPackage.get(packageId);

  const ownedItems = expectedItems.map((item) => {
    const record = lookupInventoryItem(manifest, item.category, item.inventory_ref) ?? {};
    const excerpt = resolveSourceExcerpt({ sourceText, sourceRefs: record.source_refs ?? [], canonicalName: item.canonical_name });
    return {
      category: item.category,
      inventory_ref: item.inventory_ref,
      canonical_name: item.canonical_name,
      source_refs: record.source_refs ?? [],
      review_status: record.review_status ?? null,
      excerpt,
    };
  });

  const edges = manifest.dependencies ?? {};
  const outgoing = (edges.normal_edges ?? []).filter((edge) => edge.from === packageId).map((edge) => ({ to: edge.to, reasonCode: edge.reasonCode ?? null }));
  const incoming = (edges.normal_edges ?? []).filter((edge) => edge.to === packageId).map((edge) => ({ from: edge.from, reasonCode: edge.reasonCode ?? null }));
  const forbidden = (edges.forbidden_edges ?? [])
    .filter((edge) => edge.from === packageId || edge.to === packageId)
    .map((edge) => ({ from: edge.from, to: edge.to, reasonCode: edge.reasonCode ?? null }));
  const boundaryNotes = (edges.boundaries ?? []).filter((boundary) => boundary.consumer_package === packageId || boundary.provider_package === packageId);
  const testObligation = (manifest.conformance?.test_obligations ?? []).find((obligation) => obligation.package === packageId) ?? null;

  return {
    package: pkg,
    ownedItems,
    dependencyContext: { outgoing, incoming, forbidden },
    boundaryNotes,
    testObligation,
    reviewRequired: ownedItems.filter((item) => item.excerpt === null),
  };
}
