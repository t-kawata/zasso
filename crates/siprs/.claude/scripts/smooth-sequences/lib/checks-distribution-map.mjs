// PX-307 @verifies C006
// The root check is the only place that sees every package at once. It owns the role
// uniqueness and the workspace-wide coverage findings; it never modifies a package.
import {
  collectViewUnits,
  parseDistributionMap,
  resolveSections,
  validateMapAgainstView,
} from '../../sequences-slice/lib/distribution-map.mjs';
import { readLedgerRows } from '../../sequences-slice/lib/distribution-ledger.mjs';
import { classifyOperationOwnership, resolveOwningPackages } from '../../sequences-slice/lib/ownership.mjs';
import { normalizeHeading, readSectionUnitAnchors } from '../../rfc-graph/lib/unit-ids.mjs';
import { finding } from './index.mjs';
import { routeForPackage, routeForWorkspaceFinding } from './repair-route.mjs';

/** One high-severity finding in the shape the smooth report already renders. */
// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function distributionFinding(code, unitId, message) {
  return { severity: 'high', code, unitId, layer: 'rfc', message };
}

/**
 * Check one package's view against its RFC map.
 *
 * A package without a view, or with an empty view, keeps its old verdict. A non-empty view
 * without a map is a finding rather than a vacuous pass.
 *
 * @param {{ view?: object|null, rfc?: string|null, packageId?: string }} input
 * @returns {Array<{ severity: string, code: string, unitId: string, layer: string, message: string }>}
 */
