// PX-307 @verifies C002
// The distribution map is the one authored declaration in the chain. This module owns
// its canonical form, its digest, its equality with the view, and the exact heading
// resolution every later layer reuses.
import { digestValue } from './digest.mjs';
import { isUnitId, normalizeHeading } from '../../rfc-graph/lib/unit-ids.mjs';
import { classifyOperationOwnership, resolveOwningPackages } from './ownership.mjs';
import { buildSequenceUnits, classifySequenceOwnership } from './units.mjs';

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
// [::TICKET::] PX-307, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-315) --for-spec --no-implementation-order`.
export function collectViewUnits(view) {
  const units = new Map();
  for (const field of VIEW_UNIT_ARRAYS) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (!isUnitId(unit?.unitId)) continue;
      const existing = units.get(unit.unitId);
      if (existing !== undefined) {
        existing.records.push(unit);
        continue;
      }
      units.set(unit.unitId, {
        unitId: unit.unitId,
        kind: kindOfUnit(unit.unitId),
        record: unit,
        records: [unit],
      });
    }
  }
  return units;
}

/**
 * Whether a package predates distribution: zero view units and no map to bind.
 *
 * The exemption is only the empty-to-empty case. A non-empty map or a non-empty graph
 * still has to satisfy the unit-set equality that the caller keeps running.
 */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
export function isAdditiveEmptyDistribution(view, map) {
  if (collectViewUnits(view).size > 0) return false;
  if (map === null || map === undefined) return true;
  return (map.units ?? []).length === 0 && (map.residuals ?? []).length === 0;
}

/**
 * The sequence ids a view declares, whether or not a record carries steps.
 *
 * This is the graph stage's scope predicate. A step-bearing record is not the predicate:
 * an obligation-only sequence still declares the procedure and must keep its steps checked.
 *
 * @param {object} view
 * @returns {Set<string>}
 */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
export function declaredSequenceIds(view) {
  const sequenceIds = new Set();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.sequenceId === 'string') sequenceIds.add(unit.sequenceId);
    }
  }
  for (const unit of Array.isArray(view?.obligationUnits) ? view.obligationUnits : []) {
    const unitId = String(unit?.unitId ?? '');
    const isSequence = unit?.kind === 'sequence'
      || unit?.kind === 'cross-boundary-sequence'
      || unitId.startsWith('seq-')
      || unitId.startsWith('xdir-');
    if (!isSequence) continue;
    const sequenceId = typeof unit?.subject === 'string'
      ? unit.subject
      : unitId.replace(/^(seq|xdir)-/, '');
    if (sequenceId.length > 0) sequenceIds.add(sequenceId);
  }
  return sequenceIds;
}

/** The step-bearing records of a view, grouped by sequence id. */
export function stepBearingRecords(view) {
  const bySequence = new Map();
  for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
    for (const unit of Array.isArray(view?.[field]) ? view[field] : []) {
      if (typeof unit?.sequenceId !== 'string') continue;
      const records = bySequence.get(unit.sequenceId) ?? [];
      records.push({ unitId: unit.unitId, steps: Array.isArray(unit.steps) ? unit.steps : [] });
      bySequence.set(unit.sequenceId, records);
    }
  }
  return bySequence;
}

/** The steps of one step-bearing record in artifact order. */
export function sequenceStepsOf(record) {
  return [...(record?.steps ?? [])]
    .sort((left, right) => (left.order ?? left.line ?? 0) - (right.order ?? right.line ?? 0));
}

