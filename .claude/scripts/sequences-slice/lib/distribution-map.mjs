// PX-307 @verifies C002
// The distribution map is the one authored declaration in the chain. This module owns
// its canonical form, its digest, its equality with the view, and the exact heading
// resolution every later layer reuses.
import { digestValue } from './digest.mjs';
import { isUnitId, normalizeHeading } from '../../rfc-graph/lib/unit-ids.mjs';

/** The fenced-block info string that marks the map inside RFC.md. */
export const DISTRIBUTION_MAP_FENCE = 'json distribution-map';

/** The map schema version this module writes and accepts. */
export const DISTRIBUTION_MAP_SCHEMA_VERSION = 1;

/** The role an operation unit declares when several packages touch it. */
export const UNIT_ROLE_IMPLEMENTER = 'implementer';
export const UNIT_ROLE_CONSUMER = 'consumer';

/** The surfaces an operation may split across when several packages implement it. */
export const UNIT_SURFACES = Object.freeze(['rest', 'websocket', 'cli']);

const VIEW_UNIT_ARRAYS = Object.freeze([
  'ownedOperationUnits',
  'ownedSequenceUnits',
  'crossBoundarySequenceUnits',
  'obligationUnits',
]);

const HEX_64 = /^[0-9a-f]{64}$/;
const DOTTED_NUMBER = /^\d+(?:\.\d+)*$/;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const FENCE_OPEN = /^```json\s+distribution-map\s*$/;

/** The kind a unit id prefix names, or null when the prefix is not a unit prefix. */
export function kindOfUnit(unitId) {
  if (typeof unitId !== 'string') return null;
  if (unitId.startsWith('op-')) return 'operation';
  if (unitId.startsWith('seq-')) return 'sequence';
  if (unitId.startsWith('xdir-')) return 'cross-boundary-sequence';
  if (unitId.startsWith('ctr-')) return 'contract';
  if (unitId.startsWith('obl-')) return 'surface';
  return null;
}

/** Collapse runs of whitespace and trim, so a formatting-only edit does not churn a digest. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalize a value recursively: strings lose insignificant whitespace, keys are sorted. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function normalizeDeep(value) {
  if (typeof value === 'string') return normalizeText(value);
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (value !== null && typeof value === 'object') {
    const normalized = {};
    for (const key of Object.keys(value).sort()) normalized[key] = normalizeDeep(value[key]);
    return normalized;
  }
  return value;
}

/** The unit records a view distributes, in the four arrays the projection carries. */
export function collectViewUnits(view) {
  const units = new Map();
  for (const field of VIEW_UNIT_ARRAYS) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (!isUnitId(unit?.unitId) || units.has(unit.unitId)) continue;
      units.set(unit.unitId, { unitId: unit.unitId, kind: kindOfUnit(unit.unitId), record: unit });
    }
  }
  return units;
}

/** The stable projection of a view that the map's source digest binds. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function canonicalViewProjection(view) {
  const units = [];
  for (const unit of collectViewUnits(view).values()) {
    const record = unit.record;
    if (unit.kind === 'operation') {
      units.push({
        unitId: unit.unitId,
        operationId: record.operationId ?? null,
        roleCandidate: record.roleCandidate ?? null,
        ownerPackageIds: [...(record.ownerPackageIds ?? [])].sort(),
        obligation: record.obligation ?? null,
      });
    } else if (unit.kind === 'sequence' || unit.kind === 'cross-boundary-sequence') {
      units.push({
        unitId: unit.unitId,
        sequenceId: record.sequenceId ?? null,
        outcome: record.outcome ?? null,
        ownerPackageIds: [...(record.ownerPackageIds ?? [])].sort(),
        steps: (record.steps ?? []).map((step) => ({
          stepId: step.stepId ?? null,
          operationId: step.operationId ?? null,
          order: step.order ?? null,
          line: step.line ?? null,
          quote: step.quote ?? null,
          contract: step.contract ?? null,
          contractProse: step.contractProse ?? null,
        })),
      });
    } else {
      units.push({
        unitId: unit.unitId,
        relation: record.relation ?? null,
        subject: record.subject ?? null,
        direction: record.direction ?? null,
        counterpart: record.counterpart ?? null,
      });
    }
  }
  units.sort((left, right) => left.unitId.localeCompare(right.unitId));
  return normalizeDeep(units);
}

/** The digest that binds a map to the view content it was authored from. */
export function viewDigest(view) {
  return digestValue(canonicalViewProjection(view));
}

/** The map body the map digest covers, with the digest itself excluded. */
export function canonicalMapBody(map) {
  const units = (map?.units ?? []).map((unit) => ({
    unitId: unit.unitId,
    kind: unit.kind,
    role: unit.role ?? null,
    surface: unit.surface ?? null,
    sections: (unit.sections ?? []).map(normalizeText),
    implementationSections: unit.implementationSections === undefined
      ? null
      : (unit.implementationSections ?? []).map(normalizeText),
    ground: normalizeText(unit.ground),
  })).sort((left, right) => left.unitId.localeCompare(right.unitId));
  const residuals = (map?.residuals ?? []).map((residual) => ({
    unit: normalizeText(residual.unit),
    ground: normalizeText(residual.ground),
  })).sort((left, right) => left.unit.localeCompare(right.unit));
  return {
    schemaVersion: map?.schemaVersion ?? DISTRIBUTION_MAP_SCHEMA_VERSION,
    packageId: map?.packageId ?? null,
    sourceViewDigest: map?.sourceViewDigest ?? null,
    units,
    residuals,
  };
}

/** The digest of the map body, excluding the digest field. */
export function mapDigest(map) {
  return digestValue(canonicalMapBody(map));
}

/** The map block as it is written into RFC.md. */
export function renderDistributionMap(map) {
  return `\`\`\`${DISTRIBUTION_MAP_FENCE}\n${JSON.stringify(map, null, 2)}\n\`\`\``;
}

