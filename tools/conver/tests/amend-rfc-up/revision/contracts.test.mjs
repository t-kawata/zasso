// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// @verifies C007
// @verifies C008
// @verifies C009
// @verifies C010
// @verifies C011
// @verifies C012
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDocumentMap,
  measureDocument,
  resolveSourcePath,
} from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import {
  inferRevisionContext,
  validateRevisionContext,
} from '../../../.claude/scripts/amend-rfc-up/revision/context.mjs';
import { validateRevisionPlan } from '../../../.claude/scripts/amend-rfc-up/revision/plan.mjs';
import {
  assertCoverageComplete,
  buildRevisionCoverage,
} from '../../../.claude/scripts/amend-rfc-up/revision/coverage.mjs';
import { applyIdentityOperations } from '../../../.claude/scripts/amend-rfc-up/revision/identity.mjs';
import { assertCoherence, buildCoherenceMatrix } from '../../../.claude/scripts/amend-rfc-up/revision/coherence.mjs';
import {
  assertAuthorizations,
  buildAuthorizations,
} from '../../../.claude/scripts/amend-rfc-up/revision/authorization.mjs';
import { assertLedger, buildRevisionLedger } from '../../../.claude/scripts/amend-rfc-up/revision/ledger.mjs';
import { canonicalJson, sha256Text } from '../../../.claude/scripts/amend-rfc-up/revision/determinism.mjs';
import { assertRole, classifyDocumentRole } from '../../../.claude/scripts/amend-rfc-up/revision/roles.mjs';
import { parseProcessDirectives, validatePolicy } from '../../../.claude/scripts/amend-rfc-up/revision/policy.mjs';
import { verifyLawSkill } from '../../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const lawSkillRoot = join(repositoryRoot, '.claude/skills/rust-interface-law');
const lawAliasPath = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function lineOf(text, needle) {
  const index = text.split('\n').findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : 1;
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function evidence(text, needle) {
  const line = lineOf(text, needle);
  return { line, line_sha256: sha256Text(text.split('\n')[line - 1]) };
}

test('C010: a Japanese document is measured and its map contains no raw CJK text', () => {
  const text = '# 改定\n\nREST-01 は再認可を MUST とする。\n';
  const measured = measureDocument({ text, path: 'revision-ja.md' });
  assert.equal(measured.language, 'ja');
  assert.equal(measured.lineCount, 3);
  const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
  assert.equal(JSON.stringify(map).includes('改定'), false);
  assert.equal(JSON.stringify(map).includes('再認可'), false);
  assert.equal(map.lineHashes.length, 3);
});

test('C002: a bare update document infers role, version, date, and language', () => {
  const text = '# Revision\n\nREST-01 MUST re-authorize the current caller.\n';
  const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
  const plan = {
    schema: 'revision-plan/v1',
    operations: [{ op: 'update-rule', target: 'REST-01', statement: 'REST-01 MUST re-authorize the current caller.' }],
  };
  const context = inferRevisionContext({
    skillName: 'rust-interface-law',
    adapter: 'law',
    documentMap: map,
    baseline: { version: '0.3.2', digest: 'baseline-digest' },
    plan,
    ticket: { date: '2026-11-18' },
    env: {},
  });
  assert.equal(context.role, 'law-revision');
  assert.equal(context.version, '0.4.0');
  assert.equal(context.date, '2026-11-18');
  assert.equal(context.id_policy, 'append');
  assert.doesNotThrow(() => validateRevisionContext(context));
});

test('C010: CJK in a plan statement and an escaping path are rejected', () => {
  const context = {
    schema: 'revision-context/v1',
    skill: 'rust-interface-law',
    role: 'law-revision',
    adapter: 'law',
    baseline_version: '0.3.2',
    version: '0.4.0',
    date: '2026-11-18',
    language: 'ja',
    id_policy: 'append',
    allow_rename_rule: false,
  };
  assert.throws(
    () => validateRevisionContext({ ...context, statements: ['日本語'] }),
    (error) => error.code === 'REVISION_STATEMENT_NOT_ENGLISH',
  );
  assert.throws(
    () => resolveSourcePath('../escape.md', repositoryRoot),
    (error) => error.code === 'REVISION_SOURCE_OUTSIDE_ROOT',
  );
});

test('C004/C005: plan validation rejects a missing target and a re-used retired ID', () => {
  const text = '# Revision\n\nREST-01 MUST stay stable.\n';
  const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
  const baseline = {
    rules: { 'REST-01': { concept_id: 'rules/r/rest-01', statement_sha256: 'a'.repeat(64) } },
    concepts: {},
    tombstones: ['REST-99'],
  };
  assert.throws(
    () => validateRevisionPlan({
      plan: { schema: 'revision-plan/v1', operations: [{ op: 'update-rule', target: 'REST-404', statement: 'x', evidence: evidence(text, 'REST-01') }] },
      baseline,
      documentMap: map,
      policy: {},
    }),
    (error) => error.code === 'REVISION_TARGET_MISSING',
  );
  assert.throws(
    () => validateRevisionPlan({
      plan: { schema: 'revision-plan/v1', operations: [{ op: 'add-rule', id: 'REST-99', statement: 'x', evidence: evidence(text, 'REST-01'), id_rationale: 'independent' }] },
      baseline,
      documentMap: map,
      policy: {},
    }),
    (error) => error.code === 'RULE_ID_REUSED',
  );
});

test('C004: coverage requires every content block to have a disposition', () => {
  const text = '# Revision\n\nOne obligation.\n\nAnother obligation.\n';
  const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
  const plan = {
    schema: 'revision-plan/v1',
    operations: [{ op: 'update-rule', target: 'REST-01', statement: 'One obligation.', evidence: evidence(text, 'One obligation.') }],
  };
  const coverage = buildRevisionCoverage({ documentMap: map, plan, interpretations: [] });
  assert.equal(coverage.counts.unmapped > 0, true);
  assert.throws(() => assertCoverageComplete(coverage), (error) => error.code === 'REVISION_COVERAGE_GAP');
  const complete = buildRevisionCoverage({
    documentMap: map,
    plan,
    interpretations: [{ line: lineOf(text, 'Another obligation.'), line_sha256: sha256Text('Another obligation.'), disposition: 'no-op', rationale: 'restatement' }],
  });
  assert.equal(complete.counts.unmapped, 0);
  assert.doesNotThrow(() => assertCoverageComplete(complete));
});

test('C005: identity preserves update IDs, tombstones retirement, and rejects reuse', () => {
  const updated = applyIdentityOperations({
    baselineRuleIds: ['REST-01'],
    baselineConceptIds: [],
    tombstones: [],
    operations: [{ op: 'update-rule', target: 'REST-01' }],
  });
  assert.equal(updated.rules['REST-01'].concept_id, 'rules/r/rest-01');
  const retired = applyIdentityOperations({
    baselineRuleIds: ['REST-01'],
    baselineConceptIds: [],
    tombstones: [],
    operations: [{ op: 'retire-rule', target: 'REST-01' }],
  });
  assert.equal(retired.tombstones.includes('REST-01'), true);
  assert.throws(
    () => applyIdentityOperations({
      baselineRuleIds: [],
      baselineConceptIds: [],
      tombstones: ['REST-01'],
      operations: [{ op: 'add-rule', id: 'REST-01' }],
    }),
    (error) => error.code === 'RULE_ID_REUSED',
  );
});

test('C006: law and OKF coherence profiles differ and gaps fail closed', () => {
  const law = buildCoherenceMatrix({
    profile: 'law',
    required: ['body', 'registry', 'api', 'profile', 'conformance', 'template'],
    dispositions: {
      body: { op: 'C-001' },
      registry: { op: 'C-002' },
      api: { op: 'C-003' },
      profile: { op: 'C-004' },
      conformance: { op: 'C-005' },
      template: { unchanged: 'interface-neutral' },
    },
  });
  assert.equal(law.gaps.length, 0);
  assert.throws(() => assertCoherence({ ...law, gaps: ['api'] }), (error) => error.code === 'REVISION_COHERENCE_GAP');
  const okf = buildCoherenceMatrix({
    profile: 'okf',
    required: ['body', 'graph', 'index', 'log', 'freshness', 'trust'],
    dispositions: {
      body: { op: 'C-010' },
      graph: { op: 'C-011' },
      index: { op: 'C-012' },
      log: { op: 'C-013' },
      freshness: { op: 'C-014' },
      trust: { op: 'C-015' },
    },
  });
  assert.equal(okf.required.includes('api'), false);
  assert.equal(okf.gaps.length, 0);
});

test('C007: destructive operations carry document evidence, external approval is optional', () => {
  const text = '# Revision\n\nREST-01 is retired.\n';
  const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
  assert.throws(
    () => buildAuthorizations({
      plan: { operations: [{ op: 'retire-rule', target: 'REST-01' }] },
      documentMap: map,
    }),
    (error) => error.code === 'AUTHORIZATION_MISSING',
  );
  const auth = buildAuthorizations({
    plan: { operations: [{ op: 'retire-rule', target: 'REST-01', evidence: evidence(text, 'REST-01') }] },
    documentMap: map,
  });
  assert.equal(auth.authorizations[0].source, 'revision-document');
  assert.equal(auth.authorizations[0].external_approval_sha256, null);
  assert.doesNotThrow(() => assertAuthorizations(auth));
});

test('C008: the ledger is deterministic and tampering fails closed', () => {
  const ledger = buildRevisionLedger({
    baseline: { digest: 'baseline' },
    plan: { revision: { sha256: 'revision' } },
    effective: { rules: { 'REST-01': { concept_id: 'rules/r/rest-01' } } },
    authorizations: { authorizations: [] },
  });
  assert.equal(typeof ledger.ledger_sha256, 'string');
  assert.equal(ledger.ledger_sha256.length, 64);
  assert.throws(
    () => assertLedger({ ...ledger, ledger_sha256: '0'.repeat(64) }),
    (error) => error.code === 'REVISION_LEDGER_DRIFT',
  );
});

test('C008: canonical JSON is stable and idempotent for equal inputs', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(sha256Text('same'), sha256Text('same'));
  assert.notEqual(sha256Text('same'), sha256Text('different'));
});