/**
 * The artifact steps for the sequences a view declares, grouped in artifact order.
 *
 * The artifact array order is the sequence order. A producer-supplied `order` is not
 * trusted: it is overwritten with the zero-based position within the sequence so the
 * view producer and this verifier derive the same value.
 */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function groupArtifactStepsBySequence(artifact, sequenceIds) {
  const positions = new Map();
  const bySequence = new Map();
  for (const step of Array.isArray(artifact?.steps) ? artifact.steps : []) {
    if (!sequenceIds.has(step?.sequence)) continue;
    const position = positions.get(step.sequence) ?? 0;
    positions.set(step.sequence, position + 1);
    const steps = bySequence.get(step.sequence) ?? [];
    steps.push({
      id: step.id,
      operationId: step.operation,
      order: position,
      record: { ...step, order: position },
    });
    bySequence.set(step.sequence, steps);
  }
  return bySequence;
}

/** The artifact steps for the sequences a view declares. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
export function artifactStepsForSequences(artifact, sequenceIds) {
  return groupArtifactStepsBySequence(artifact, sequenceIds);
}

/**
 * The registry rows whose provider or consumer is this package.
 *
 * A legacy row carries no side; it keeps the presence check rather than disappearing.
 */
export function registryRowsForPackage(registry, packageId) {
  return (registry ?? []).filter((row) => {
    const hasSides = typeof row?.provider_package === 'string' || typeof row?.consumer_package === 'string';
    if (!hasSides) return true;
    return row.provider_package === packageId || row.consumer_package === packageId;
  });
}

/** The canonical contract a step carries, independent of artifact/view field spelling. */
export function canonicalStepContract(step) {
  return normalizeDeep({
    contract: step?.contract ?? null,
    prose: step?.contractProse ?? step?.contract_prose ?? '',
  });
}

/** Whether two step records carry the same contract and prose. */
export function stepContractMatches(left, right) {
  return JSON.stringify(canonicalStepContract(left)) === JSON.stringify(canonicalStepContract(right));
}

/**
 * The complete identity of one step, independent of artifact/view field spelling.
 *
 * A contract-only comparison lets a view rebind a step to another operation or move
 * its specification anchor without any gate noticing. This projection keeps every
 * field the implementation reads, so a mismatch names the field that moved.
 *
 * @param {object} step
 * @returns {object}
 */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function canonicalStepIdentity(step) {
  return normalizeDeep({
    stepId: step?.stepId ?? step?.id ?? null,
    operationId: step?.operationId ?? step?.operation ?? null,
    order: step?.order ?? null,
    line: step?.line ?? null,
    quote: step?.quote ?? null,
    subject: step?.subject ?? null,
    predicate: step?.predicate ?? null,
    object: step?.object ?? null,
    contract: step?.contract ?? null,
    contractProse: step?.contractProse ?? step?.contract_prose ?? '',
  });
}

/** Whether two step records carry the same complete identity. */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function stepIdentityMatches(left, right) {
  return JSON.stringify(canonicalStepIdentity(left)) === JSON.stringify(canonicalStepIdentity(right));
}

/**
 * The active operations this package owns, read from the artifact and the tree manifest.
 *
 * The artifact is workspace-global, so a package must not report a foreign operation as
 * local. The tree manifest's object ownership is the same join the view used; without it
 * the package has no way to scope the artifact and returns nothing rather than guessing.
 *
 * @param {{ operations?: Array<object> }} artifact
 * @param {string} packageId
 * @param {{ inventory?: { objects?: Array<object> } }|null} treeManifest
 * @returns {Array<object>}
 */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function activeArtifactOperationsForPackage(artifact, packageId, treeManifest = null) {
  const objects = treeManifest?.inventory?.objects;
  if (!Array.isArray(objects) || objects.length === 0) return [];
  const ownership = resolveOwningPackages(objects);
  return (artifact?.operations ?? []).filter((operation) => {
    if (operation?.disposition !== 'active') return false;
    return classifyOperationOwnership(operation, ownership).ownerPackageIds.includes(packageId);
  });
}

