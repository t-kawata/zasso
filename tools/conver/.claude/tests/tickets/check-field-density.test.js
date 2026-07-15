const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPTS_DIR = path.resolve(__dirname, '../../scripts/tickets');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message}\n`); }
}

function assertEq(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`); }
}

function assertCloseTo(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) <= tolerance) { passed++; process.stdout.write(`  ✓ ${message} (${actual})\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ~${expected}, got ${actual}\n`); }
}

function runScriptCaptureExit(scriptName, args) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `node ${scriptPath} ${args || ''}`;
  const opts = { encoding: 'utf8', cwd: process.cwd() };
  try {
    const stdout = execSync(cmd, opts);
    return { exitCode: 0, stdout: JSON.parse(stdout.trim()) };
  } catch (e) {
    let parsed = {};
    try { parsed = JSON.parse(e.stdout ? e.stdout.trim() : '{}'); } catch (_) {}
    return { exitCode: e.status || 1, stdout: parsed, stderr: e.stderr || '' };
  }
}

function createTicketsJson(phases) {
  const data = {
    title: 'test',
    metadata: { source: 'test', generatedAt: '2026-07-15' },
    phases: phases || [{ id: -1, name: '[X] Test', tickets: [] }],
    dependencyMap: '',
    checklist: [],
  };
  fs.writeFileSync('Tickets.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
}

console.log('\n━━━ tickets/check-field-density.test.js ━━━\n');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cfd-test-'));
const originalCwd = process.cwd();
process.chdir(TEST_DIR);

try {
  // ===============================================
  // Test 1: 全マーカー未記入 → exit 1, count > 0
  // ===============================================
  console.log('## 全マーカー未記入\n');
  {
    createTicketsJson([{ id: -1, name: '[X] Test', tickets: [{
      id: 1, phaseId: -1, status: 'todo', title: 'all-stubs',
      invariants: '[::TEMPLATE-STUB::invariants-normal::]',
      background: '[::TEMPLATE-STUB::background-purpose::]',
      scope: ['[::TEMPLATE-STUB::scope-changes-path::]'],
      testUnit: ['[::TEMPLATE-STUB::testunit-normal::]'],
      testIntegration: ['[::TEMPLATE-STUB::testintegration-point::]'],
      testExceptions: ['[::TEMPLATE-STUB::exception-item::]'],
      instrumentation: '[::TEMPLATE-STUB::instrumentation-log::]',
      notes: '[::TEMPLATE-STUB::notes-steps::]',
    }] }]);
    const { exitCode, stdout } = runScriptCaptureExit('check-field-density.js', 'Tickets.json PX-1');
    assertEq(exitCode, 1, 'exit 1 (stubs remain)');
    assert(stdout.ok === false, 'ok=false');
    assert(stdout.count > 0, 'count > 0');
    assert(stdout.stubs !== undefined, 'stubs array present');
    assert(stdout.stubs.length > 0, 'stubs array non-empty');
    assert(stdout.density !== undefined, 'density object present');
  }

  // ===============================================
  // Test 2: 全マーカー記入済み → exit 0, count = 0
  // ===============================================
  console.log('\n## 全マーカー記入済み\n');
  {
    createTicketsJson([{ id: -1, name: '[X] Test', tickets: [{
      id: 2, phaseId: -1, status: 'todo', title: 'all-filled',
      invariants: '- 正常成立条件: 入力検証通過\n- 異常永不変条件: エラー時ロールバック',
      background: '## 目的\nテスト\n## 動機\n確認\n## 制約\nなし\n## 関連RFC\nRFC-001',
      scope: ['変更A', '変更B', '変更C'],
      testUnit: ['UT: 正常系', 'UT: 異常系', 'UT: 境界値', 'UT: 不変条件'],
      testIntegration: ['IT: 結合点', 'IT: 検証内容', 'IT: 前提条件', 'IT: 関連チケット'],
      testExceptions: ['項目X', '理由: 非決定性', '代替: 手動確認'],
      instrumentation: '- ログ: info\n- メトリクス: counter',
      notes: '- 手順1\n- リスクなし\n- 注意: なし\n- 未確定: なし\n- 将来: 改善',
    }] }]);
    const { exitCode, stdout } = runScriptCaptureExit('check-field-density.js', 'Tickets.json PX-2');
    assertEq(exitCode, 0, 'exit 0 (all filled)');
    assert(stdout.ok === true, 'ok=true');
    assertEq(stdout.count, 0, 'count=0');
    assertEq(stdout.density.overallRatio, 1, 'overallRatio=1.0');
  }

  // ===============================================
  // Test 3: 一部マーカー未記入 → exit 1, 該当フィールド名のみ
  // ===============================================
  console.log('\n## 一部マーカー未記入\n');
  {
    createTicketsJson([{ id: -1, name: '[X] Test', tickets: [{
      id: 3, phaseId: -1, status: 'todo', title: 'partial-stubs',
      invariants: '- 正常成立条件: OK\n- 異常永不変条件: OK',
      background: '## 目的\n[::TEMPLATE-STUB::background-purpose::] 未記入',
      scope: ['changes OK', 'non-changes OK', '[::TEMPLATE-STUB::scope-impact-component::] remaining'],
      testUnit: ['UT: [正常系] OK', 'UT: [異常系] OK', 'UT: [境界値] OK', 'UT: [不変条件] OK'],
      testIntegration: ['IT: [結合点] OK', 'IT: [検証内容] OK', 'IT: [前提条件] OK', 'IT: [関連チケット] OK'],
      testExceptions: ['項目', '理由', '代替手段'],
      instrumentation: '- ログOK\n- メトリクスOK',
      notes: '- 手順OK\n- リスクOK\n- 注意OK\n- 未確定OK\n- 将来OK',
    }] }]);
    const { exitCode, stdout } = runScriptCaptureExit('check-field-density.js', 'Tickets.json PX-3');
    assertEq(exitCode, 1, 'exit 1 (partial stubs)');
    assert(stdout.ok === false, 'ok=false');
    assert(stdout.stubs !== undefined, 'stubs array present');
    const stubFields = stdout.stubs.map(s => s.field);
    assert(stubFields.includes('background'), 'background in stubs');
    assert(stubFields.includes('scope'), 'scope in stubs');
    assert(!stubFields.includes('testUnit'), 'testUnit not in stubs');
    assert(!stubFields.includes('testIntegration'), 'testIntegration not in stubs');
    assert(stdout.density.fields.background.ratio < 1, 'background ratio < 1');
  }

  // ===============================================
  // Test 4: 存在しないチケットキー → exit 1
  // ===============================================
  console.log('\n## 存在しないチケットキー\n');
  {
    createTicketsJson();
    const { exitCode } = runScriptCaptureExit('check-field-density.js', 'Tickets.json PX-999');
    assertEq(exitCode, 1, 'exit 1');
  }

  // ===============================================
  // Test 5: Tickets.json 不在 → exit 1
  // ===============================================
  console.log('\n## Tickets.json 不在\n');
  {
    const { exitCode } = runScriptCaptureExit('check-field-density.js', 'nonexistent.json PX-1');
    assertEq(exitCode, 1, 'exit 1');
  }

  // ===============================================
  // Test 6: 密度スコアリングの正確性
  // ===============================================
  console.log('\n## 密度スコアリング\n');
  {
    createTicketsJson([{ id: -1, name: '[X] Test', tickets: [{
      id: 4, phaseId: -1, status: 'todo', title: 'density-check',
      // invariants: 4 expected, 3 filled (1 stub) → ratio 0.75
      invariants: '- 正常成立条件: OK\n- 異常永不変条件: OK\n- 内部状態不変条件: OK\n- 【境界不変条件】[::TEMPLATE-STUB::invariants-boundary::]',
      // background: 4 expected, 2 filled (2 stubs) → ratio 0.5
      background: '### Goal\nOK\n### Purpose\n[::TEMPLATE-STUB::background-purpose::]\n### Motivation\n[::TEMPLATE-STUB::background-motivation::]\n### Constraints\nOK',
      // scope: 13 expected, 12 filled (1 stub) → 12/13
      scope: ['changes OK', '[::TEMPLATE-STUB::scope-non-changes-item::] excluded', 'impact OK'],
      // testUnit: 4 expected, 4 filled → 1.0
      testUnit: ['UT: 正常系', 'UT: 異常系', 'UT: 境界値', 'UT: 不変条件'],
      // testIntegration: 4 expected, 4 filled → 1.0
      testIntegration: ['IT: 結合点', 'IT: 検証内容', 'IT: 前提条件', 'IT: 関連チケット'],
      // testExceptions: 3 expected, 3 filled → 1.0
      testExceptions: ['項目', '理由', '代替手段'],
      // instrumentation: 4 expected, 3 filled (1 stub) → ratio 0.75
      instrumentation: '- 【ログ出力】OK\n- 【メトリクス】OK\n- 【エラー追跡】[::TEMPLATE-STUB::instrumentation-errors::]\n- 【正常動作確認】OK',
      // notes: 5 expected, 4 filled (1 stub) → ratio 0.8
      notes: '- 【実装手順】OK\n- 【リスク一覧】OK\n- 【注意点】[::TEMPLATE-STUB::notes-caveats::]\n- 【未確定事項】OK\n- 【将来の改善余地】OK',
    }] }]);
    const { exitCode, stdout } = runScriptCaptureExit('check-field-density.js', 'Tickets.json PX-4');
    assertEq(exitCode, 1, 'exit 1 (has stubs)');
    const f = stdout.density.fields;
    assertEq(f.invariants.ratio, 0.75, 'invariants ratio 0.75 (3/4)');
    assertEq(f.background.ratio, 0.5, 'background ratio 0.5 (2/4)');
    assertCloseTo(f.scope.ratio, 12/13, 0.01, 'scope ratio 12/13');
    assertEq(f.testUnit.ratio, 1, 'testUnit ratio 1.0');
    assertEq(f.testIntegration.ratio, 1, 'testIntegration ratio 1.0');
    assertEq(f.testExceptions.ratio, 1, 'testExceptions ratio 1.0');
    assertEq(f.instrumentation.ratio, 0.75, 'instrumentation ratio 0.75 (3/4)');
    assertEq(f.notes.ratio, 0.8, 'notes ratio 0.8 (4/5)');
    assert(stdout.density.total.expected === 41, 'total expected = 41');
  }

} finally {
  process.chdir(originalCwd);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
