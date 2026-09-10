// [::TICKET::] PX-193 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-193 --for-spec --no-implementation-order`.
// [::TICKET::] PX-190 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-190 --for-spec --no-implementation-order`.
// PX-193 @verifies C005
/**
 * Authoring packet (AI information supply, machine generated).
 *
 * A coupling contract cannot be written from one package alone: the AI needs the
 * counterpart package, the clause list stage 1 declared for that boundary, the
 * forbidden edges that must not become contracts, and segment-bounded excerpts of
 * the counterpart's own material. Everything here is derived from the manifest.
 */
import { WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { deriveExpectedAllocation, lookupInventoryItem } from './allocation-model.mjs';
import { contractIdForBoundary } from './contract-model.mjs';
import { CORE_CONTRACT_CLAUSES } from '../../workspacify-tree/lib/contract-clauses.mjs';

/** Default excerpt window expressed in specification lines. */
export const DEFAULT_EXCERPT_WINDOW_LINES = 3;

/**
 * Build the authoring packet for one package.
 *
 * @param {{ manifest: object, sourceText: string, packageId: string, windowLines?: number }} input
 * @returns {object} packet
 * @throws {Error} when the package is not in the manifest catalog
 */
export function buildAuthoringPacket({ manifest, sourceText, packageId, windowLines = DEFAULT_EXCERPT_WINDOW_LINES }) {
  const packages = manifest.workspace?.packages ?? [];
  const pkg = packages.find((candidate) => candidate.id === packageId);
  if (!pkg) {
    throw new WorkSpacifyTreeError(`package ${packageId} is not in the manifest catalog`, { gateId: 'G3' });
  }
  const packageById = new Map(packages.map((candidate) => [candidate.id, candidate]));
  const expectedAllocation = deriveExpectedAllocation({
    ownershipEntries: manifest.workspace?.ownership?.entries ?? [],
    packages,
  });
  const ownedItems = (expectedAllocation.expectedByPackage.get(packageId) ?? []).map((item) => {
    const record = lookupInventoryItem(manifest, item.category, item.inventory_ref);
    return {
      ...item,
      review_status: record?.normalization_status ?? 'CONFIRMED',
      source_refs: record?.source_refs ?? [],
      excerpt: buildExcerpt({
        sourceText,
        sourceRefs: record?.source_refs ?? [],
        canonicalName: item.canonical_name,
        windowLines,
      }),
    };
  });
  const unresolvedItems = ownedItems.filter((item) => item.excerpt === null).map((item) => item.inventory_ref);

  const boundaries = manifest.dependencies?.boundaries ?? [];
  const contractContext = boundaries
    .filter((boundary) => boundary.consumer_package === packageId || boundary.provider_package === packageId)
    .map((boundary) => buildContractContext({ boundary, packageId, catalog: { packageById, manifest }, excerpt: { sourceText, windowLines } }));

  const forbiddenEdges = (manifest.dependencies?.forbidden_edges ?? [])
    .filter((edge) => edge.from === packageId || edge.to === packageId)
    .map((edge) => {
      const counterpartId = edge.from === packageId ? edge.to : edge.from;
      const counterpart = packageById.get(counterpartId);
      return {
        from: edge.from,
        to: edge.to,
        reason_code: edge.reasonCode ?? null,
        counterpart_package: counterpart ? { id: counterpart.id, name: counterpart.name, path: counterpart.path, responsibilities: [...(counterpart.responsibilities ?? [])] } : { id: counterpartId },
      };
    });

  return {
    package: {
      id: pkg.id,
      name: pkg.name,
      path: pkg.path,
      layer: pkg.layer,
      kind: pkg.kind,
      seed_required: pkg.seed_required !== false,
      responsibilities: [...(pkg.responsibilities ?? [])],
    },
    owned_items: ownedItems,
    contract_context: contractContext,
    forbidden_edges: forbiddenEdges,
    conformance_obligation: buildConformanceObligation(pkg),
    review_required: unresolvedItems.length > 0 || ownedItems.some((item) => item.review_status === 'REVIEW_REQUIRED'),
    unresolved_items: unresolvedItems,
  };
}

/**
 * Slice the excerpt for one inventory item.
 *
 * An in-bounds line reference wins; otherwise the first occurrence of the
 * canonical name is used with a bounded window; otherwise there is nothing to
 * show and the caller reports the item as unresolved.
 *
 * @param {{ sourceText: string, sourceRefs?: Array<object>, canonicalName?: string, windowLines?: number }} input
 * @returns {string|null} excerpt text, or null when nothing resolvable exists
 */
export function resolveSourceExcerpt({ sourceText, sourceRefs = [], canonicalName, windowLines = DEFAULT_EXCERPT_WINDOW_LINES }) {
  const located = locateExcerpt({ sourceText, sourceRefs, canonicalName, windowLines });
  return located ? located.text : null;
}

/**
 * Locate the excerpt for one inventory item, keeping where it came from.
 *
 * An in-bounds line reference wins; otherwise the first occurrence of the
 * canonical name is used with a bounded window; otherwise there is nothing to
 * show and the caller reports the item as unresolved.
 *
 * @param {{ sourceText: string, sourceRefs?: Array<object>, canonicalName?: string, windowLines?: number }} input
 * @returns {{ segment_id: string|null, line_start: number, text: string }|null} located excerpt
 */
function locateExcerpt({ sourceText, sourceRefs = [], canonicalName, windowLines = DEFAULT_EXCERPT_WINDOW_LINES }) {
  const lines = sourceText.split('\n');
  const inBounds = sourceRefs.find((ref) => Number.isInteger(ref.line_start) && ref.line_start >= 1 && ref.line_start <= lines.length);
  if (inBounds) {
    return {
      segment_id: inBounds.segment_id ?? null,
      line_start: inBounds.line_start,
      text: excerptLines(sourceText, inBounds.line_start, inBounds.line_end ?? inBounds.line_start, windowLines),
    };
  }
  if (typeof canonicalName === 'string' && canonicalName.length > 0) {
    const occurrence = lines.findIndex((line) => line.includes(canonicalName));
    if (occurrence >= 0) {
      return { segment_id: null, line_start: occurrence + 1, text: excerptLines(sourceText, occurrence + 1, occurrence + 1, windowLines) };
    }
  }
  return null;
}

/** The excerpt object carried by the packet, or null when nothing resolves. */
function buildExcerpt(input) {
  return locateExcerpt(input);
}

/**
 * One boundary seen from this package's side.
 *
 * @param {{ boundary: object, packageId: string, catalog: { packageById: Map<string, object>, manifest: object }, excerpt: { sourceText: string, windowLines: number } }} input
 */
function buildContractContext({ boundary, packageId, catalog, excerpt }) {
  const { packageById, manifest } = catalog;
  const { sourceText, windowLines } = excerpt;
  const isConsumer = boundary.consumer_package === packageId;
  const counterpartId = isConsumer ? boundary.provider_package : boundary.consumer_package;
  const counterpart = packageById.get(counterpartId);
  const scope = boundary.stage2_contract_scope ?? [...CORE_CONTRACT_CLAUSES];
  return {
    boundary_id: boundary.id,
    contract_id: contractIdForBoundary(boundary.id),
    direction: isConsumer ? 'consumer_to_provider' : 'provider_to_consumer',
    connection_kind: boundary.connection_kind ?? 'value_only',
    reason_code: boundary.dependency_reason_code ?? null,
    counterpart_package: {
      id: counterpart?.id ?? counterpartId,
      name: counterpart?.name ?? null,
      path: counterpart?.path ?? null,
      responsibilities: [...(counterpart?.responsibilities ?? [])],
    },
    required_clauses: [...scope],
    mandatory_clauses: [...CORE_CONTRACT_CLAUSES],
    counterpart_excerpts: resolveCounterpartExcerpts({ counterpartId, manifest, sourceText, windowLines }),
  };
}

/** Segment-bounded excerpts of the counterpart's owned material. */
function resolveCounterpartExcerpts({ counterpartId, manifest, sourceText, windowLines }) {
  const expected = deriveExpectedAllocation({
    ownershipEntries: manifest.workspace?.ownership?.entries ?? [],
    packages: manifest.workspace?.packages ?? [],
  });
  const segments = manifest.structure?.segments ?? [];
  const excerpts = [];
  const seenSegments = new Set();
  for (const item of expected.expectedByPackage.get(counterpartId) ?? []) {
    const record = lookupInventoryItem(manifest, item.category, item.inventory_ref);
    for (const ref of record?.source_refs ?? []) {
      if (typeof ref.segment_id !== 'string' || seenSegments.has(ref.segment_id)) {
        continue;
      }
      const segment = segments.find((candidate) => candidate.id === ref.segment_id);
      if (!segment) {
        continue;
      }
      seenSegments.add(ref.segment_id);
      excerpts.push({
        segment_id: ref.segment_id,
        inventory_ref: item.inventory_ref,
        line_start: segment.line_start,
        line_end: segment.line_end,
        text: excerptLines(sourceText, segment.line_start, segment.line_end, windowLines),
      });
    }
  }
  return excerpts;
}

/** Slice a bounded window of lines, clamped to the document. */
function excerptLines(sourceText, lineStart, lineEnd, windowLines) {
  const lines = sourceText.split('\n');
  const start = Math.max(1, lineStart - windowLines);
  const end = Math.min(lines.length, Math.max(lineEnd, lineStart) + windowLines);
  return lines.slice(start - 1, end).join('\n').trim();
}

/** Conformance and test obligations carried by support packages. */
function buildConformanceObligation(pkg) {
  if (pkg.kind === 'conformance') {
    return 'this package is the test sink: it owns verification obligations, never production dependencies';
  }
  if (pkg.kind === 'test-support') {
    return 'this package is a dev-only helper: its material never becomes a production dependency';
  }
  return null;
}
