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

function assertJsonContains(obj, key, expected, message) {
  const actual = obj[key];
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`); }
}

function runScript(scriptName, args, stdin) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `node ${scriptPath} ${args || ''}`;
  const opts = { encoding: 'utf8', cwd: process.cwd() };
  if (stdin) opts.input = stdin;
  try {
    const result = execSync(cmd, opts);
    return JSON.parse(result.trim());
  } catch (e) {
    // 子プロセスの stdout と stderr 両方を試す
    const output = (e.stdout || '').trim() || (e.stderr || '').trim();
    try { return JSON.parse(output); } catch (_) {
      return { success: false, error: e.message };
    }
  }
}

function createMinimalTicketsJson(overrides) {
  const defaultTickets = {
    title: 'test',
    metadata: { source: 'test', generatedAt: '2026-07-15' },
    phases: [{ id: -1, name: '[X] Test', tickets: [] }],
    dependencyMap: '',
    checklist: [],
  };
  const data = { ...defaultTickets };
  if (overrides) {
    if (overrides.phases) data.phases = overrides.phases;
    if (overrides.tickets) data.phases[0].tickets = overrides.tickets;
  }
  fs.writeFileSync('Tickets.json', JSON.stringify(data, null, 2) + '\n', 'utf8');
}

console.log('\n━━━ tickets/insert-field-template.test.js ━━━\n');

const TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ift-test-'));
const originalCwd = process.cwd();
process.chdir(TEST_DIR);

try {
  // ===============================================
  // Test 1: 空のチケット → 8フィールドすべてにテンプレート挿入
  // ===============================================
  console.log('## 空のチケット\n');
  {
    createMinimalTicketsJson({
      tickets: [{ id: 1, phaseId: -1, status: 'todo', title: 'test-empty' }],
    });
    const result = runScript('insert-field-template.js', 'Tickets.json PX-1');
    assert(result.ok === true, 'ok=true');
    assertEq(result.ticketKey, 'PX-1', 'ticketKey is PX-1');
    assert(result.updated.includes('invariants'), 'invariants updated');
    assert(result.updated.includes('background'), 'background updated');
    assert(result.updated.includes('scope'), 'scope updated');
    assert(result.updated.includes('testUnit'), 'testUnit updated');
    assert(result.updated.includes('testIntegration'), 'testIntegration updated');
    assert(result.updated.includes('testExceptions'), 'testExceptions updated');
    assert(result.updated.includes('instrumentation'), 'instrumentation updated');
    assert(result.updated.includes('notes'), 'notes updated');
    assert(result.updated.includes('acceptanceCriteria'), 'acceptanceCriteria updated');
    assert(result.updated.includes('investigation'), 'investigation updated');
    assert(result.updated.includes('boyScoutPlan'), 'boyScoutPlan updated');
    assert(result.updated.includes('created_at'), 'created_at set');
    assert(result.updated.includes('updated_at'), 'updated_at set');
    assertEq(result.count, 13, 'all 11 + 2 date fields updated');

    // 実際に保存された値を確認
    const data = JSON.parse(fs.readFileSync('Tickets.json', 'utf8'));
    const ticket = data.phases[0].tickets[0];
    assert(typeof ticket.invariants === 'string' && ticket.invariants.includes('[::TEMPLATE-STUB::'), 'invariants has stubs');
    assert(ticket.scope.length === 3, 'scope has 3 items');
    assert(ticket.scope[0].includes('[::TEMPLATE-STUB::'), 'scope[0] has stub');
    assert(ticket.testUnit.length === 4, 'testUnit has 4 items');
    assert(ticket.testIntegration.length === 4, 'testIntegration has 4 items');
    assert(ticket.testExceptions.length === 1, 'testExceptions has 1 entry with Item+Reason+Alternative');
    assert(typeof ticket.instrumentation === 'string' && ticket.instrumentation.includes('[::TEMPLATE-STUB::'), 'instrumentation has stubs');
    assert(typeof ticket.notes === 'string' && ticket.notes.includes('[::TEMPLATE-STUB::'), 'notes has stubs');
    assert(ticket.acceptanceCriteria.length === 3, 'acceptanceCriteria has 3 items');
    assert(ticket.acceptanceCriteria[0].includes('[::TEMPLATE-STUB::'), 'acceptanceCriteria[0] has stub');
    assert(typeof ticket.investigation === 'string' && ticket.investigation.includes('[::TEMPLATE-STUB::'), 'investigation has stub');
    assert(typeof ticket.boyScoutPlan === 'string' && ticket.boyScoutPlan.includes('[::TEMPLATE-STUB::'), 'boyScoutPlan has stub');
  }

  // ===============================================
  // Test 2: 二重挿入防止
  // ===============================================
  console.log('\n## 二重挿入防止\n');
  {
    const result = runScript('insert-field-template.js', 'Tickets.json PX-1');
    assert(result.ok === true, 'ok=true');
    assertEq(result.updated.length, 0, 'no fields updated (all skipped)');
    assertEq(result.updated.length, 0, 'updated is empty');
  }

  // ===============================================
  // Test 3: 存在しないチケットキー
  // ===============================================
  console.log('\n## 存在しないチケットキー\n');
  {
    const result = runScript('insert-field-template.js', 'Tickets.json PX-999');
    assert(result.ok === false, 'ok=false');
  }

  // ===============================================
  // Test 4: 一部既存値あり（スタブなし）→ マージ（空行＋全テンプレート）
  // ===============================================
  console.log('\n## 一部既存値あり → マージ\n');
  {
    createMinimalTicketsJson({
      tickets: [{
        id: 2, phaseId: -1, status: 'todo', title: 'test-partial',
        invariants: '既存の不変条件',
        scope: ['既存のスコープ'],
      }],
    });
    const result = runScript('insert-field-template.js', 'Tickets.json PX-2');
    assert(result.ok === true, 'ok=true');
    assert(result.updated.includes('invariants'), 'invariants updated (merged with template)');
    assert(result.updated.includes('scope'), 'scope updated (merged with template)');
    assert(result.updated.includes('background'), 'background updated (was empty)');
    assert(result.updated.includes('testUnit'), 'testUnit updated (was empty)');

    const data = JSON.parse(fs.readFileSync('Tickets.json', 'utf8'));
    const ticket = data.phases[0].tickets.find(t => t.id === 2);
    // invariants: 既存コンテンツ + 空行 + 全テンプレート
    assert(ticket.invariants.startsWith('既存の不変条件'), 'existing invariants content preserved');
    assert(ticket.invariants.includes('\n\n'), 'blank line separator between existing and template');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-normal::]'), 'invariants template stubs added');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-error::]'), 'all invariants stubs added');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-state::]'), 'all invariants stubs added');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-boundary::]'), 'all invariants stubs added');
    // scope: 既存要素 + 全テンプレート要素
    assertEq(ticket.scope[0], '既存のスコープ', 'existing scope content preserved');
    assertEq(ticket.scope.length, 4, 'scope has 1 existing + 3 template items');
    assert(ticket.scope[1].includes('[::TEMPLATE-STUB::scope-changes-path::]'), 'scope-changes-path template added');
    assert(ticket.scope[2].includes('[::TEMPLATE-STUB::scope-non-changes-item::]'), 'scope-non-changes-item template added');
    assert(ticket.scope[3].includes('[::TEMPLATE-STUB::scope-impact-component::]'), 'scope-impact-component template added');
  }

  // ===============================================
  // Test 5: 空文字列・空配列のフィールドはテンプレート挿入対象
  // ===============================================
  console.log('\n## 空文字列・空配列\n');
  {
    createMinimalTicketsJson({
      tickets: [{
        id: 3, phaseId: -1, status: 'todo', title: 'test-empty-str',
        invariants: '', background: '', scope: [], testUnit: [],
      }],
    });
    const result = runScript('insert-field-template.js', 'Tickets.json PX-3');
    assert(result.ok === true, 'ok=true');
    assert(result.updated.includes('invariants'), 'empty string invariants gets template');
    assert(result.updated.includes('scope'), 'empty array scope gets template');
  }

  // ===============================================
  // Test 6: ファイル不在
  // ===============================================
  console.log('\n## Tickets.json 不在\n');
  {
    const result = runScript('insert-field-template.js', 'nonexistent.json PX-1');
    assert(result.ok === false, 'ok=false');
  }

  // ===============================================
  // Test 7: 一部スタブあり → 不足スタブのみ追記
  // ===============================================
  console.log('\n## 一部スタブあり → 不足追記\n');
  {
    createMinimalTicketsJson({
      tickets: [{
        id: 4, phaseId: -1, status: 'todo', title: 'test-partial-stubs',
        // 4スタブ中2スタブのみ存在
        invariants: '- 【正常成立条件】[::TEMPLATE-STUB::invariants-normal::] 既存\n- 【異常時不変条件】[::TEMPLATE-STUB::invariants-error::] 既存',
        // 3要素中1要素のみ存在
        scope: ['- [::TEMPLATE-STUB::scope-changes-path::] partially filled'],
      }],
    });
    const result = runScript('insert-field-template.js', 'Tickets.json PX-4');
    assert(result.ok === true, 'ok=true');
    assert(result.updated.includes('invariants'), 'invariants updated (partial stubs merged)');
    assert(result.updated.includes('scope'), 'scope updated (partial stubs merged)');

    const data = JSON.parse(fs.readFileSync('Tickets.json', 'utf8'));
    const ticket = data.phases[0].tickets.find(t => t.id === 4);
    // invariants: 既存2スタブ + 不足2スタブ行のみ追記
    assert(ticket.invariants.includes('invariants-normal'), 'existing normal stub preserved');
    assert(ticket.invariants.includes('invariants-error'), 'existing error stub preserved');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-state::]'), 'missing state stub added');
    assert(ticket.invariants.includes('[::TEMPLATE-STUB::invariants-boundary::]'), 'missing boundary stub added');
    // scope: 既存1要素（scope-changes-path スタブあり） + 不足2要素のみ
    assertEq(ticket.scope.length, 3, 'scope has 1 existing + 2 missing template items');
    assert(ticket.scope[0].includes('scope-changes-path'), 'existing scope-changes-path preserved');
    assert(ticket.scope[1].includes('[::TEMPLATE-STUB::scope-non-changes-item::]'), 'missing scope-non-changes-item added');
    assert(ticket.scope[2].includes('[::TEMPLATE-STUB::scope-impact-component::]'), 'missing scope-impact-component added');
  }

  // ===============================================
  // Test 8: 全スタブ揃っている → スキップ（真の二重挿入防止）
  // ===============================================
  console.log('\n## 全スタブ揃っている → スキップ\n');
  {
    const result = runScript('insert-field-template.js', 'Tickets.json PX-4');
    assert(result.ok === true, 'ok=true');
    assertEq(result.updated.length, 0, 'no fields updated (all stubs already present)');
  }

} finally {
  process.chdir(originalCwd);
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━\n`);
process.exit(failed > 0 ? 1 : 0);
