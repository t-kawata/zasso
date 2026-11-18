// @verifies C011
// @verifies C012
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyLawSkill } from '../../../.claude/scripts/amend-rfc-up/verify-law-skill.mjs';
import { buildRevisionLedger } from '../../../.claude/scripts/amend-rfc-up/revision/ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const lawSkillRoot = join(repositoryRoot, '.claude/skills/rust-interface-law');
const aliasPath = join(repositoryRoot, '.claude/skills/rust-interface-law.path-alias.json');

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('C011/C012: update mode runs v4 checks and records the revision artifacts', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'law-update-verify-'));
  try {
    const skillPath = join(workspace, 'rust-interface-law');
    cpSync(lawSkillRoot, skillPath, { recursive: true });
    const ruleConcepts = readJson(join(skillPath, 'source/rule-concepts.json'));
    writeJson(join(skillPath, 'source/baseline/rule-concepts.json'), ruleConcepts);
    writeJson(join(skillPath, 'source/baseline/registry.json'), Object.values(ruleConcepts.byRule).map((rule) => ({
      id: rule.rule_id,
      class: (rule.concept_id.split('/')[1] ?? 'r').toUpperCase(),
      parent: rule.rule_id.split('-')[0],
      applicability: rule.applies_to,
      statement: rule.rule_id,
      verification: 'V1',
      gate: 'review',
    })));
    writeJson(join(skillPath, 'source/revision/context.json'), {
      schema: 'revision-context/v1',
      skill: 'rust-interface-law',
      role: 'law-revision',
      adapter: 'law',
      baseline_version: '0.3.2',
      version: '0.3.3',
      date: '2026-11-18',
      language: 'en',
      id_policy: 'append',
      allow_rename_rule: false,
    });
    writeJson(join(skillPath, 'source/revision/plan.json'), {
      schema: 'revision-plan/v1',
      skill: 'rust-interface-law',
      role: 'law-revision',
      adapter: 'law',
      revision: { sha256: 'document-sha' },
      operations: [],
      interpretations: [],
    });
    writeJson(join(skillPath, 'source/revision/coverage.json'), {
      schema: 'revision-coverage/v1',
      document: 'sources/REVISION-2026-11-18.md',
      items: [],
      counts: { items: 0, unmapped: 0, unaccountedBaseline: 0, coherenceGaps: 0, interpretations: 0 },
    });
    writeJson(join(skillPath, 'source/revision/coherence.json'), {
      schema: 'revision-coherence/v1',
      profile: 'law',
      required: [],
      dispositions: {},
      gaps: [],
    });
    writeJson(join(skillPath, 'source/revision/authorizations.json'), {
      schema: 'revision-authorizations/v1',
      authorizations: [],
    });
    writeJson(join(skillPath, 'source/revision/policy.json'), {
      schema: 'revision-policy/v1',
      directives: [],
      completion_criteria: [],
    });
    writeJson(join(skillPath, 'source/revision/tombstones.json'), { schema: 'revision-tombstones/v1', rules: [] });
    writeJson(join(skillPath, 'source/revision/revision-log.json'), {
      schema: 'revision-log/v1',
      status: 'installed',
      deterministic: true,
      date: '2026-11-18',
      version: '0.3.3',
      baseline_version: '0.3.2',
      counts: { added: 0, updated: 0, retired: 0 },
    });
    const ledger = buildRevisionLedger({
      baseline: { digest: 'baseline-digest', version: '0.3.2' },
      plan: { revision: { sha256: 'document-sha' } },
      effective: { rules: {} },
      authorizations: { authorizations: [] },
    });
    writeJson(join(skillPath, 'source/revision/ledger.json'), ledger);
    writeJson(join(skillPath, 'source/baseline.json'), {
      schema: 'revision-baseline/v1',
      skill: 'rust-interface-law',
      version: '0.3.2',
      origin: 'installed',
      digest: 'baseline-digest',
    });

    const report = await verifyLawSkill({
      skillPath,
      root: repositoryRoot,
      mode: 'installed',
      pathAlias: aliasPath,
      kind: 'update',
    });
    assert.equal(report.kind, 'update');
    assert.equal(report.check_set_version, '4');
    assert.equal(report.checks.revisionContract.status, 'machine_verified');
    assert.equal(report.checks.revisionPreservation.status, 'machine_verified');
    assert.equal(report.checks.revisionLedger.status, 'machine_verified');
    assert.equal(report.required_checks.includes('rulePreservation'), false);
    assert.equal(report.required_checks.includes('revisionContract'), true);
    assert.equal(existsSync(join(skillPath, 'source/revision/context.json')), true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