/** The block body between the fence markers, or null when the RFC carries none. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function distributionMapBody(rfcText) {
  const lines = String(rfcText ?? '').split('\n');
  const start = lines.findIndex((line) => FENCE_OPEN.test(line.trim()));
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line.trim() === '```');
  if (end === -1) return null;
  return lines.slice(start + 1, end).join('\n');
}

/** A finding-shaped refusal from the map reader. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function invalidMap(reason) {
  return { ok: false, code: 'INVALID_DISTRIBUTION_MAP', reason, map: null };
}

/** Read and validate the map block from an RFC. */
export function parseDistributionMap(rfcText) {
  const body = distributionMapBody(rfcText);
  if (body === null) return { ok: false, code: 'DISTRIBUTION_MAPPING_MISSING', reason: 'no distribution-map block', map: null };

  let map;
  try {
    map = JSON.parse(body);
  } catch (error) {
    return invalidMap(`the distribution-map block is not JSON: ${error.message}`);
  }
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return invalidMap('the distribution-map block is not an object');
  if (map.schemaVersion !== DISTRIBUTION_MAP_SCHEMA_VERSION) return invalidMap(`schemaVersion is ${map.schemaVersion}`);
  if (typeof map.packageId !== 'string' || map.packageId.length === 0) return invalidMap('packageId is missing');
  if (typeof map.sourceViewDigest !== 'string' || !HEX_64.test(map.sourceViewDigest)) return invalidMap('sourceViewDigest is not 64 hex');
  if (typeof map.digest !== 'string' || !HEX_64.test(map.digest)) return invalidMap('digest is not 64 hex');
  if (!Array.isArray(map.units)) return invalidMap('units is not an array');
  if (!Array.isArray(map.residuals)) return invalidMap('residuals is not an array');

  const seen = new Set();
  let previous = null;
  for (const unit of map.units) {
    if (typeof unit?.unitId !== 'string' || !isUnitId(unit.unitId)) return invalidMap(`invalid unit id ${unit?.unitId}`);
    if (seen.has(unit.unitId)) return invalidMap(`duplicate unit ${unit.unitId}`);
    if (previous !== null && unit.unitId.localeCompare(previous) < 0) return invalidMap('units are not sorted by unitId');
    seen.add(unit.unitId);
    previous = unit.unitId;
    if (unit.kind !== kindOfUnit(unit.unitId)) return invalidMap(`unit ${unit.unitId} declares kind ${unit.kind}`);
    if (!Array.isArray(unit.sections) || unit.sections.length === 0) return invalidMap(`unit ${unit.unitId} has no sections`);
    if (unit.sections.some((section) => typeof section !== 'string' || section.trim().length === 0)) return invalidMap(`unit ${unit.unitId} has an empty section`);
    if (typeof unit.ground !== 'string' || unit.ground.trim().length === 0) return invalidMap(`unit ${unit.unitId} has no ground`);
    if (unit.role !== undefined && unit.role !== null && unit.role !== UNIT_ROLE_IMPLEMENTER && unit.role !== UNIT_ROLE_CONSUMER) {
      return invalidMap(`unit ${unit.unitId} declares role ${unit.role}`);
    }
    if (unit.surface !== undefined && unit.surface !== null && !UNIT_SURFACES.includes(unit.surface)) {
      return invalidMap(`unit ${unit.unitId} declares surface ${unit.surface}`);
    }
  }

  const residualUnits = new Set();
  for (const residual of map.residuals) {
    if (typeof residual?.unit !== 'string' || residual.unit.trim().length === 0) return invalidMap('a residual has no unit');
    if (residualUnits.has(residual.unit)) return invalidMap(`duplicate residual ${residual.unit}`);
    if (typeof residual.ground !== 'string' || residual.ground.trim().length === 0) return invalidMap(`residual ${residual.unit} has no ground`);
    residualUnits.add(residual.unit);
  }

  return { ok: true, map, reason: null };
}

