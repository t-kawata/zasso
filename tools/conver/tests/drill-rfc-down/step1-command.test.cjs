/**
 * step1-command.test.cjs — Static verification of the /drill-rfc-down Step 1 command definition
 *
 * Covers contracts C001/C002 of PX-159:
 *   - Step 1 contains sub-steps 1-1..1-12, each advancing status via
 *     update-status.js set-step (C001 postcondition + invariant)
 *   - Step 1 is self-contained: no reference to /grill-me-for-rfc or
 *     /drill-rfc-down-old; only $DRILL_DIR scripts and [VARIABLES] variables (C002)
 *
 * RED at make time: Step 1 is a placeholder referencing the other commands.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const COMMAND_FILE = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');
const DRILL_DIR = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down');
const md = fs.readFileSync(COMMAND_FILE, 'utf8');

/** Slice the Step 1 section (between "### Step 1: grill" and "### Step 2: graphify"). */
function step1Section() {
  const start = md.indexOf('### Step 1: grill');
  const end = md.indexOf('### Step 2: graphify', start);
  assert.ok(start !== -1, 'Step 1 heading present');
  assert.ok(end !== -1, 'Step 2 heading present (bounds Step 1)');
  return md.slice(start, end);
}

describe('Step 1 command definition', () => {
  it('contains sub-steps 1-1 through 1-12', () => {
    for (let i = 1; i <= 12; i++) {
      assert.match(md, new RegExp(`#### 1-${i}\\.`), `sub-step 1-${i} heading present`);
    }
  });

  it('every sub-step advances status via update-status.js set-step (C001 invariant)', () => {
    const stepRegex = /#### (1-\d+)\./g;
    const steps = [...md.matchAll(stepRegex)].map((m) => m[1]);
    assert.ok(steps.length >= 12, `found ${steps.length} sub-steps`);
    for (const step of steps) {
      const pos = md.indexOf(`#### ${step}.`);
      const nextPos = md.indexOf('#### ', pos + 1);
      const section = nextPos === -1 ? md.slice(pos) : md.slice(pos, nextPos);
      assert.match(section, /update-status\.js/, `step ${step} invokes update-status.js`);
      assert.match(section, /set-step/, `step ${step} advances via set-step`);
    }
  });

  it('is self-contained: no reference to /grill-me-for-rfc or /drill-rfc-down-old in Step 1 (C002)', () => {
    assert.doesNotMatch(step1Section(), /grill-me-for-rfc|drill-rfc-down-old/);
  });

  it('uses only $DRILL_DIR scripts in Step 1', () => {
    const step1 = step1Section();
    const scriptRefs = [...step1.matchAll(/\$DRILL_DIR\/([\w.-]+)/g)].map((m) => m[1]);
    assert.ok(scriptRefs.length > 0, 'Step 1 references at least one $DRILL_DIR script');
    // No bare .claude/scripts/grill-me-for-rfc path (self-containment)
    assert.doesNotMatch(step1, /\.claude\/scripts\/grill-me-for-rfc/);
  });

  it('uses only [VARIABLES] block variables in Step 1 (C002 invariant)', () => {
    const step1 = step1Section();
    const allowedVars = ['RFC_PATH', 'RFC_DIR', 'GRAPH_PATH', 'DIRS_TREE_PATH', 'README_PATH', 'TICKETS_PATH', 'SESSION_DIR', 'DRILL_DIR'];
    const usedVars = [...step1.matchAll(/\$([A-Z_]+)/g)].map((m) => m[1]);
    assert.ok(usedVars.length > 0, 'Step 1 uses at least one variable');
    for (const usedVar of usedVars) {
      assert.ok(allowedVars.includes(usedVar), `$${usedVar} comes from the [VARIABLES] block`);
    }
  });
});

/** Slice a sub-step section between two `#### N-M.` headings. */
function subStepSection(id) {
  const start = md.indexOf(`#### ${id}.`);
  const end = md.indexOf('#### ', start + 1);
  assert.ok(start !== -1, `${id} present`);
  return end === -1 ? md.slice(start) : md.slice(start, end);
}

