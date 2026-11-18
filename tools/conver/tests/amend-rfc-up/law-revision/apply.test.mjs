// @verifies C003
// @verifies C005
// @verifies C008
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDocumentMap } from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import { inferRevisionContext, validateRevisionContext } from '../../../.claude/scripts/amend-rfc-up/revision/context.mjs';
import { assertLedger } from '../../../.claude/scripts/amend-rfc-up/revision/ledger.mjs';
import { applyLawRevision } from '../../../.claude/scripts/amend-rfc-up/law-revision/apply.mjs';
import { applyRegistryOperations } from '../../../.claude/scripts/amend-rfc-up/law-revision/registry.mjs';

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function makeBaseline(root) {
  mkdirSync(join(root, 'source/baseline'), { recursive: true });
  writeJson(join(root, 'source/rule-concepts.json'), {
    schema: 'law-rule-concepts/v1',
    byRule: {
      'REST-01': {
        rule_id: 'REST-01',
        concept_id: 'rules/r/rest-01',
        path: 'rules/r/rest-01.md',
        phase: 'adapter',
        requires: [],
        required_rules: [],
        applies_to: 'rest',
        source_alias: 'sources/10-CONTRACTS.md',
        source_span: '1-1',
      },
    },
  });
  writeJson(join(root, 'source/baseline/registry.json'), [
    {
      id: 'REST-01',
      class: 'R',
      parent: 'REST',
      applicability: 'rest',
      statement: 'REST-01 MUST expose a typed entry.',
      verification: 'V1',
      gate: 'review',
    },
  ]);
  writeJson(join(root, 'atoms.lock.json'), {
    schema: 'law-atoms/v1',
    check_set_version: '3',
    rules: [{ rule_id: 'REST-01', concept_id: 'rules/r/rest-01', path: 'rules/r/rest-01.md', content_sha256: 'a'.repeat(64) }],
    sections: [],
    sources: [],
  });
  writeJson(join(root, 'source/baseline.json'), {
    schema: 'revision-baseline/v1',
    skill: root,
    version: '0.3.2',
    origin: 'installed',
    digest: 'baseline-digest',
  });
  writeFileSync(join(root, 'PRE-OKF-ORIGINAL.md'), '# Baseline original\n');
}

test('the law adapter writes the update artifacts and identity ledger', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-adapter-'));
  try {
    const baselineSkill = join(workspace, 'baseline-law');
    const outDir = join(workspace, 'staged-law');
    makeBaseline(baselineSkill);
    const text = '# Revision\n\nREST-01 MUST accept an idempotency key.\n';
    const map = buildDocumentMap({ text, alias: 'sources/REVISION-2026-11-18.md' });
    const plan = {
      schema: 'revision-plan/v1',
      skill: 'mini-law',
      role: 'law-revision',
      adapter: 'law',
      revision: { sha256: map.sha256 },
      operations: [
        {
          op: 'update-rule',
          target: 'REST-01',
          statement: 'REST-01 MUST accept an idempotency key.',
          class: 'normative',
          weakening: false,
          evidence: { line: 3, line_sha256: map.lineHashes[2] },
        },
      ],
      interpretations: [],
      coherence: {
        required: ['body', 'source', 'registry', 'api', 'profile', 'conformance', 'policy', 'contract', 'test', 'template', 'index', 'asset'],
        dispositions: Object.fromEntries(
          ['body', 'source', 'registry', 'api', 'profile', 'conformance', 'policy', 'contract', 'test', 'template', 'index', 'asset']
            .map((name) => [name, { unchanged: 'minimal fixture has no such artifact change' }]),
        ),
      },
    };
    const context = inferRevisionContext({
      skillName: 'mini-law',
      adapter: 'law',
      documentMap: map,
      baseline: { version: '0.3.2', digest: 'baseline-digest' },
      plan,
      ticket: { date: '2026-11-18' },
      env: {},
    });
    validateRevisionContext(context);
    const result = await applyLawRevision({
      baselineSkill,
      plan,
      documentMap: map,
      context,
      outDir,
      documentText: text,
      documentAlias: 'sources/REVISION-2026-11-18.md',
    });
    assert.equal(result.coverage.counts.unmapped, 0);
    assert.equal(result.coherence.gaps.length, 0);
    assert.doesNotThrow(() => assertLedger(result.ledger));
    assert.equal(existsSync(join(outDir, 'source/revision/context.json')), true);
    assert.equal(existsSync(join(outDir, 'source/revision/plan.json')), true);
    assert.equal(existsSync(join(outDir, 'source/revision/coverage.json')), true);
    assert.equal(existsSync(join(outDir, 'source/pre-okf-original.json')), true);
    const log = JSON.parse(readFileSync(join(outDir, 'source/revision/revision-log.json'), 'utf8'));
    assert.equal(log.deterministic, true);
    assert.equal(log.status, 'installed');
    assert.equal(result.identity.rules['REST-01'].status, 'updated');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('registry operations apply update, add, retire, and split without losing kept_id', () => {
  const registry = applyRegistryOperations({
    baselineRegistry: [
      { id: 'REST-01', class: 'R', parent: 'REST', applicability: 'rest', statement: 'old', verification: 'V1', gate: 'review' },
      { id: 'REST-02', class: 'R', parent: 'REST', applicability: 'rest', statement: 'retire', verification: 'V1', gate: 'review' },
      { id: 'SSO-08', class: 'C', parent: 'SSO', applicability: 'sso', statement: 'composite', verification: 'V1', gate: 'review' },
    ],
    operations: [
      { op: 'update-rule', target: 'REST-01', statement: 'new' },
      { op: 'add-rule', id: 'REST-03', class: 'R', parent: 'REST', statement: 'added' },
      { op: 'retire-rule', target: 'REST-02' },
      { op: 'split-rule', target: 'SSO-08', kept_id: 'SSO-08', kept_class: 'C', new_rules: [{ id: 'SSO-09', class: 'O', parent: 'SSO', statement: 'extension' }] },
    ],
  });
  assert.equal(registry.find((row) => row.id === 'REST-01').statement, 'new');
  assert.equal(registry.some((row) => row.id === 'REST-02'), false);
  assert.equal(registry.some((row) => row.id === 'REST-03'), true);
  assert.equal(registry.find((row) => row.id === 'SSO-08').class, 'C');
  assert.equal(registry.find((row) => row.id === 'SSO-09').class, 'O');
});