export function checkDistributionMap({ view = null, rfc = null } = {}) {
  if (view === null || view === undefined) return [];
  const units = collectViewUnits(view);
  if (units.size === 0) return [];

  const parsed = parseDistributionMap(rfc ?? '');
  if (!parsed.ok) {
    if (parsed.code === 'DISTRIBUTION_MAPPING_MISSING') {
      return [distributionFinding('DISTRIBUTION_MAPPING_MISSING', [...units.keys()][0], `package ${view.packageId} distributes ${units.size} unit(s) and carries no distribution-map block`)];
    }
    return [distributionFinding(parsed.code, view.packageId ?? 'package', parsed.reason ?? 'the distribution-map block is invalid')];
  }

  const valid = validateMapAgainstView(parsed.map, view);
  if (!valid.ok) {
    const subject = (valid.missing?.[0] ?? valid.invented?.[0] ?? valid.units?.[0] ?? view.packageId ?? 'package');
    return [distributionFinding(valid.code, subject, `the map and the view disagree: ${valid.code}`)];
  }

  const findings = [];
  for (const unit of parsed.map.units) {
    const resolution = resolveSections(rfc, unit.sections);
    if (!resolution.ok) {
      findings.push(distributionFinding(resolution.code, unit.unitId, `unit ${unit.unitId} does not resolve: ${resolution.code}`));
    }
  }

  const anchors = readSectionUnitAnchors(rfc);
  for (const unit of parsed.map.units) {
    for (const section of unit.sections) {
      const found = anchors.find((entry) => entry.headingText !== null && normalizeHeading(entry.headingText) === normalizeHeading(section));
      if (found === undefined || !found.unitIds.includes(unit.unitId)) {
        findings.push(distributionFinding('MISSING_UNIT_AT_LAYER', unit.unitId, `unit ${unit.unitId} has no anchor in section ${section}`));
      }
    }
  }

  const rows = readLedgerRows(rfc) ?? [];
  const ledgerUnits = new Set(rows.filter((row) => row.kind.trim() !== 'declared-residual').map((row) => row.unit.replace(/`/g, '').trim()));
  const mapUnits = new Set(parsed.map.units.map((unit) => unit.unitId));
  const missingRows = [...mapUnits].filter((unitId) => !ledgerUnits.has(unitId));
  const inventedRows = [...ledgerUnits].filter((unitId) => !mapUnits.has(unitId));
  for (const unitId of missingRows) findings.push(distributionFinding('DISTRIBUTION_LEDGER_MISMATCH', unitId, `unit ${unitId} is in the map and absent from the ledger`));
  for (const unitId of inventedRows) findings.push(distributionFinding('DISTRIBUTION_LEDGER_MISMATCH', unitId, `unit ${unitId} is in the ledger and absent from the map`));

  return findings;
}

/**
 * The operation role uniqueness across package maps.
 *
 * One implementer is the default. More than one is allowed only when every implementer
 * declares a distinct surface; zero implementers is always a finding.
 *
 * @param {Array<{ packageId: string, units: Array<object> }>} maps
 * @returns {{ ok: boolean, code?: string, unitId?: string, findings?: Array<object> }}
 */
// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
// [::TICKET::] PX-317 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-317 --for-spec --no-implementation-order`.
export function checkOwnerRoles(maps, { roleCandidates = null, activeOperationUnits: activeUnits = null } = {}) {
  const byUnit = new Map();
  for (const map of maps ?? []) {
    for (const unit of map?.units ?? []) {
      if (unit.kind !== 'operation') continue;
      const entries = byUnit.get(unit.unitId) ?? [];
      entries.push({ packageId: map.packageId, role: unit.role ?? null, surface: unit.surface ?? null });
      byUnit.set(unit.unitId, entries);
    }
  }

  for (const [unitId, roleEntries] of byUnit) {
    if (activeUnits !== null && !activeUnits.has(unitId)) continue;
    const packageIds = roleEntries.map((entry) => entry.packageId);
    const candidate = roleCandidates?.get(unitId) ?? null;
    const implementerEntries = roleEntries.filter((entry) => entry.role === 'implementer');
    // A single owner is the common case, and the case a wrong role hides best: one
    // consumer leaves the operation with no implementer at all.
    if (roleEntries.length === 1) {
      if (implementerEntries.length === 1) continue;
      return {
        ok: false,
        code: 'OWNER_ROLE_UNDECLARED',
        unitId,
        packageIds,
        findings: [distributionFinding('OWNER_ROLE_UNDECLARED', unitId, `operation ${unitId} has a sole owner that does not declare itself the implementer`)],
      };
    }
    if (implementerEntries.length === 1) continue;
    if (implementerEntries.length > 1) {
      const surfaces = implementerEntries.map((entry) => entry.surface);
      const declaredAndDistinct = surfaces.every((surface) => typeof surface === 'string')
        && new Set(surfaces).size === surfaces.length;
      if (declaredAndDistinct) continue;
    }
    return {
      ok: false,
      code: 'OWNER_ROLE_UNDECLARED',
      unitId,
      packageIds,
      findings: [distributionFinding('OWNER_ROLE_UNDECLARED', unitId, `operation ${unitId} has ${implementerEntries.length} implementer(s) and no disjoint surface split${candidate === 'undecided' ? ' (explicitly undecided)' : ''}`)],
    };
  }
  return { ok: true, findings: [] };
}

/**
 * The role candidate each view declares, keyed by unit id.
 *
 * A view generated before the role declaration carries none. Its map was rendered with
 * `consumer` as the only answer the renderer had, so that row is not a claim an author
 * made and cannot be judged as one.
 */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function declaredRoleCandidates(packages) {
  const candidates = new Map();
  for (const pkg of packages ?? []) {
    for (const unit of pkg?.view?.ownedOperationUnits ?? []) {
      if (typeof unit?.unitId !== 'string') continue;
      if (unit.roleCandidate === undefined || unit.roleCandidate === null) continue;
      candidates.set(unit.unitId, unit.roleCandidate);
    }
  }
  return candidates;
}

/** The operation units the artifact marks active: only those order an act an implementer owes. */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function activeOperationUnits(artifact) {
  const active = new Set();
  for (const operation of artifact?.operations ?? []) {
    if (operation?.disposition !== 'active') continue;
    active.add(`op-${operation.id}`);
  }
  return active;
}

/**
 * The packages that own an operation's result objects.
 *
 * The root coverage check runs before any view distributes the operation, so the views
 * cannot answer which package it belongs to; the tree inventory can, because it names
 * the package that owns each object type the operation produces.
 */
// [::TICKET::] PX-310 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-310 --for-spec --no-implementation-order`.
function operationOwnerPackages(index) {
  const objects = Array.isArray(index?.treeManifest?.inventory?.objects)
    ? index.treeManifest.inventory.objects
    : [];
  const ownership = resolveOwningPackages(objects);
  const owners = new Map();
  for (const operation of index?.artifact?.operations ?? []) {
    owners.set(operation.id, classifyOperationOwnership(operation, ownership).ownerPackageIds);
  }
  return owners;
}

/**
 * The active operations a package map parks as declared residuals.
 *
 * A residual is the one route that removes a unit from distribution. It is allowed for an
 * active operation only when the artifact itself records that the operation is a supplied
 * rule with no ordered procedure: `position: suppliedRule`, `grounding.classification:
 * designer_supplied`, and no step. Any other active residual is an active operation that
 * no ticket will implement, so it is reported instead of counted as distributed.
 *
 * @param {object} index
 * @param {Array<{ packageId: string, units: Array<object>, residuals?: Array<object> }>} maps
 * @returns {Array<{ checkId: string, subject: string, className: string, why: string, fix: string }>}
 */
// [::TICKET::] PX-312 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-312 --for-spec --no-implementation-order`.
export function checkActiveOperationResiduals(index, maps) {
  const residuals = new Set();
  for (const map of maps ?? []) {
    for (const residual of map?.residuals ?? []) {
      if (typeof residual?.unit === 'string') residuals.add(residual.unit);
    }
  }

  const findings = [];
  for (const operation of index?.artifact?.operations ?? []) {
    if (operation?.disposition !== 'active') continue;
    const unitId = `op-${operation.id}`;
    if (!residuals.has(unitId)) continue;
    const suppliedRule = operation.position === 'suppliedRule'
      && operation.grounding?.classification === 'designer_supplied'
      && (index.stepsByOperation?.get(operation.id) ?? []).length === 0;
    if (suppliedRule) continue;
    findings.push(finding('S7.active-operation-residual', 'danger', unitId, {
      where: 'artifact.operations',
      why: `active operation ${unitId} is a declared residual without position suppliedRule, grounding designer_supplied and zero steps`,
      fix: 'distribute the operation or reclassify it with a no-act ground before the split',
      producer: 'smooth-sequences/run.mjs',
    }));
  }
  return findings;
}

/**
 * The root collector for the S7 distribution family.
 *
 * The root coverage finding fires only when at least one package carries a map: a workspace
 * that has not adopted the feature keeps its old verdict.
 *
 * @param {object} index
 * @returns {{ findings: Array<object>, subChecks: Array<object> }}
 */
export function collectDistributionMap(index) {
  const findings = [];
  const maps = [];
  for (const pkg of index?.packages ?? []) {
    for (const entry of checkDistributionMap({ view: pkg.view, rfc: pkg.rfc, packageId: pkg.id })) {
      findings.push(finding('S7.distribution-map', 'deficiency', entry.unitId, {
        ...routeForPackage('S7.distribution-map', index, pkg.id),
        why: `${entry.code}: ${entry.message}`,
        fix: 'run render-distribution.mjs in the package and re-run the gates',
      }));
    }
    const parsed = pkg.rfc === null || pkg.rfc === undefined ? { ok: false } : parseDistributionMap(pkg.rfc);
    if (parsed.ok) maps.push({ packageId: pkg.id, units: parsed.map.units, residuals: parsed.map.residuals ?? [] });
  }

  const roles = checkOwnerRoles(maps, {
    roleCandidates: declaredRoleCandidates(index?.packages),
    activeOperationUnits: activeOperationUnits(index?.artifact),
  });
  if (!roles.ok) {
    for (const entry of roles.findings) {
      findings.push(finding('S7.owner-role-undeclared', 'deficiency', entry.unitId, {
        ...routeForWorkspaceFinding('S7.owner-role-undeclared', index, roles.packageIds),
        why: entry.message,
        fix: 'declare one implementer or a disjoint surface split in the package distribution maps',
      }));
    }
  }

  const ownersByOperation = operationOwnerPackages(index);
  for (const entry of checkActiveOperationResiduals(index, maps)) {
    findings.push({
      ...entry,
      ...routeForWorkspaceFinding(entry.checkId, index, ownersByOperation.get(entry.subject.slice('op-'.length))),
    });
  }

  if (maps.length > 0) {
    const viewUnitIds = new Set();
    for (const pkg of index?.packages ?? []) {
      for (const unitId of collectViewUnits(pkg.view).keys()) viewUnitIds.add(unitId);
    }
    for (const operation of index?.artifact?.operations ?? []) {
      const unitId = `op-${operation.id}`;
      if (!viewUnitIds.has(unitId)) {
        findings.push(finding('S7.root-unit-uncovered', 'omission', unitId, {
          ...routeForWorkspaceFinding('S7.root-unit-uncovered', index, ownersByOperation.get(operation.id)),
          why: `operation ${operation.id} is in the artifact and no package view distributes it`,
          fix: 'project the operation into the owning package view before distributing',
        }));
      }
    }
  }

  // The consistency family already reports the sub-checks for these check ids; returning
  // them again would double the registry count and make executed + blocked exceed it.
  return { findings, subChecks: [] };
}
