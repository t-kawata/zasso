// [::TICKET::] PX-198, PX-201 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-198|PX-201) --for-spec --no-implementation-order`.
// PX-198 @verifies C001 C002
// Every gate failure must read as kind advice: what happened, why it matters, and
// the concrete steps that make verification pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { adviseFailure, advisedGateIds } from '../../../.claude/scripts/workspacify-tree/lib/gate-advice.mjs';

const GATE_IDS = ['G0', 'G0.1', 'G0.3', 'G2', 'G2.2', 'G2.4', 'G3', 'G3.1', 'G3.2', 'G3.5', 'G3.6', 'G3.7', 'G4', 'G5', 'G6.1', 'G6.4', 'G6.5', 'G6.6', 'GENERAL'];

test('C001 every gate has dedicated advice naming what, why and how', () => {
  assert.deepEqual(advisedGateIds().sort(), GATE_IDS.slice().sort());
  for (const gateId of GATE_IDS) {
    const lines = adviseFailure({ gateId, reason: 'the reported problem', stage: 'workspacify-allocate' });
    const text = lines.join('\n');
    assert.match(text, /What happened:/, `${gateId} must state what happened`);
    assert.match(text, /Why this matters:/, `${gateId} must state why it matters`);
    assert.match(text, /How to fix it:/, `${gateId} must state how to fix it`);
    assert.match(text, /the reported problem/, `${gateId} must repeat the gate's own reason`);
    assert.ok(lines.length >= 5, `${gateId} must list at least two repair steps`);
    const steps = lines.filter((line) => line.startsWith('  - '));
    assert.ok(steps.length >= 2, `${gateId} must give at least two concrete steps`);
    assert.ok(steps.some((step) => /run |re-run|open |remove |keep |author |fix |move |add |confirm /i.test(step)), `${gateId} steps must be imperative`);
    assert.ok(steps.some((step) => /manifest|decision|seed|contract|specification|directory|gate|finalize|validate|plan/.test(step)), `${gateId} steps must name the artefact or command`);
  }
});

test('C002 an unknown gate still yields advice instead of a bare reason', () => {
  const text = adviseFailure({ gateId: 'G99', reason: 'mystery' }).join('\n');
  assert.match(text, /What happened: .*G99/);
  assert.match(text, /How to fix it:/);
  assert.ok(adviseFailure({}).join('\n').includes('GENERAL'));
});

test('C002 the CLI prints the advice on a real failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wt-198-cli-'));
  try {
    const result = spawnSync(process.execPath, ['.claude/scripts/workspacify-allocate/run.mjs', 'validate', join(dir, 'missing.json')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /What happened:/);
    assert.match(result.stderr, /Why this matters:/);
    assert.match(result.stderr, /How to fix it:/);
    assert.match(result.stderr, /- /, 'the advice must include concrete steps');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