/**
 * The artifact sequences this package owns, derived from the operations their steps name.
 *
 * A sequence absent from this package's view is a local omission only when one of its
 * steps names an operation this package owns. A foreign sequence is not reported here.
 *
 * @param {{ sequences?: Array<object>, steps?: Array<object>, operations?: Array<object> }} artifact
 * @param {string} packageId
 * @param {{ inventory?: { objects?: Array<object> } }|null} treeManifest
 * @returns {Array<object>}
 */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function artifactSequencesForPackage(artifact, packageId, treeManifest = null) {
  const objects = treeManifest?.inventory?.objects;
  if (!Array.isArray(objects) || objects.length === 0) return [];
  const ownership = resolveOwningPackages(objects);
  const units = buildSequenceUnits({
    sequences: artifact?.sequences ?? [],
    steps: artifact?.steps ?? [],
    operations: artifact?.operations ?? [],
  });
  const operationsBySequence = new Map();
  for (const step of units.steps) {
    const operations = operationsBySequence.get(step.sequence) ?? [];
    operations.push(step.operation);
    operationsBySequence.set(step.sequence, operations);
  }
  const operationById = new Map(units.operations.map((operation) => [operation.id, operation]));
  return units.sequences.filter((sequence) => classifySequenceOwnership(
    sequence,
    operationsBySequence,
    operationById,
    ownership,
  ).includes(packageId));
}

/**
 * The residual units that legitimately account for an active operation.
 *
 * A residual removes a unit from distribution. For an active operation that is allowed
 * only when the artifact records a supplied rule with no ordered procedure: the position
 * is `suppliedRule`, the grounding is `designer_supplied`, and no step names the operation.
 *
 * @param {{ operations?: Array<object>, steps?: Array<object> }} artifact
 * @param {{ residuals?: Array<object> }|null} map
 * @returns {Set<string>}
 */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function validOperationResiduals(artifact, map) {
  const stepped = new Set((artifact?.steps ?? []).map((step) => `op-${step.operation}`));
  const residuals = new Set();
  for (const residual of map?.residuals ?? []) {
    const unitId = residual?.unit;
    const operation = (artifact?.operations ?? []).find((candidate) => `op-${candidate.id}` === unitId);
    if (operation?.disposition !== 'active') continue;
    if (operation.position !== 'suppliedRule') continue;
    if (operation.grounding?.classification !== 'designer_supplied') continue;
    if (stepped.has(unitId)) continue;
    residuals.add(unitId);
  }
  return residuals;
}