test('C009: role classification and adapter mismatch are enforced', () => {
  assert.equal(classifyDocumentRole({ skillName: 'rust-interface-law', adapter: 'law', text: 'A rule MUST hold.' }), 'law-revision');
  assert.equal(classifyDocumentRole({ skillName: 'natenv-okf', adapter: 'okf', text: 'A reference article.' }), 'okf-reference');
  assert.throws(() => assertRole({ role: 'law-revision', adapter: 'okf' }), (error) => error.code === 'UPDATE_ROLE_MISMATCH');
  assert.throws(() => assertRole({ role: 'mixed' }), (error) => error.code === 'UPDATE_ROLE_MIXED_UNSUPPORTED');
});

test('C004: process directives never become law rules and completion criteria map to conformance', () => {
  const policy = parseProcessDirectives({
    plan: {
      operations: [
        { op: 'process-directive', id: 'P-001', directive: 'do not reassign existing IDs' },
        { op: 'completion-criterion', id: 'E-001', criterion: 'two implementations agree', conformance_target: 'CONF-99' },
      ],
    },
  });
  assert.equal(policy.directives.length, 1);
  assert.equal(policy.completion_criteria.length, 1);
  assert.throws(
    () => validatePolicy({ ...policy, directives: [{ id: 'REST-01', directive: 'x' }] }),
    (error) => error.code === 'PROCESS_DIRECTIVE_AS_RULE',
  );
});

test('C001/C011: build mode remains v3 and requires no revision artifacts', async () => {
  const report = await verifyLawSkill({
    skillPath: lawSkillRoot,
    root: repositoryRoot,
    mode: 'installed',
    pathAlias: lawAliasPath,
    kind: 'build',
  });
  assert.equal(report.kind, 'build');
  assert.equal(report.check_set_version, '3');
  assert.equal(report.checks.rulePreservation.status, 'machine_verified');
  assert.equal(existsSync(join(lawSkillRoot, 'source/revision/plan.json')), false);
  assert.ok(report.required_checks.includes('rulePreservation'));
  assert.equal(report.required_checks.includes('revisionContract'), false);
});