describe('Step 1-5 grill First-Class Rules', () => {
  it('documents the 4-part question structure', () => {
    const step15 = subStepSection('1-5');
    assert.match(step15, /Q番号|Q<number>|Q[0-9]/, 'question ID');
    assert.match(step15, /背景と理由/, 'background and rationale');
    assert.match(step15, /改行区切り|選択肢/, 'line-broken choices');
    assert.match(step15, /推奨と根拠|推奨/, 'recommendation with rationale');
  });

  it('documents coarse-granularity bundling, two-pass, and per-turn summary', () => {
    const step15 = subStepSection('1-5');
    assert.match(step15, /3-5|粗粒度|バンドル/, 'question bundling granularity');
    assert.match(step15, /2パス|2 パス|全体.*詳細/, 'two-pass approach');
    assert.match(step15, /ターン.*要約|要約/, 'per-turn summary');
  });

  it('documents no RFC writing during grill and immediate node updates', () => {
    const step15 = subStepSection('1-5');
    assert.match(step15, /RFC を書かない|RFCを書かない/, 'no RFC writing during grill');
    assert.match(step15, /即時|即座/, 'immediate node resolution');
  });

  it('documents the full DesignTree operation set and tree-query', () => {
    const step15 = subStepSection('1-5');
    assert.match(step15, /batch-resolve|add-child|refine|delete|open-count/, 'DesignTree operations');
    assert.match(step15, /tree-query/, 'tree-query referenced');
  });
});

describe('Step 1-11 (evolution verification + AI expert judgment)', () => {
  it('1-11 includes AI expert judgment on danger/omission/contradiction/deficiency', () => {
    const step111 = subStepSection('1-11');
    assert.match(step111, /エキスパート/, 'AI expert judgment mentioned');
    assert.match(step111, /危険/, 'danger criterion');
    assert.match(step111, /漏れ/, 'omission criterion');
    assert.match(step111, /不足/, 'deficiency criterion');
  });

  it('1-11 includes a no-compromise loop back to 1-8 when judged insufficient', () => {
    const step111 = subStepSection('1-11');
    assert.match(step111, /1-8 へ戻|1-8へ戻/, 'loop back to 1-8');
    assert.match(step111, /妥協無く|妥協なし/, 'no-compromise loop');
  });
});

describe('Step 1-5 add operation (grill-time new top-level nodes)', () => {
  it('1-5 includes the standalone add operation (original STEP 2)', () => {
    const step15 = subStepSection('1-5');
    assert.match(step15, /`add`/, 'operation list mentions `add` (distinct from add-child)');
    assert.match(step15, /update-tree\.js"\s+"\$SESSION_DIR"\s+add\s+'/, 'command block shows add <json>');
  });
});

describe('Step 1-8 / 1-9 (RFC append + checklist verify)', () => {
  it('1-8 requires a code snippet for every design decision and self-contained coverage (original STEP 5)', () => {
    const step18 = subStepSection('1-8');
    assert.match(step18, /コード例|コードスニペット|コードブロック/, 'code snippet required');
    assert.match(step18, /自己完結|完全/, 'self-contained coverage');
    assert.match(step18, /TBD|TODO|スタブ|委譲/, 'no TBD/TODO/stub/delegation');
  });

  it('1-9 issues an immediate warning on TBD/TODO and defers completion until written (original STEP 6)', () => {
    const step19 = subStepSection('1-9');
    assert.match(step19, /TBD|TODO/, 'TBD/TODO mentioned');
    assert.match(step19, /即時警告|警告/, 'immediate warning');
    assert.match(step19, /完了宣言しない|宣言しない/, 'no completion declaration until fixed');
  });
});

describe('Step 1-6 / 1-7 (grill end + checklist)', () => {
  it('1-6 proposes ending the grill and asks the user about generating the checklist (original STEP 3)', () => {
    const step16 = subStepSection('1-6');
    assert.match(step16, /CheckList|チェックリスト/, 'checklist mentioned');
    assert.match(step16, /問う|確認|開始しますか/, 'asks the user about the checklist');
  });

  it('1-7 requires AI full review/supplement (ambiguous nodes, project constraints) and user approval (original STEP 4)', () => {
    const step17 = subStepSection('1-7');
    assert.match(step17, /全項目|全て/, 'reviews all items');
    assert.match(step17, /曖昧|補足/, 'notes for ambiguous nodes');
    assert.match(step17, /プロジェクト固有|制約/, 'appends project-specific constraints');
    assert.match(step17, /承認/, 'user approval');
  });
});

describe('tree-query.js relocation', () => {
  it('exists in $DRILL_DIR (so Step 1-5 can reference it)', () => {
    assert.ok(fs.existsSync(path.join(DRILL_DIR, 'tree-query.js')), 'tree-query.js present in $DRILL_DIR');
  });
});