/** The headings of an RFC with their level, text and leading dotted number. */
// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function headings(rfcText) {
  const found = [];
  for (const line of String(rfcText ?? '').split('\n')) {
    const match = HEADING.exec(line);
    if (match === null) continue;
    const text = match[2].trim();
    const number = /^(\d+(?:\.\d+)*)\s+/.exec(text)?.[1] ?? null;
    found.push({ level: match[1].length, text, number });
  }
  return found;
}

/** Resolve each requested section to exactly one heading. */
export function resolveSections(rfcText, sections) {
  const all = headings(rfcText);
  const resolved = [];
  const missing = [];
  const ambiguous = [];

  for (const requested of sections ?? []) {
    const cleaned = normalizeText(String(requested).replace(/^§\s*/, ''));
    const matches = DOTTED_NUMBER.test(cleaned)
      ? all.filter((heading) => heading.number === cleaned)
      : all.filter((heading) => normalizeHeading(heading.text) === normalizeHeading(cleaned));

    if (matches.length === 0) missing.push(cleaned);
    else if (matches.length > 1) ambiguous.push(cleaned);
    else resolved.push({ request: cleaned, ...matches[0] });
  }

  if (missing.length > 0) return { ok: false, code: 'MISSING_RFC_SECTION', resolved, missing, ambiguous };
  if (ambiguous.length > 0) return { ok: false, code: 'AMBIGUOUS_RFC_SECTION', resolved, missing, ambiguous };
  return { ok: true, resolved, missing, ambiguous };
}

/** The ledger's location cell for a section. */
export function sectionLabel(sectionText) {
  const cleaned = normalizeText(sectionText);
  const number = /^(\d+(?:\.\d+)*)\s+/.exec(cleaned)?.[1] ?? null;
  return number === null ? cleaned : `§${number}`;
}

/** One ledger row for a map unit. */
export function ledgerRowOf(unit, packageId) {
  return {
    unit: unit.unitId,
    kind: unit.kind,
    owner: packageId,
    location: unit.sections.map(sectionLabel).join(', '),
    ground: normalizeText(unit.ground),
  };
}

/** Compare a map with the view it was authored from. */
export function validateMapAgainstView(map, view) {
  const viewUnits = collectViewUnits(view);
  const mapUnits = new Set((map?.units ?? []).map((unit) => unit.unitId));
  const missing = [...viewUnits.keys()].filter((unitId) => !mapUnits.has(unitId));
  const invented = [...mapUnits].filter((unitId) => !viewUnits.has(unitId));

  if (missing.length > 0) return { ok: false, code: 'MISSING_UNIT', missing, invented };
  if (invented.length > 0) return { ok: false, code: 'INVENTED_UNIT', missing, invented };

  const residualIds = new Set((map?.residuals ?? []).map((residual) => normalizeText(residual.unit)));
  const residualIsViewUnit = [...residualIds].filter((unitId) => viewUnits.has(unitId));
  if (residualIsViewUnit.length > 0) return { ok: false, code: 'RESIDUAL_IS_A_VIEW_UNIT', units: residualIsViewUnit };

  if (map?.sourceViewDigest !== viewDigest(view)) return { ok: false, code: 'STALE_DISTRIBUTION_MAP' };
  if (map?.digest !== undefined && map.digest !== mapDigest(map)) return { ok: false, code: 'DISTRIBUTION_LEDGER_MISMATCH' };

  return { ok: true, missing: [], invented: [] };
}
