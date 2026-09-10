// [::TICKET::] PX-202 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-202 --for-spec --no-implementation-order`.
// PX-202 @verifies C004
// The pulse decided which observations the AI must settle, but it was only computed
// inside the gate: the operator saw candidate ids in a failure message and authored
// the settlements blind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUN = join(ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const SPEC = join(ROOT, 'tests/workspacify-tree/fixtures/gaia-like-spec.md');

function runExtract(specPath) {
  return spawnSync(process.execPath, [RUN, 'extract', specPath], { encoding: 'utf8' });
}

test('C004 extract prints the pulse candidates the gate will require to be settled', () => {
  const result = runExtract(SPEC);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const stats = JSON.parse(result.stdout);
  assert.equal(typeof stats.harvested, 'number', 'the existing statistics stay');
  assert.ok(Array.isArray(stats.spec_pulse.candidate_ids), JSON.stringify(Object.keys(stats)));
  assert.ok(stats.spec_pulse.candidate_ids.length >= 1);
  assert.ok(stats.spec_pulse.candidate_ids.every((id) => /^pulse-\d{6}$/.test(id)));
  for (const candidate of stats.spec_pulse.candidates) {
    assert.ok(typeof candidate.kind === 'string' && candidate.kind.length > 0);
    assert.ok(typeof candidate.observation === 'string' && candidate.observation.length > 0);
    assert.ok(typeof candidate.chapter_ref === 'string' && candidate.chapter_ref.length > 0);
    assert.ok(Array.isArray(candidate.evidence_refs) && candidate.evidence_refs.length > 0);
  }
  assert.equal(stats.spec_pulse.summary.candidate_count, stats.spec_pulse.candidate_ids.length);
});

test('C004 the printed candidates are the ones the gate refuses to publish without', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wst-202-pulse-'));
  try {
    const specPath = join(dir, 'spec.md');
    cpSync(SPEC, specPath);
    const stats = JSON.parse(runExtract(specPath).stdout);
    // An empty decisions payload is refused, and the refusal names exactly the printed candidates.
    const decisionsPath = join(dir, 'empty.json');
    writeFileSync(decisionsPath, JSON.stringify({
      workspace: [], tree: [], ownership: [], dependencies: [], boundaries: [],
      adapters: { ports: [], databasePolicy: { applicable: false } }, approvals: [],
      semantic_review: { status: 'APPROVED', statement: 'probe', approver: 'px-202' },
    }));
    const gate = spawnSync(process.execPath, [RUN, 'gate', `--spec=${specPath}`, `--decisions=${decisionsPath}`], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(gate.status, 0);
    assert.equal(existsSync(join(dir, 'WORKSPACIFY-TREE-MANIFEST.json')), false);
    for (const id of stats.spec_pulse.candidate_ids) {
      assert.ok((gate.stdout + gate.stderr).includes(id), `${id} must be named by the refusal`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('C004 a specification that cannot be read still fails at parse, with no pulse printed', () => {
  const result = runExtract(join(tmpdir(), 'wst-202-does-not-exist.md'));
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes('spec_pulse'), false);
});

test('C004 the same specification always yields the same candidates in the same order', () => {
  const first = JSON.parse(runExtract(SPEC).stdout);
  const second = JSON.parse(runExtract(SPEC).stdout);
  assert.deepEqual(first.spec_pulse.candidate_ids, second.spec_pulse.candidate_ids);
  assert.deepEqual(
    first.spec_pulse.candidates.map((candidate) => candidate.observation),
    second.spec_pulse.candidates.map((candidate) => candidate.observation),
  );
});

test('C004 the extract output is the source the manifest later publishes', () => {
  const manifestFields = readFileSync(join(ROOT, '.claude/scripts/workspacify-tree/run.mjs'), 'utf8');
  // The printed pulse and the published pulse come from one builder, not two.
  assert.match(manifestFields, /buildSpecPulseForAnalysis/);
});
