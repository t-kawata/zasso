// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.

import { ISO_DATE_PATTERN, SEMVER_PATTERN } from './constants.mjs';
import { hasCjk } from './document.mjs';
import { failRevision } from './errors.mjs';
import { assertRole } from './roles.mjs';

const MINOR_OPERATIONS = new Set([
  'update-rule',
  'add-rule',
  'update-section',
  'add-section',
  'update-concept',
  'add-concept',
  'update-api-contract',
  'update-profile',
  'update-conformance',
  'update-implementation-policy',
  'update-implementation-contract',
  'update-implementation-test',
  'update-template',
  'add-source',
  'update-source',
  'add-asset',
  'update-asset',
]);

const MAJOR_OPERATIONS = new Set([
  'retire-rule',
  'merge-rules',
  'split-rule',
  'rename-rule',
  'retire-section',
  'rename-section',
  'retire-concept',
  'rename-concept',
  'retire-asset',
]);

export function inferRevisionContext({
  skillName,
  adapter,
  documentMap,
  baseline,
  plan,
  frontMatter = {},
  ticket = {},
  env = {},
}) {
  const baselineVersion = baseline?.version;
  if (!baselineVersion || !SEMVER_PATTERN.test(baselineVersion)) {
    failRevision('REVISION_BASELINE_VERSION_MISMATCH', 'baseline version is missing or invalid', { target: skillName });
  }
  const role = frontMatter.role ?? inferRole({ adapter, plan, frontMatter });
  const version = frontMatter.version ?? deriveVersion(baselineVersion, plan?.operations ?? []);
  const date = frontMatter.date ?? ticket.date ?? convertEpochToDate(env.SOURCE_DATE_EPOCH);
  if (!date) {
    failRevision('REVISION_DATE_REQUIRED', 'no ISO date, ticket date, or SOURCE_DATE_EPOCH is available', { target: skillName });
  }
  return {
    schema: 'revision-context/v1',
    skill: skillName,
    role,
    adapter,
    baseline_path: frontMatter.baseline_path ?? null,
    baseline_version: baselineVersion,
    version,
    date,
    language: documentMap?.language ?? frontMatter.language ?? 'en',
    id_policy: frontMatter.id_policy ?? 'append',
    allow_rename_rule: frontMatter.allow_rename_rule ?? false,
    external_approval: frontMatter.external_approval ?? null,
    statements: plan?.operations
      ?.map((operation) => operation.statement ?? operation.body ?? operation.criterion)
      .filter((value) => typeof value === 'string') ?? [],
    inferences: [
      { field: 'role', source: frontMatter.role ? 'front-matter' : 'plan', value: role },
      { field: 'version', source: frontMatter.version ? 'front-matter' : 'change-class', value: version },
      { field: 'date', source: frontMatter.date ? 'front-matter' : (ticket.date ? 'active-ticket' : 'source-date-epoch'), value: date },
    ],
  };
}

export function validateRevisionContext(context) {
  for (const field of ['schema', 'skill', 'role', 'adapter', 'baseline_version', 'version', 'date', 'language', 'id_policy']) {
    if (context?.[field] === undefined || context[field] === null || context[field] === '') {
      failRevision('REVISION_CONTRACT_INVALID', `revision context lacks ${field}`, { target: field });
    }
  }
  if (context.schema !== 'revision-context/v1') {
    failRevision('REVISION_CONTRACT_INVALID', `unexpected context schema: ${context.schema}`, { target: 'schema' });
  }
  assertRole({ role: context.role, adapter: context.adapter });
  if (!SEMVER_PATTERN.test(context.baseline_version) || !SEMVER_PATTERN.test(context.version)) {
    failRevision('REVISION_VERSION_INVALID', 'version is not semver', { target: context.version });
  }
  if (compareVersions(context.version, context.baseline_version) <= 0) {
    failRevision('REVISION_STALE', 'update version must be greater than the baseline version', { target: context.version });
  }
  if (!ISO_DATE_PATTERN.test(context.date)) {
    failRevision('REVISION_DATE_INVALID', `date is not YYYY-MM-DD: ${context.date}`, { target: context.date });
  }
  if (!['append', 'explicit', 'preserve'].includes(context.id_policy)) {
    failRevision('REVISION_ID_POLICY_INVALID', `unknown id_policy: ${context.id_policy}`, { target: context.id_policy });
  }
  if (typeof context.allow_rename_rule !== 'boolean') {
    failRevision('REVISION_CONTRACT_INVALID', 'allow_rename_rule must be a boolean', { target: 'allow_rename_rule' });
  }
  if ((context.statements ?? []).some((statement) => hasCjk(statement))) {
    failRevision('REVISION_STATEMENT_NOT_ENGLISH', 'plan statements must be English', { target: 'statements' });
  }
  return true;
}

export function deriveVersion(baselineVersion, operations) {
  const bump = operations.some((operation) => MAJOR_OPERATIONS.has(operation.op))
    ? 'major'
    : operations.some((operation) => MINOR_OPERATIONS.has(operation.op))
      ? 'minor'
      : 'patch';
  return bumpVersion(baselineVersion, bump);
}

export function bumpVersion(version, bump) {
  const match = String(version).match(SEMVER_PATTERN);
  if (!match) failRevision('REVISION_VERSION_INVALID', `invalid semver: ${version}`, { target: version });
  let [, major, minor, patch] = match.map((value, index) => (index === 0 ? value : Number(value)));
  major = Number(major);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function inferRole({ adapter, plan, frontMatter }) {
  if (frontMatter.role) return frontMatter.role;
  if (adapter === 'okf') return plan?.role === 'okf-update' ? 'okf-update' : 'okf-reference';
  if (adapter === 'law') {
    return (plan?.operations ?? []).some((operation) => operation.op !== 'process-directive' && operation.op !== 'completion-criterion')
      ? 'law-revision'
      : 'unclear';
  }
  return 'unclear';
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function convertEpochToDate(value) {
  if (!value) return null;
  if (ISO_DATE_PATTERN.test(String(value))) return String(value);
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
