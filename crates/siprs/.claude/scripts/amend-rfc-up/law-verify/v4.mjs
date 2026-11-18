// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
/**
 * Update-mode law checks. Build mode keeps v3.mjs and checks.json unchanged.
 * Every check reads the update artifacts, never a generated summary.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { status } from './source.mjs';
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
  if (!existsSync(contextPath)) return failed('REVISION_CONTRACT_INVALID', 'source/revision/context.json is absent');
  if (!existsSync(planPath)) return failed('REVISION_CONTRACT_INVALID', 'source/revision/plan.json is absent');
  const context = readJson(contextPath);
  const plan = readJson(planPath);
  if (context.schema !== 'revision-context/v1') return failed('REVISION_CONTRACT_INVALID', `unexpected context schema: ${context.schema}`);
  if (plan.schema !== 'revision-plan/v1') return failed('REVISION_CONTRACT_INVALID', `unexpected plan schema: ${plan.schema}`);
  if (!context.skill || !context.role || !context.adapter || !context.version || !context.date) {
    return failed('REVISION_CONTRACT_INVALID', 'context lacks skill, role, adapter, version, or date');
  }
  return verified(`role ${context.role}; version ${context.version}; date ${context.date}`);
}

export function checkRevisionCoverage({ skillPath }) {
  const coveragePath = revisionPath(skillPath, 'coverage.json');
  if (!existsSync(coveragePath)) return failed('REVISION_COVERAGE_GAP', 'source/revision/coverage.json is absent');
  const coverage = readJson(coveragePath);
  if (coverage.schema !== 'revision-coverage/v1') return failed('REVISION_COVERAGE_GAP', `unexpected coverage schema: ${coverage.schema}`);
  if (coverage.counts?.unmapped !== 0) return failed('REVISION_COVERAGE_GAP', `unmapped ${coverage.counts?.unmapped ?? 'unknown'}`);
  const empty = (coverage.items ?? []).filter((item) => (item.dispositions ?? []).length === 0);
  return empty.length === 0
    ? verified(`${coverage.items?.length ?? 0} items covered`)
    : failed('REVISION_COVERAGE_GAP', `items without a disposition: ${empty.map((item) => item.line).join(',')}`);
}

export function checkRevisionPreservation({ skillPath }) {
  const baselinePath = join(skillPath, 'source/baseline/rule-concepts.json');
  const currentPath = join(skillPath, 'source/rule-concepts.json');
  if (!existsSync(baselinePath)) return failed('REVISION_BASELINE_MISSING', 'source/baseline/rule-concepts.json is absent');
  if (!existsSync(currentPath)) return failed('RULE_LOST', 'source/rule-concepts.json is absent');
  const baseline = readJson(baselinePath);
  const current = readJson(currentPath);
  const tombstones = new Set(readTombstones(skillPath));
  const baselineIds = Object.keys(baseline.byRule ?? {});
  const currentIds = new Set(Object.keys(current.byRule ?? {}));
  for (const id of baselineIds) {
    if (!currentIds.has(id) && !tombstones.has(id)) return failed('RULE_LOST', `baseline rule is missing without a tombstone: ${id}`);
  }
  for (const id of currentIds) {
    if (tombstones.has(id)) return failed('RULE_ID_REUSED', `tombstoned rule appears in the effective map: ${id}`);
  }
  return verified(`${baselineIds.length} baseline rules accounted for`);
}

export function checkRevisionLedger({ skillPath }) {
  const ledgerPath = revisionPath(skillPath, 'ledger.json');
  if (!existsSync(ledgerPath)) return failed('REVISION_LEDGER_DRIFT', 'source/revision/ledger.json is absent');
  try {
    assertLedger(readJson(ledgerPath));
    return verified('ledger hash and schema agree');
  } catch (error) {
    return failed(error.code ?? 'REVISION_LEDGER_DRIFT', error.message);
  }
}

export function checkRevisionAuthorization({ skillPath }) {
  const authorizationPath = revisionPath(skillPath, 'authorizations.json');
  const planPath = revisionPath(skillPath, 'plan.json');
  if (!existsSync(authorizationPath)) return failed('AUTHORIZATION_MISSING', 'source/revision/authorizations.json is absent');
  const authorizations = readJson(authorizationPath);
  const plan = existsSync(planPath) ? readJson(planPath) : { operations: [] };
  try {
    assertAuthorizations({ authorizations: authorizations.authorizations ?? [], operations: plan.operations ?? [] });
    return verified(`${authorizations.authorizations?.length ?? 0} authorizations recorded`);
  } catch (error) {
    return failed(error.code ?? 'AUTHORIZATION_MISSING', error.message);
  }
}

export function checkRevisionCoherence({ skillPath }) {
  const coherencePath = revisionPath(skillPath, 'coherence.json');
  if (!existsSync(coherencePath)) return failed('REVISION_COHERENCE_GAP', 'source/revision/coherence.json is absent');
  try {
    assertCoherence(readJson(coherencePath));
    return verified('coherence matrix has no gaps');
  } catch (error) {
    return failed(error.code ?? 'REVISION_COHERENCE_GAP', error.message);
  }
}

export function checkRevisionPolicy({ skillPath }) {
  const policyPath = revisionPath(skillPath, 'policy.json');
  if (!existsSync(policyPath)) return verified('no process policy recorded');
  try {
    validatePolicy(readJson(policyPath));
    return verified('process directives and completion criteria are valid');
  } catch (error) {
    return failed(error.code ?? 'REVISION_POLICY_INVALID', error.message);
  }
}

export function checkRevisionDeterminism({ skillPath }) {
  const logPath = revisionPath(skillPath, 'revision-log.json');
  if (!existsSync(logPath)) return failed('REVISION_NOT_DETERMINISTIC', 'source/revision/revision-log.json is absent');
  const log = readJson(logPath);
  return log.deterministic === true
    ? verified('the producer recorded a byte-identical render')
    : failed('REVISION_NOT_DETERMINISTIC', 'revision-log.json does not record deterministic rendering');
}

export function checkRevisionIdempotence({ skillPath }) {
  const logPath = revisionPath(skillPath, 'revision-log.json');
  if (!existsSync(logPath)) return failed('REVISION_NO_CHANGES', 'source/revision/revision-log.json is absent');
  const log = readJson(logPath);
  return ['installed', 'no_changes'].includes(log.status)
    ? verified(`revision status ${log.status}`)
    : failed('REVISION_PARTIAL_APPLIED', `revision status ${log.status ?? 'unknown'}`);
}

export function checkRevisionFreshness({ skillPath }) {
  const contextPath = revisionPath(skillPath, 'context.json');
  if (!existsSync(contextPath)) return failed('REVISION_DATE_INVALID', 'source/revision/context.json is absent');
  const context = readJson(contextPath);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(context.date ?? '')) return failed('REVISION_DATE_INVALID', `invalid date: ${context.date}`);
  if (context.stale_after && context.stale_after < context.date) return failed('REVISION_STALE', `stale_after precedes the update date: ${context.stale_after}`);
  return verified(`date ${context.date}`);
}

export function checkRevisionAssets({ skillPath }) {
  const coveragePath = join(skillPath, 'source/asset-coverage.json');
  if (!existsSync(coveragePath)) return verified('no asset ledger; zero assets');
  const coverage = readJson(coveragePath);
  const counts = coverage.counts ?? {};
  return (counts.unmappedFiles ?? 0) === 0 && (counts.unmappedLines ?? 0) === 0
    ? verified('asset coverage has no unmapped files or lines')
    : failed('ASSET_COVERAGE_GAP', JSON.stringify(counts));
}

/**
 * Build mode pins the rule count at 486. An update changes that count by
 * design, so update mode checks identity against the effective map and the
 * rebuilt lock instead of the build constant.
 */
export function checkRevisionRuleIdentity({ skillPath }) {
  const ruleMap = readJson(join(skillPath, 'source/rule-concepts.json'));
  const lock = readJson(join(skillPath, 'atoms.lock.json'));
  const count = Object.keys(ruleMap.byRule ?? {}).length;
  const lockCount = (lock.rules ?? []).length;
  const result = spawnSync(process.execPath, [join(skillPath, 'dist/skill.mjs'), 'explain', '--rule', 'REST-01'], { encoding: 'utf8' });
  if (result.status !== 0) return failed('RULE_IDENTITY_FAILED', result.stderr);
  if (!result.stdout.includes('REST-01')) return failed('RULE_IDENTITY_FAILED', 'rule id absent');
  return count === lockCount
    ? verified(`${count} effective rule ids resolve and match the lock`)
    : failed('RULE_IDENTITY_COUNT', `rules=${count} lock=${lockCount}`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readTombstones(skillPath) {
  const path = revisionPath(skillPath, 'tombstones.json');
  if (!existsSync(path)) return [];
  return readJson(path).rules ?? [];
}
