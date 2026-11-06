// [::TICKET::] PX-196 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-196 --for-spec --no-implementation-order`.
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * Segment ownership of harvested material and of formula-bearing prose.
 *
 * Stage 2 proves zero-omission transfer by requiring every specification segment
 * to be carried by some seed. That is only meaningful for segments that actually
 * hold material: an overview or glossary chapter yields no harvested item, so no
 * seed owes it. Stage 1 therefore publishes, per segment, the inventory ids whose
 * source refs fall inside it — the material/non-material boundary becomes machine
 * data instead of an assumption stage 2 cannot check.
 *
 * A prose chapter can carry a specification formula without yielding any harvested
 * declaration. The S8 gate counts those formulas, so the segment is material for
 * ownership as well: it must be covered by an inventory item or by a grounded
 * segment claim. The claim quotes the line it relies on, so the ownership decision
 * is anchored in the specification rather than asserted freely.
 */
import { extractFormulas, uniqueFormulas } from '../../spec-formula/index.mjs';

/** Inventory categories that carry source refs. */
const INVENTORY_LISTS = ['objects', 'claims', 'invariants', 'state_machines', 'error_codes', 'required_tests'];

/** Refusal codes for a segment claim that is not grounded in the specification. */
export const SEGMENT_OWNERSHIP_UNKNOWN_SEGMENT = 'SEGMENT_OWNERSHIP_UNKNOWN_SEGMENT';
export const SEGMENT_OWNERSHIP_UNKNOWN_PACKAGE = 'SEGMENT_OWNERSHIP_UNKNOWN_PACKAGE';
export const SEGMENT_GROUND_OUT_OF_RANGE = 'SEGMENT_GROUND_OUT_OF_RANGE';
export const SEGMENT_GROUND_QUOTE_MISSING = 'SEGMENT_GROUND_QUOTE_MISSING';
export const SEGMENT_OWNERSHIP_DUPLICATE = 'SEGMENT_OWNERSHIP_DUPLICATE';
export const FORMULA_SEGMENT_UNOWNED = 'FORMULA_SEGMENT_UNOWNED';

/**
 * Annotate every segment with the inventory ids it carries.
 *
 * @param {{ segments: Array<object>, inventory: object }} input
 * @returns {Array<object>} segments with owned_inventory_ids (sorted, unique)
 */
export function attachOwnedInventory({ segments, inventory }) {
  const idsBySegment = new Map((segments ?? []).map((segment) => [segment.id, new Set()]));
  for (const listName of INVENTORY_LISTS) {
    for (const item of inventory?.[listName] ?? []) {
      for (const ref of item.source_refs ?? []) {
        const bucket = idsBySegment.get(ref.segment_id);
        if (bucket) {
          bucket.add(item.id);
        }
      }
    }
  }
  return (segments ?? []).map((segment) => ({
    ...segment,
    owned_inventory_ids: [...(idsBySegment.get(segment.id) ?? [])].sort(),
  }));
}

/**
 * Attach the formula ids whose source lines fall inside each segment.
 *
 * Only the shared spec-formula extractor is used, so the tree's material set and the
 * S8 denominator cannot drift into two parsers with two normalization rules. A segment
 * with no formula keeps no field, which is what makes an old manifest render unchanged.
 *
 * @param {{ segments: Array<object>, sourceText: string }} input
 * @returns {Array<object>} segments with formula_ids on the formula-bearing ones
 */
export function annotateFormulaSegments({ segments, sourceText }) {
  const formulas = uniqueFormulas(extractFormulas(String(sourceText ?? '')));
  const idsBySegment = new Map();

  for (const segment of segments ?? []) {
    const ids = formulas
      .filter((formula) => formula.lineStart <= segment.line_end && formula.lineEnd >= segment.line_start)
      .map((formula) => formula.id);
    if (ids.length > 0) {
      idsBySegment.set(segment.id, [...new Set(ids)].sort());
    }
  }

  return (segments ?? []).map((segment) => {
    const formulaIds = idsBySegment.get(segment.id);
    return formulaIds === undefined ? segment : { ...segment, formula_ids: formulaIds };
  });
}

/**
 * Validate an authored segment claim against the segment and the specification.
 *
 * @param {{ ownership?: Array<object>, segments?: Array<object>, packages?: Array<object>, sourceText?: string }} input
 * @returns {{ ok: boolean, errors: Array<{code: string, message: string}>, entries: Array<object> }}
 */
export function validateSegmentOwnership({ ownership = [], segments = [], packages = [], sourceText = '' } = {}) {
  const segmentsById = new Map((segments ?? []).map((segment) => [segment.id, segment]));
  const packageIds = new Set((packages ?? []).map((pkg) => pkg.id));
  const lines = String(sourceText ?? '').split('\n');
  const errors = [];
  const entries = [];
  const seenSegments = new Set();

  for (const claim of Array.isArray(ownership) ? ownership : []) {
    const segmentId = claim?.segmentId;
    const packageId = claim?.packageId;
    const segment = segmentsById.get(segmentId);

    if (segment === undefined) {
      errors.push(refusal(SEGMENT_OWNERSHIP_UNKNOWN_SEGMENT, `segment claim names unknown segment ${segmentId}`));
      continue;
    }
    if (!packageIds.has(packageId)) {
      errors.push(refusal(SEGMENT_OWNERSHIP_UNKNOWN_PACKAGE, `segment ${segmentId} is claimed by unknown package ${packageId}`));
      continue;
    }
    if (seenSegments.has(segmentId)) {
      errors.push(refusal(SEGMENT_OWNERSHIP_DUPLICATE, `segment ${segmentId} is claimed more than once`));
      continue;
    }

    const line = claim?.source?.line;
    if (!Number.isInteger(line) || line < segment.line_start || line > segment.line_end) {
      errors.push(refusal(SEGMENT_GROUND_OUT_OF_RANGE, `segment ${segmentId} claim cites line ${line}, outside ${segment.line_start}-${segment.line_end}`));
      continue;
    }

    const quote = claim?.source?.quote;
    if (typeof quote !== 'string' || quote.trim().length === 0 || !(lines[line - 1] ?? '').includes(quote)) {
      errors.push(refusal(SEGMENT_GROUND_QUOTE_MISSING, `segment ${segmentId} claim cites no quote on line ${line}`));
      continue;
    }

    seenSegments.add(segmentId);
    entries.push({ segmentId, packageId, source: { line, quote } });
  }

  return { ok: errors.length === 0, errors, entries };
}

/**
 * Count formula-bearing segments that neither inventory nor a grounded claim covers.
 *
 * @param {{ segments?: Array<object>, segmentOwnership?: Array<object> }} input
 * @returns {{ orphanCount: number, details: Array<string> }}
 */
export function checkFormulaSegmentOwnership({ segments = [], segmentOwnership = [] } = {}) {
  const claimed = new Set((segmentOwnership ?? []).map((claim) => claim?.segmentId).filter(Boolean));
  const details = [];
  let orphanCount = 0;

  for (const segment of segments ?? []) {
    const formulaCount = (segment.formula_ids ?? []).length;
    if (formulaCount === 0) {
      continue;
    }
    if ((segment.owned_inventory_ids ?? []).length > 0 || claimed.has(segment.id)) {
      continue;
    }
    orphanCount += 1;
    details.push(`${FORMULA_SEGMENT_UNOWNED}: segment ${segment.id} carries ${formulaCount} formula(s) and has no inventory-backed or grounded owner`);
  }

  return { orphanCount, details };
}

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function refusal(code, message) {
  return { code, message };
}
