/**
 * update-status.test.cjs — Tests for the drill-wide update-status.js (PX-158 Phase 1)
 *
 * Covers contracts C001/C002:
 *   - set-step transitions currentStep and prints the English nextAction (C001)
 *   - currentStep is always an element of the step table (C001 invariant)
 *   - English nextAction is always present in the output (C002 postcondition)
 *   - every step definition has a non-empty English nextAction (C002 invariant)
 *
 * RED at make time: the relocated grill update-status.js has no set-step and no
 * STEP_DEFINITIONS export, so these tests fail until Phase 1 lands (GREEN).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const UPDATE_STATUS = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/update-status.js');

let tmpRoot;
let sessionDir;
let iso;

before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'update-status-'));
  sessionDir = path.join(tmpRoot, 'session');
  fs.mkdirSync(sessionDir, { recursive: true });
  iso = '2026-08-20T00:00:00.000Z';
  // A complete session (all three files) is required because update-status
  // validates the whole session via check-all-schema.js after every write.
  fs.writeFileSync(path.join(sessionDir, 'DesignTree.json'), JSON.stringify({ version: 1, updatedAt: iso, nodes: [] }));
  fs.writeFileSync(path.join(sessionDir, 'CheckList.md'), '# RFC 要件チェックリスト\n\n<!-- GENERATED -->\n');
  writeStatus({ state: 'GRILLING', currentStep: '1-1', reviewLoopCount: 0 });
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeStatus(overrides) {
  const status = {
    state: 'GRILLING',
    researchPath: '/tmp/rfc.md',
    rfcPath: '/tmp/rfc.md',
    rfcDir: '/tmp',
    reviewLoopCount: 0,
    createdAt: iso,
    updatedAt: iso,
    ...overrides,
  };
  fs.writeFileSync(path.join(sessionDir, 'Status.json'), JSON.stringify(status, null, 2), 'utf8');
  return status;
}

function run(op) {
  return spawnSync(process.execPath, [UPDATE_STATUS, sessionDir, ...op], { encoding: 'utf8' });
}

describe('update-status.js', () => {
  it('set-step advances currentStep and prints the English nextAction', () => {
    writeStatus({ state: 'GRILLING', currentStep: '1-1' });
    const res = run(['set-step', '1-2']);
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.currentStep, '1-2');
    assert.ok(out.nextAction.length > 10, 'English nextAction is non-empty');
  });

  it('rejects an unknown step with exit 1', () => {
    const res = run(['set-step', '99-99']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /unknown step|not.*found|invalid/i);
  });

  it('inc-loop increments reviewLoopCount and still prints nextAction', () => {
    writeStatus({ state: 'GRILLING', currentStep: '1-10', reviewLoopCount: 2 });
    const res = run(['inc-loop']);
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.reviewLoopCount, 3);
    assert.ok(out.nextAction.length > 0);
  });

  it('set-state keeps the grill session state machine and prints nextAction', () => {
    writeStatus({ state: 'GRILLING', currentStep: '1-7' });
    const res = run(['set-state', 'CHECKLIST_APPROVED']);
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.state, 'CHECKLIST_APPROVED');
    assert.ok(out.nextAction.length > 0);
  });

  it('rejects an invalid state with exit 1', () => {
    const res = run(['set-state', 'NOT_A_STATE']);
    assert.equal(res.status, 1);
  });

  it('show prints currentStep and nextAction', () => {
    writeStatus({ state: 'GRILLING', currentStep: '1-5' });
    const res = run(['show']);
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.currentStep, '1-5');
    assert.ok(out.nextAction.length > 0);
  });

  it('step table covers Step 1 sub-steps 1-1..1-12 and Step 2-5 placeholders', async () => {
    const mod = await import(pathToFileURL(UPDATE_STATUS).href);
    const keys = Object.keys(mod.STEP_DEFINITIONS).sort();
    for (let i = 1; i <= 12; i++) {
      assert.ok(keys.includes(`1-${i}`), `step 1-${i} present`);
    }
    const stepPrefixes = new Set(keys.map((k) => k.split('-')[0]));
    for (const p of ['2', '3', '4', '5']) {
      assert.ok(stepPrefixes.has(p), `Step ${p} placeholder present`);
    }
  });

  it('every step definition has a non-empty English nextAction (invariant C002)', async () => {
    const mod = await import(pathToFileURL(UPDATE_STATUS).href);
    for (const [step, def] of Object.entries(mod.STEP_DEFINITIONS)) {
      assert.ok(def.title, `${step} has a title`);
      assert.ok(def.nextAction && def.nextAction.length > 0, `${step} has non-empty English nextAction`);
    }
  });
});
