// [::TICKET::] PX-199 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-199 --for-spec --no-implementation-order`.
// PX-199 @verifies C002 C003
// Every pulse candidate must be settled by the AI in this session: resolved in
// spec_defects or carried as a residual_question for the later human grill. Asking
// a human now is forbidden, and the proof must never pass vacuously.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSpecDefects, FORBIDDEN_PHRASES } from '../../../.claude/scripts/workspacify-tree/lib/spec-defects.mjs';
import { buildSpecPulse } from '../../../.claude/scripts/workspacify-tree/lib/spec-pulse.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { harvestObjectCandidates } from '../../../.claude/scripts/workspacify-tree/lib/extraction.mjs';
import { segmentAtHeadings } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url));
const CANDIDATES = [
  { id: 'pulse-000001', kind: 'isolated_chapter', chapter_ref: 'h-000002', observation: 'x.', evidence_refs: ['h-000002'] },
  { id: 'pulse-000002', kind: 'extraction_gap', chapter_ref: 'h-000003', observation: 'y.', evidence_refs: ['h-000003'] },
];

function resolved() {
  return {
    candidates: CANDIDATES,
    specDefects: [{
      candidate_id: 'pulse-000001', ai_interpretation: 'the overview explains context only',
      chosen_default: 'the owning seed carries it as prose', rationale: 'no normative content is stated',
    }],
    residualQuestions: [{
      candidate_id: 'pulse-000002', topic: 'the rule chapter states a MUST with no owner',
      alternatives: ['assign the rule to pkg-a', 'split the chapter'], chosen_default: 'assign to pkg-a',
      why_unresolved: 'the owner choice changes the contract surface and needs the canonical grill',
    }],
  };
}

test('C002 a fully accounted payload passes and every defect field is required', () => {
  const clean = validateSpecDefects(resolved());
  assert.equal(clean.ok, true, JSON.stringify(clean.errors));

  const noRationale = resolved();
  delete noRationale.specDefects[0].rationale;
  assert.ok(validateSpecDefects(noRationale).errors.some((message) => message.includes('rationale')));

  const thinResidual = resolved();
  thinResidual.residualQuestions[0].alternatives = [];
  assert.ok(validateSpecDefects(thinResidual).errors.some((message) => message.includes('alternatives')));

  const noWhy = resolved();
  delete noWhy.residualQuestions[0].why_unresolved;
  assert.ok(validateSpecDefects(noWhy).errors.some((message) => message.includes('why_unresolved')));
});

test('C002 an unaccounted candidate is refused with its id', () => {
  const unaccounted = resolved();
  unaccounted.residualQuestions = [];
  const report = validateSpecDefects(unaccounted);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((message) => message.includes('pulse-000002')), JSON.stringify(report.errors));

  const doubled = resolved();
  doubled.specDefects.push({ ...doubled.specDefects[0], candidate_id: 'pulse-000002' });
  assert.ok(validateSpecDefects(doubled).errors.some((message) => message.includes('more than once') || message.includes('twice')));

  const ghost = resolved();
  ghost.specDefects.push({ candidate_id: 'pulse-999999', ai_interpretation: 'a', chosen_default: 'b', rationale: 'c' });
  assert.ok(validateSpecDefects(ghost).errors.some((message) => message.includes('pulse-999999')));
});

test('C002 no field may ask a human to do the work', () => {
  assert.ok(FORBIDDEN_PHRASES.length >= 5);
  for (const phrase of FORBIDDEN_PHRASES) {
    const payload = resolved();
    payload.specDefects[0].rationale = `see whether ${phrase} applies`;
    const report = validateSpecDefects(payload);
    assert.equal(report.ok, false, `${phrase} must be refused`);
    assert.ok(report.errors.some((message) => message.includes(phrase)), JSON.stringify(report.errors));
  }
});

test('C003 the CLI publishes the pulse summary and both hand-off sets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-199-defects-'));
  try {
    const sourceText = [
      '# Specification', '',
      '## Overview', '', 'Background prose that no other chapter mentions.', '',
      '## Ledger', '', '| object | kind |', '|--------|------|',
      '| LedgerRecord | record |', '',
    ].join('\n');
    const specPath = join(dir, 'spec.md');
    writeFileSync(specPath, sourceText);
    const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
    const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
    const objects = harvestObjectCandidates({ sourceText, headings, segments });
    assert.equal(objects.length, 1, 'the fixture table yields exactly one object, whose id is deterministic');
    const inventory = {
      objects: objects.map((item) => ({ id: item.id, canonical_name: item.canonical_name, source_refs: item.source_refs })),
      claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [],
    };
    const pulse = buildSpecPulse({ sourceText, headings, segments, inventory });
    assert.ok(pulse.candidates.length >= 2, JSON.stringify(pulse.candidates));

    const specDefects = [{ candidate_id: pulse.candidates[0].id, ai_interpretation: 'context prose', chosen_default: 'carried as prose by the owning seed', rationale: 'the chapter states nothing implementable' }];
    const residualQuestions = pulse.candidates.slice(1).map((candidate) => ({
      candidate_id: candidate.id, topic: `observation ${candidate.kind}`, alternatives: ['keep as one package', 'split the chapter'],
      chosen_default: 'keep as one package', why_unresolved: 'the canonical grill decides the split',
    }));

    const decisions = {
      workspace: [{
        id: 'pkg-ledger', name: 'ledger', path: 'crates/protocol/ledger', layer: 'protocol', kind: 'production-library',
        responsibilities: ['own the ledger records'], seed_required: true,
        owns: { objects: objects.map((item) => item.id), claims: [], invariants: [], state_machines: [], error_codes: [], required_tests: [] },
      }],
      tree: [{ name: 'crates', path: 'crates', kind: 'dir', children: [{ name: 'protocol', path: 'crates/protocol', kind: 'dir', children: [{ name: 'ledger', path: 'crates/protocol/ledger', kind: 'dir', children: [] }] }] }],
      ownership: objects.map((item) => ({ objectId: item.id, packageId: 'pkg-ledger' })),
      dependencies: [], adapters: { ports: [], databasePolicy: { applicable: false } }, approvals: [],
      semantic_review: { status: 'APPROVED', statement: 'reviewed the pulse candidates', approver: 'test' },
      spec_defects: specDefects,
      residual_questions: residualQuestions,
    };
    const decisionsPath = join(dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(decisions));

    const result = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const manifest = JSON.parse(readFileSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json'), 'utf8'));
    assert.equal(manifest.structure.spec_pulse.summary.candidate_count, pulse.candidates.length);
    assert.deepEqual(manifest.structure.spec_pulse.candidate_ids, pulse.candidates.map((candidate) => candidate.id));
    assert.equal(manifest.stage2_handoff.spec_defects.length, specDefects.length);
    assert.equal(manifest.stage2_handoff.residual_questions.length, residualQuestions.length);
    assert.equal(manifest.final_audit.spec_defect_count, 0);
    assert.equal(manifest.final_audit.residual_question_count, residualQuestions.length);

    // An unsettled candidate stops the run and names the candidate.
    const unsettledPath = join(dir, 'unsettled.json');
    writeFileSync(unsettledPath, JSON.stringify({ ...decisions, residual_questions: [] }));
    const blocked = spawnSync(process.execPath, [RUN, 'finalize', `--spec=${specPath}`, `--decisions=${unsettledPath}`], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(blocked.status, 0);
    // The machine-readable result is on stdout; the located reason is on stderr.
    assert.ok((blocked.stdout + blocked.stderr).includes(pulse.candidates[1].id), blocked.stdout + blocked.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
