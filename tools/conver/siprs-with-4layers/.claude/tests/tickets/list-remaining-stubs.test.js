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

/**
 * list-remaining-stubs.js を実行し { stdout, exitCode } を返す
 * （出力が自然言語のため JSON パースしない）
 */
function runScriptCapture(scriptName, args) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `node ${scriptPath} ${args || ''}`;
  const opts = { encoding: 'utf8', cwd: process.cwd() };
  try {
    const stdout = execSync(cmd, opts).trim();
    return { stdout, exitCode: 0 };
  } catch (e) {
    return {
      stdout: (e.stdout || '').trim() || (e.stderr || '').trim(),
      exitCode: e.status || 1,
    };
  }
}

function createTicketsJson(tickets) {
  const data = {
    title: 'test',
    metadata: { source: 'test', generatedAt: '2026-07-15' },
    phases: [{ id: -1, name: '[X] Test', tickets: tickets || [] }],
    dependencyMap: '',
    checklist: [],
  };
  fs.writeFileSync('Tickets.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
}

console.log('\n━━━ tickets/list-remaining-stubs.test.js ━━━\n');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lrs-test-'));
const originalCwd = process.cwd();
process.chdir(TEST_DIR);

try {
  // ===============================================
  // Test 1: 全マーカー置換済み → exit 0
  // ===============================================
  console.log('## 全マーカー置換済み\n');
  {
    createTicketsJson([{
      id: 1, phaseId: -1, status: 'todo', title: 'all-filled',
      invariants: '- [Normal] OK\n- [Error] OK\n- [State] OK\n- [Boundary] OK',
      background: '### Goal\nok\n### Purpose\nok\n### Motivation\nok\n### Constraints\nok',
      scope: ['change A', 'change B', 'change C'],
      testUnit: ['UT: normal', 'UT: error', 'UT: boundary', 'UT: invariant'],
      testIntegration: ['IT: point', 'IT: verify', 'IT: prereq', 'IT: tickets'],
      testExceptions: ['item', 'reason', 'alternative'],
      instrumentation: '- Logging: ok\n- Metrics: ok\n- Tracking: ok\n- Health: ok',
      notes: '- steps\n- risks\n- caveats\n- open\n- future',
      acceptanceCriteria: ['happy', 'error', 'edge'],
      investigation: '調査完了',
      boyScoutPlan: '計画完了',
    }]);
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', 'Tickets.json PX-1');
    assertEq(exitCode, 0, 'exit 0 (no stubs)');
    assert(stdout.includes('✅'), 'stdout shows success icon');
    assert(stdout.includes('No remaining markers'), 'stdout shows clean message');
  }

  // ===============================================
  // Test 2: 一部マーカー未置換 → exit 1 + 自然言語一覧
  // ===============================================
  console.log('\n## 一部マーカー未置換\n');
  {
    createTicketsJson([{
      id: 2, phaseId: -1, status: 'todo', title: 'partial-stubs',
      invariants: '- [Normal] [::TEMPLATE-STUB::invariants-normal::]\n- [Error] [::TEMPLATE-STUB::invariants-error::]',
      background: '',
      scope: ['[::TEMPLATE-STUB::scope-changes-path::] remaining'],
      testUnit: [],
      testIntegration: [],
      testExceptions: [],
      instrumentation: '',
      notes: '',
      acceptanceCriteria: [],
      investigation: '',
      boyScoutPlan: '',
    }]);
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', 'Tickets.json PX-2');
    assertEq(exitCode, 1, 'exit 1 (stubs remain)');
    assert(stdout.includes('⚠️'), 'stdout shows warning icon');
    assert(stdout.includes('invariants'), 'invariants listed in output');
    assert(stdout.includes('scope'), 'scope listed in output');
    assert(stdout.includes('[::TEMPLATE-STUB::invariants-normal::]'), 'specific stub marker shown');
    assert(stdout.includes('[::TEMPLATE-STUB::scope-changes-path::]'), 'scope stub marker shown');
    // 背景は空文字列なのでスタブなし ⇒ 出力に含まれない
    assert(!stdout.includes('background'), 'empty field with no stubs not listed');
  }

  // ===============================================
  // Test 3: 全マーカー未置換（string + array 混在） → exit 1
  // ===============================================
  console.log('\n## 全マーカー未置換\n');
  {
    createTicketsJson([{
      id: 3, phaseId: -1, status: 'todo', title: 'all-stubs',
      invariants: '[::TEMPLATE-STUB::invariants-normal::]',
      background: '[::TEMPLATE-STUB::background-purpose::]',
      scope: ['[::TEMPLATE-STUB::scope-changes-path::]'],
      testUnit: ['[::TEMPLATE-STUB::testunit-normal::]'],
      testIntegration: ['[::TEMPLATE-STUB::testintegration-point::]'],
      testExceptions: ['[::TEMPLATE-STUB::exception-item::]'],
      instrumentation: '[::TEMPLATE-STUB::instrumentation-log::]',
      notes: '[::TEMPLATE-STUB::notes-steps::]',
      acceptanceCriteria: ['[::TEMPLATE-STUB::acceptance-happy::]'],
      investigation: '[::TEMPLATE-STUB::investigation::]',
      boyScoutPlan: '[::TEMPLATE-STUB::boyscout-plan::]',
    }]);
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', 'Tickets.json PX-3');
    assertEq(exitCode, 1, 'exit 1 (all stubs remain)');
    // 11フィールド全てにスタブがある
    assert(stdout.includes('11 TEMPLATE-STUB marker(s)'), 'count shows 11 total stubs');
    assert(stdout.includes('invariants'), 'invariants field listed');
    assert(stdout.includes('background'), 'background field listed');
    assert(stdout.includes('scope'), 'scope field listed');
    assert(stdout.includes('testUnit'), 'testUnit field listed');
    assert(stdout.includes('testIntegration'), 'testIntegration field listed');
    assert(stdout.includes('testExceptions'), 'testExceptions field listed');
    assert(stdout.includes('instrumentation'), 'instrumentation field listed');
    assert(stdout.includes('notes'), 'notes field listed');
    assert(stdout.includes('acceptanceCriteria'), 'acceptanceCriteria field listed');
    assert(stdout.includes('investigation'), 'investigation field listed');
    assert(stdout.includes('boyScoutPlan'), 'boyScoutPlan field listed');
  }

  // ===============================================
  // Test 4: 存在しないチケットキー → exit 1
  // ===============================================
  console.log('\n## 存在しないチケットキー\n');
  {
    createTicketsJson([]);
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', 'Tickets.json PX-999');
    assertEq(exitCode, 1, 'exit 1');
    assert(stdout.includes('Failed') || stdout.includes('not found'), 'error message shown');
  }

  // ===============================================
  // Test 5: Tickets.json 不在 → exit 1
  // ===============================================
  console.log('\n## Tickets.json 不在\n');
  {
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', 'nonexistent.json PX-1');
    assertEq(exitCode, 1, 'exit 1');
    assert(stdout.includes('Failed') || stdout.includes('not found'), 'error message shown');
  }

  // ===============================================
  // Test 6: 引数なし → exit 1
  // ===============================================
  console.log('\n## 引数なし\n');
  {
    const { stdout, exitCode } = runScriptCapture('list-remaining-stubs.js', '');
    assertEq(exitCode, 1, 'exit 1');
    assert(stdout.includes('Usage'), 'usage message shown');
  }

} finally {
  process.chdir(originalCwd);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
