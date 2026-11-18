// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
/**
 * Update-mode OKF checks. Build mode keeps checks-artifact.mjs/checks.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { status } from '../law-verify/source.mjs';
import { assertLedger } from '../revision/ledger.mjs';
import { assertCoherence } from '../revision/coherence.mjs';
import { assertAuthorizations } from '../revision/authorization.mjs';
import { validatePolicy } from '../revision/policy.mjs';

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function failed(code, evidence) {
  return status('failed', evidence, { codes: [code] });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function verified(evidence) {
  return status('machine_verified', evidence, { codes: [] });
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function revisionPath(skillPath, name) {
  return join(skillPath, 'source/revision', name);
}

export function checkRevisionContract({ skillPath }) {
  const contextPath = revisionPath(skillPath, 'context.json');
  const planPath = revisionPath(skillPath, 'plan.json');
  if (!existsSync(contextPath) || !existsSync(planPath)) return failed('REVISION_CONTRACT_INVALID', 'context.json or plan.json is absent');
  const context = readJson(contextPath);
  const plan = readJson(planPath);
  if (context.schema !== 'revision-context/v1') return failed('REVISION_CONTRACT_INVALID', `unexpected context schema: ${context.schema}`);
  if (plan.schema !== 'revision-plan/v1') return failed('REVISION_CONTRACT_INVALID', `unexpected plan schema: ${plan.schema}`);
  if (!['okf-reference', 'okf-update'].includes(context.role)) return failed('UPDATE_ROLE_MISMATCH', `role ${context.role} is not an OKF role`);
  return verified(`role ${context.role}; version ${context.version}; date ${context.date}`);
}

export function checkRevisionCoverage({ skillPath }) {
  const path = revisionPath(skillPath, 'coverage.json');
  if (!existsSync(path)) return failed('REVISION_COVERAGE_GAP', 'source/revision/coverage.json is absent');
  const coverage = readJson(path);
  if (coverage.schema !== 'revision-coverage/v1') return failed('REVISION_COVERAGE_GAP', `unexpected coverage schema: ${coverage.schema}`);
  return (coverage.counts?.unmapped ?? 1) === 0
    ? verified(`${coverage.items?.length ?? 0} items covered`)
    : failed('REVISION_COVERAGE_GAP', `unmapped ${coverage.counts?.unmapped}`);
}

export function checkRevisionPreservation({ skillPath }) {
  const baselinePath = join(skillPath, 'source/baseline/concept-inventory.json');
  const currentPath = join(skillPath, 'source/concept-inventory.json');
  if (!existsSync(baselinePath)) return failed('REVISION_BASELINE_MISSING', 'source/baseline/concept-inventory.json is absent');
  if (!existsSync(currentPath)) return failed('CONCEPT_LOST', 'source/concept-inventory.json is absent');
  const baseline = readJson(baselinePath);
  const current = readJson(currentPath);
  const tombstones = new Set(readTombstones(skillPath));
  const baselineIds = inventoryIds(baseline);
  const currentIds = new Set(inventoryIds(current));
  for (const id of baselineIds) {
    if (!currentIds.has(id) && !tombstones.has(id)) return failed('CONCEPT_LOST', `baseline concept is missing without a tombstone: ${id}`);
  }
  return verified(`${baselineIds.length} baseline concepts accounted for`);
}

export function checkRevisionLedger({ skillPath }) {
  const path = revisionPath(skillPath, 'ledger.json');
  if (!existsSync(path)) return failed('REVISION_LEDGER_DRIFT', 'source/revision/ledger.json is absent');
  try {
    assertLedger(readJson(path));
    return verified('ledger hash and schema agree');
  } catch (error) {
    return failed(error.code ?? 'REVISION_LEDGER_DRIFT', error.message);
  }
}

export function checkRevisionAuthorization({ skillPath }) {
  const path = revisionPath(skillPath, 'authorizations.json');
  const planPath = revisionPath(skillPath, 'plan.json');
  if (!existsSync(path)) return failed('AUTHORIZATION_MISSING', 'source/revision/authorizations.json is absent');
  const authorizations = readJson(path);
  const plan = existsSync(planPath) ? readJson(planPath) : { operations: [] };
  try {
    assertAuthorizations({ authorizations: authorizations.authorizations ?? [], operations: plan.operations ?? [] });
    return verified(`${authorizations.authorizations?.length ?? 0} authorizations recorded`);
  } catch (error) {
    return failed(error.code ?? 'AUTHORIZATION_MISSING', error.message);
  }
}

export function checkRevisionCoherence({ skillPath }) {
  const path = revisionPath(skillPath, 'coherence.json');
  if (!existsSync(path)) return failed('REVISION_COHERENCE_GAP', 'source/revision/coherence.json is absent');
  try {
    assertCoherence(readJson(path));
    return verified('coherence matrix has no gaps');
  } catch (error) {
    return failed(error.code ?? 'REVISION_COHERENCE_GAP', error.message);
  }
}

export function checkRevisionPolicy({ skillPath }) {
  const path = revisionPath(skillPath, 'policy.json');
  if (!existsSync(path)) return verified('no process policy recorded');
  try {
    validatePolicy(readJson(path));
    return verified('process directives and completion criteria are valid');
  } catch (error) {
    return failed(error.code ?? 'REVISION_POLICY_INVALID', error.message);
  }
}

export function checkRevisionDeterminism({ skillPath }) {
  const path = revisionPath(skillPath, 'revision-log.json');
  if (!existsSync(path)) return failed('REVISION_NOT_DETERMINISTIC', 'source/revision/revision-log.json is absent');
  const log = readJson(path);
  return log.deterministic === true
    ? verified('the producer recorded a byte-identical render')
    : failed('REVISION_NOT_DETERMINISTIC', 'revision-log.json does not record deterministic rendering');
}

export function checkRevisionIdempotence({ skillPath }) {
  const path = revisionPath(skillPath, 'revision-log.json');
  if (!existsSync(path)) return failed('REVISION_NO_CHANGES', 'source/revision/revision-log.json is absent');
  const log = readJson(path);
  return ['installed', 'no_changes'].includes(log.status)
    ? verified(`revision status ${log.status}`)
    : failed('REVISION_PARTIAL_APPLIED', `revision status ${log.status ?? 'unknown'}`);
}

export function checkRevisionFreshness({ skillPath }) {
  const path = revisionPath(skillPath, 'context.json');
  if (!existsSync(path)) return failed('REVISION_DATE_INVALID', 'source/revision/context.json is absent');
  const context = readJson(path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.date ?? '')) return failed('REVISION_DATE_INVALID', `invalid date: ${context.date}`);
  if (context.stale_after && context.stale_after < context.date) return failed('REVISION_STALE', `stale_after precedes the update date: ${context.stale_after}`);
  return verified(`date ${context.date}`);
}

export function checkRevisionAssets({ skillPath }) {
  const path = join(skillPath, 'source/asset-coverage.json');
  if (!existsSync(path)) return verified('no asset ledger; zero assets');
  const coverage = readJson(path);
  const counts = coverage.counts ?? {};
  return (counts.unmappedFiles ?? 0) === 0 && (counts.unmappedLines ?? 0) === 0
    ? verified('asset coverage has no unmapped files or lines')
    : failed('ASSET_COVERAGE_GAP', JSON.stringify(counts));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function inventoryIds(inventory) {
  if (Array.isArray(inventory.entries)) return inventory.entries.map((entry) => entry.id);
  return Object.keys(inventory.concepts ?? inventory.byConcept ?? {});
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readTombstones(skillPath) {
  const path = revisionPath(skillPath, 'tombstones.json');
  if (!existsSync(path)) return [];
  return readJson(path).concepts ?? [];
}
