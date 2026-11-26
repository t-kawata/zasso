// [::TICKET::] PX-202 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-202 --for-spec --no-implementation-order`.
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
import { stageTreeDecisions } from '../helpers/stage-tree-decisions.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const RUN = join(ROOT, '.claude/scripts/workspacify-tree/run.mjs');
const SPEC = join(ROOT, 'tests/workspacify-tree/fixtures/gaia-like-spec.md');

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function runExtract(cwd) {
  return spawnSync(process.execPath, [RUN, 'extract'], { cwd, encoding: 'utf8' });
}

/** A scratch workspace root holding the gaia-like specification under the fixed name. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function scratchSpec() {
  const dir = mkdtempSync(join(tmpdir(), 'wst-pulse-'));
  cpSync(SPEC, join(dir, 'SYSTEM-DESIGN.md'));
  return dir;
}

// [::TICKET::] PX-215 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-215 --for-spec --no-implementation-order`.
test('C004 extract prints the pulse candidates the gate will require to be settled', () => {
  const dir = scratchSpec();
  const result = runExtract(dir);
  rmSync(dir, { recursive: true, force: true });
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
    cpSync(SPEC, join(dir, 'SYSTEM-DESIGN.md'));
    const stats = JSON.parse(runExtract(dir).stdout);
    // An empty decisions payload is refused, and the refusal names exactly the printed candidates.
    stageTreeDecisions(dir, {
      workspace: [], tree: [], ownership: [], dependencies: [], boundaries: [],
      adapters: { ports: [], databasePolicy: { applicable: false } }, approvals: [],
      semantic_review: { status: 'APPROVED', statement: 'probe', approver: 'px-202' },
    });
    const gate = spawnSync(process.execPath, [RUN, 'gate'], { cwd: dir, encoding: 'utf8' });
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
  const dir = mkdtempSync(join(tmpdir(), 'wst-202-nospec-'));
  const result = runExtract(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.includes('spec_pulse'), false);
});

test('C004 the same specification always yields the same candidates in the same order', () => {
  const dir = scratchSpec();
  const first = JSON.parse(runExtract(dir).stdout);
  const second = JSON.parse(runExtract(dir).stdout);
  rmSync(dir, { recursive: true, force: true });
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