/** The stable projection of a view that the map's source digest binds. */
// [::TICKET::] PX-307, PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-307|PX-315) --for-spec --no-implementation-order`.
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
      const projection = {
        unitId: unit.unitId,
        relation: record.relation ?? null,
        subject: record.subject ?? null,
        direction: record.direction ?? null,
        counterpart: record.counterpart ?? null,
      };
      // One record keeps the original projection so existing maps stay valid. A unit that
      // appears twice (a package on both sides of one boundary) carries both records, so a
      // change to the second side cannot hide behind the first one in the view digest.
      if ((unit.records ?? []).length > 1) {
        projection.records = unit.records.map((entry) => ({
          relation: entry.relation ?? null,
          subject: entry.subject ?? null,
          direction: entry.direction ?? null,
          counterpart: entry.counterpart ?? null,
        })).sort((left, right) => `${left.direction}|${left.counterpart}`.localeCompare(`${right.direction}|${right.counterpart}`));
      }
      units.push(projection);
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
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function canonicalMapBody(map) {
  const units = (map?.units ?? []).map((unit) => ({
    unitId: unit.unitId,
    kind: unit.kind,
    role: unit.role ?? null,
    surface: unit.surface ?? null,
    owners: unit.owners === undefined ? null : (unit.owners ?? []).map(normalizeText).sort(),
    sections: (unit.sections ?? []).map(normalizeText),
    implementationSections: unit.implementationSections === undefined
      ? null
      : (unit.implementationSections ?? []).map(normalizeText),
    ground: normalizeText(unit.ground),
  })).sort((left, right) => left.unitId.localeCompare(right.unitId));
  const residuals = (map?.residuals ?? []).map((residual) => ({
    unit: normalizeText(residual.unit),
    kind: residual.kind ?? 'declared-residual',
    owners: residual.owners === undefined ? null : (residual.owners ?? []).map(normalizeText).sort(),
    location: residual.location === undefined ? null : normalizeText(residual.location),
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
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
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
    if (unit.owners !== undefined && unit.owners !== null
        && (!Array.isArray(unit.owners) || unit.owners.some((owner) => typeof owner !== 'string' || owner.trim().length === 0))) {
      return invalidMap(`unit ${unit.unitId} has a malformed owner list`);
    }
  }

  const residualUnits = new Set();
  for (const residual of map.residuals) {
    if (typeof residual?.unit !== 'string' || residual.unit.trim().length === 0) return invalidMap('a residual has no unit');
    if (residualUnits.has(residual.unit)) return invalidMap(`duplicate residual ${residual.unit}`);
    if (typeof residual.ground !== 'string' || residual.ground.trim().length === 0) return invalidMap(`residual ${residual.unit} has no ground`);
    if (residual.owners !== undefined && residual.owners !== null
        && (!Array.isArray(residual.owners) || residual.owners.some((owner) => typeof owner !== 'string'))) {
      return invalidMap(`residual ${residual.unit} has a malformed owner list`);
    }
    if (residual.location !== undefined && residual.location !== null && typeof residual.location !== 'string') {
      return invalidMap(`residual ${residual.unit} has a malformed location`);
    }
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
    owner: ownerCellOf(unit.owners, packageId),
    location: unit.sections.map(sectionLabel).join(', '),
    ground: normalizeText(unit.ground),
  };
}

/** One ledger row for a declared residual, keeping the owner and location the RFC authored. */
export function residualRowOf(residual, packageId) {
  return {
    unit: residual.unit,
    kind: residual.kind ?? 'declared-residual',
    owner: ownerCellOf(residual.owners, packageId),
    location: normalizeText(residual.location ?? '—'),
    ground: normalizeText(residual.ground),
  };
}

/** The Owner cell: every co-owner when the map carries them, the package otherwise. */
export function ownerCellOf(owners, packageId) {
  const named = (Array.isArray(owners) ? owners : []).filter((owner) => typeof owner === 'string' && owner.trim().length > 0);
  return (named.length > 0 ? named : [packageId]).join(' + ');
}

/** Compare a map with the view it was authored from. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function validateMapAgainstView(map, view) {
  const viewUnits = collectViewUnits(view);
  const mapUnits = new Set((map?.units ?? []).map((unit) => unit.unitId));
  const residualIds = new Set((map?.residuals ?? []).map((residual) => normalizeText(residual.unit)));
  // A residual accounts for a unit the ledger declares rather than distributes, so it
  // covers a view unit the map deliberately does not carry.
  const covered = new Set([...mapUnits, ...residualIds]);
  const missing = [...viewUnits.keys()].filter((unitId) => !covered.has(unitId));
  const invented = [...mapUnits].filter((unitId) => !viewUnits.has(unitId));

  if (missing.length > 0) return { ok: false, code: 'MISSING_UNIT', missing, invented };
  if (invented.length > 0) return { ok: false, code: 'INVENTED_UNIT', missing, invented };

  const declaredTwice = [...residualIds].filter((unitId) => mapUnits.has(unitId));
  if (declaredTwice.length > 0) return { ok: false, code: 'RESIDUAL_IS_A_MAP_UNIT', units: declaredTwice };

  if (map?.sourceViewDigest !== viewDigest(view)) return { ok: false, code: 'STALE_DISTRIBUTION_MAP' };
  if (map?.digest !== undefined && map.digest !== mapDigest(map)) return { ok: false, code: 'DISTRIBUTION_LEDGER_MISMATCH' };

  return { ok: true, missing: [], invented: [] };
}
