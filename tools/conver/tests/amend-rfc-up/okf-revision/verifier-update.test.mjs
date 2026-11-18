// @verifies C011
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyOkfSkill } from '../../../.claude/scripts/amend-rfc-up/verify-okf-skill.mjs';
import { buildRevisionLedger } from '../../../.claude/scripts/amend-rfc-up/revision/ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '../../..');
const okfSkillRoot = join(repositoryRoot, '.claude/skills/natenv-okf');

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('C011: OKF update mode runs v4 checks on a valid installed skill', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'okf-update-verify-'));
  try {
    const skillPath = join(workspace, 'natenv-okf');
    cpSync(okfSkillRoot, skillPath, { recursive: true });
    const inventory = readJson(join(skillPath, 'source/concept-inventory.json'));
    writeJson(join(skillPath, 'source/baseline/concept-inventory.json'), inventory);
    writeJson(join(skillPath, 'source/baseline/atoms.lock.json'), readJson(join(skillPath, 'atoms.lock.json')));
    writeJson(join(skillPath, 'source/baseline/coverage.json'), readJson(join(skillPath, 'source/coverage.json')));
    writeJson(join(skillPath, 'source/revision/context.json'), {
      schema: 'revision-context/v1',
      skill: 'natenv-okf',
      role: 'okf-reference',
      adapter: 'okf',
      baseline_version: '0.1.0',
      version: '0.1.1',
      date: '2026-11-18',
      language: 'en',
      id_policy: 'append',
      allow_rename_rule: false,
    });
    writeJson(join(skillPath, 'source/revision/plan.json'), {
      schema: 'revision-plan/v1',
      skill: 'natenv-okf',
      role: 'okf-reference',
      adapter: 'okf',
      revision: { sha256: 'document-sha' },
      operations: [],
      interpretations: [],
    });
    writeJson(join(skillPath, 'source/revision/coverage.json'), {
      schema: 'revision-coverage/v1',
      document: 'sources/REFERENCE-2026-11-18.md',
      items: [],
      counts: { items: 0, unmapped: 0, unaccountedBaseline: 0, coherenceGaps: 0, interpretations: 0 },
    });
    writeJson(join(skillPath, 'source/revision/coherence.json'), {
      schema: 'revision-coherence/v1',
      profile: 'okf',
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
    writeJson(join(skillPath, 'source/revision/tombstones.json'), { schema: 'revision-tombstones/v1', concepts: [] });
    writeJson(join(skillPath, 'source/revision/revision-log.json'), {
      schema: 'revision-log/v1',
      status: 'installed',
      deterministic: true,
      date: '2026-11-18',
      version: '0.1.1',
      baseline_version: '0.1.0',
    });
    writeJson(join(skillPath, 'source/revision/ledger.json'), buildRevisionLedger({
      baseline: { digest: 'baseline-digest', version: '0.1.0' },
      plan: { revision: { sha256: 'document-sha' } },
      effective: { rules: {} },
      authorizations: { authorizations: [] },
    }));
    writeJson(join(skillPath, 'source/baseline.json'), {
      schema: 'revision-baseline/v1',
      skill: 'natenv-okf',
      version: '0.1.0',
      origin: 'installed',
      digest: 'baseline-digest',
    });

    const report = await verifyOkfSkill({
      skillPath,
      root: repositoryRoot,
      mode: 'installed',
      kind: 'update',
    });
    assert.equal(report.kind, 'update');
    assert.equal(report.check_set_version, '4');
    assert.equal(report.checks.revisionContract.status, 'machine_verified');
    assert.equal(report.checks.revisionPreservation.status, 'machine_verified');
    assert.equal(report.checks.revisionLedger.status, 'machine_verified');
    assert.equal(report.required_checks.includes('revisionContract'), true);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
