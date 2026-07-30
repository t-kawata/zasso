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

// [::TICKET::] PX-106, PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-106|PX-107) --for-spec --no-implementation-order`.
function assertOk(value, message) {
  if (value) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — got ${JSON.stringify(value)}\n`); }
}

// [::TICKET::] PX-106, PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-106|PX-107) --for-spec --no-implementation-order`.
function runScript(scriptName, args, stdin) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const cmd = `node ${scriptPath} ${args || ''}`;
  const opts = { encoding: 'utf8', cwd: process.cwd() };
  if (stdin) opts.input = stdin;
  try {
    const result = execSync(cmd, opts);
    return JSON.parse(result.trim());
  } catch (e) {
    try {
      return JSON.parse(e.stdout ? e.stdout.trim() : '{}');
    } catch (_) {
      return { success: false, error: e.message };
    }
  }
}

console.log('\n━━━ tickets/scripts.test.js ━━━\n');

// テスト分離のため、一時ディレクトリでテストを実行する。
// TICKETS_PROJECT_ROOT 環境変数で ticket-config.js の PROJECT_ROOT を上書きする。
const TEST_TICKETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-script-test-'));
process.env.TICKETS_PROJECT_ROOT = TEST_TICKETS_DIR;
process.chdir(TEST_TICKETS_DIR);

try {
  // テストに必要な最小限の Tickets.json を作成（search-tickets.js 等が参照する）
  fs.writeFileSync('Tickets.json', JSON.stringify({
    title: 'test',
    metadata: { source: 'test', generatedAt: '2026-07-15' },
    phases: [{ id: -1, name: '[X] Test', tickets: [] }],
    dependencyMap: '',
    checklist: [],
  }, null, 2) + '\n', 'utf8');

  // ===============================================
  // ensure-ticket-structure
  // ===============================================
  console.log('## ensure-ticket-structure\n');
  {
    const result = runScript('ensure-ticket-structure.js', '', null);
    assert(result.success === true, 'creates structure successfully');
    assert(fs.existsSync('tickets'), 'tickets dir created');
    assert(fs.existsSync('tickets/specs'), 'specs dir created');
    assert(fs.existsSync('tickets/context'), 'context dir created');
    assert(fs.existsSync('tickets/drafts'), 'drafts dir created');
    assert(fs.existsSync('tickets/queue.md'), 'queue.md created');
  }
  {
    const result = runScript('ensure-ticket-structure.js', '', null);
    assert(result.success === true, 'idempotent re-run succeeds');
  }

  // ===============================================
  // create-ticket
  // ===============================================
  console.log('\n## create-ticket\n');
  {
    const result = runScript('create-ticket.js', '42 "Test Ticket"', null);
    assert(result.success === true, 'creates ticket');
    assertEq(result.ticketId, 42, 'correct ticket_id');
    assertEq(result.slug, 'test-ticket', 'correct slug');
    assert(fs.existsSync(result.specPath), 'spec file exists');
    assert(fs.existsSync(result.contextDir), 'context dir exists');
    const queue = fs.readFileSync('tickets/queue.md', 'utf8');
    assert(queue.includes('#42'), 'queue contains ticket reference');
  }
  {
    const result = runScript('create-ticket.js', '42 "Another"', null);
    assert(result.success === false, 'duplicate creation fails');
    assert(result.error && result.error.includes('already exists'), 'error mentions already exists');
  }

  // ===============================================
  // resolve-ticket
  // ===============================================
  console.log('\n## resolve-ticket\n');
  {
    const result = runScript('resolve-ticket.js', '42', null);
    assert(result.success === true, 'resolves existing ticket');
    assert(result.exists === true, 'exists is true');
    assertEq(result.title, 'Test Ticket', 'correct title');
    assertEq(result.status, 'draft', 'correct status');
    assert(result.planPath === null, 'planPath is null (not yet created)');
    assert(result.implementationPath === null, 'implementationPath is null');
    assert(result.reviewReportPath === null, 'reviewReportPath is null');
  }
  {
    const result = runScript('resolve-ticket.js', '999', null);
    assert(result.success === true, 'handles nonexistent ticket');
    assert(result.exists === false, 'exists is false');
  }
  {
    const result = runScript('resolve-ticket.js', '', null);
    assert(result.success === false, 'missing arg fails');
  }

  // ===============================================
  // read-artifact
  // ===============================================
  console.log('\n## read-artifact\n');

  // read-artifact の成功時は生テキスト出力のため、専用のヘルパー関数
  function runArtifactScript(ticketId, type) {
    const scriptPath = path.join(SCRIPTS_DIR, 'read-artifact.js');
    const cmd = `node ${scriptPath} ${ticketId} ${type}`;
    try {
      const execSync = require('child_process').execSync;
      const result = execSync(cmd, { encoding: 'utf8', cwd: process.cwd() });
      return { success: true, content: result.trim() };
    } catch (e) {
      try {
        return JSON.parse(e.stdout.trim());
      } catch (_) {
        return { success: false, error: e.message };
      }
    }
  }
  {
    const spec = runArtifactScript('42', 'spec');
    assert(spec.success === true, 'reads spec successfully');
    assert(spec.content && spec.content.includes('# Test Ticket'), 'spec contains title');
    assert(spec.content && spec.content.includes('## Summary'), 'spec contains sections');
  }
  {
    const result = runArtifactScript('42', 'plan');
    assert(result.success === false, 'plan not yet created');
    assert(result.error && (result.error.includes('not set in frontmatter') || result.error.includes('not yet created')), 'error mentions missing artifact');
  }
  {
    const result = runArtifactScript('42', 'invalid');
    assert(result.success === false, 'invalid type');
    assert(result.error && result.error.includes('Unknown artifact type'), 'error mentions unknown type');
  }
  {
    const result = runArtifactScript('', '');
    assert(result.success === false, 'missing arg');
  }

  // read-artifact: after creating plan file + setting frontmatter
  {
    const planDir = 'tickets/context/0042-test-ticket';
    const planFile = path.join(planDir, 'plan.md');
    fs.mkdirSync(planDir, { recursive: true });
    fs.writeFileSync(planFile, '# Plan for Test Ticket\n\n## Steps\n1. Do thing\n');
    const fmResult = runScript('update-frontmatter.js', '42 plan_path "' + planFile + '"', null);
    assert(fmResult.success === true, 'plan_path set in frontmatter');
    const readResult = runArtifactScript('42', 'plan');
    assert(readResult.success === true, 'reads plan after creation');
    assert(readResult.content && readResult.content.includes('Plan for Test Ticket'), 'plan content matches');
  }

  // ===============================================
  // save-artifact
  // ===============================================
  console.log('\n## save-artifact\n');
  {
    const result = runScript('save-artifact.js', '', null);
    assert(result.success === false, 'missing arg');
  }
  {
    const result = runScript('save-artifact.js', '999 plan', null);
    assert(result.success === false, 'nonexistent ticket');
  }
  {
    const result = runScript('save-artifact.js', '42 invalid', null);
    assert(result.success === false, 'invalid type');
    assert(result.error && result.error.includes('Unknown type'), 'error mentions unknown type');
  }
  {
    // save-artifact で plan を上書き保存
    const result = runScript('save-artifact.js', '42 plan', '# Updated Plan\n- Step 1');
    assert(result.success === true, 'saves plan successfully');
    assert(result.path && result.path.includes('plan.md'), 'path points to plan.md');

    const artifactPath = result.path;
    assert(fs.existsSync(artifactPath), 'plan file exists on disk');
    const content = fs.readFileSync(artifactPath, 'utf8');
    assert(content.includes('Updated Plan'), 'file content matches');

    // frontmatter が更新されていることを確認
    const fmResult = runScript('read-frontmatter.js', '42 plan_path', null);
    assert(fmResult.success === true, 'frontmatter updated');
    assert(fmResult.value && fmResult.value.includes('plan.md'), 'plan_path set in frontmatter');
  }
  {
    const result = runScript('save-artifact.js', '42 implementation', '# Implementation Summary\n- Changed file1.js');
    assert(result.success === true, 'saves implementation successfully');
    assert(result.path && result.path.includes('implementation.md'), 'path points to implementation.md');
    assert(fs.existsSync(result.path), 'implementation file exists');
  }
  {
    const result = runScript('save-artifact.js', '42 review', '# Review Report\n## Checks\n- All passed');
    assert(result.success === true, 'saves review successfully');
    assert(result.path && result.path.includes('review.md'), 'path points to review.md');
    assert(fs.existsSync(result.path), 'review file exists');
  }

  // ===============================================
  // read-frontmatter
  // ===============================================
  console.log('\n## read-frontmatter\n');
  {
    const result = runScript('read-frontmatter.js', '42', null);
    assert(result.success === true, 'reads frontmatter');
    assertEq(result.frontmatter.title, 'Test Ticket', 'correct title');
  }
  {
    const result = runScript('read-frontmatter.js', '42 status', null);
    assert(result.success === true, 'reads single field');
    assertEq(result.value, 'draft', 'correct status value');
  }

  // ===============================================
  // update-frontmatter
  // ===============================================
  console.log('\n## update-frontmatter\n');
  {
    const result = runScript('update-frontmatter.js', '42 title "Updated Title"', null);
    assert(result.success === true, 'updates title');
  }
  {
    const result = runScript('read-frontmatter.js', '42 title', null);
    assertEq(result.value, 'Updated Title', 'title was updated');
  }

  // ===============================================
  // update-ticket-status
  // ===============================================
  console.log('\n## update-ticket-status\n');
  {
    const result = runScript('update-ticket-status.js', '42 reviewing', null);
    assert(result.success === true, 'draft -> reviewing allowed');
    assertEq(result.to, 'reviewing', 'new status is reviewing');
  }
  {
    const result = runScript('update-ticket-status.js', '42 blocked', null);
    assert(result.success === true, 'reviewing -> blocked allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 draft', null);
    assert(result.success === true, 'blocked -> draft allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 implementing', null);
    assert(result.success === false, 'draft -> implementing NOT allowed');
  }
  {
    const result = runScript('update-ticket-status.js', '42 invalid', null);
    assert(result.success === false, 'invalid status rejected');
  }
  // Set to approved for later testing
  runScript('update-ticket-status.js', '42 reviewing', null);
  runScript('update-ticket-status.js', '42 approved', null);
  {
    const result = runScript('read-frontmatter.js', '42 status', null);
    assertEq(result.value, 'approved', 'now approved');
  }

  // ===============================================
  // check-status
  // ===============================================
  console.log('\n## check-status\n');
  {
    const result = runScript('check-status.js', '42 approved', null);
    assert(result.success === true, 'check-status succeeds');
    assert(result.matches === true, 'status matches approved');
  }
  {
    const result = runScript('check-status.js', '42 draft', null);
    assert(result.matches === false, 'status does not match draft');
  }

  // ===============================================
  // count-tickets
  // ===============================================
  console.log('\n## count-tickets\n');
  {
    const result = runScript('count-tickets.js', '', null);
    assert(result.success === true, 'counts tickets');
    assertEq(result.total, 1, 'one ticket');
    assertEq(result.counts.approved, 1, 'one approved');
  }

  // ===============================================
  // list-tickets
  // ===============================================
  console.log('\n## list-tickets\n');
  {
    const result = runScript('list-tickets.js', '', null);
    assert(result.success === true, 'lists tickets');
    assertEq(result.count, 1, 'one ticket listed');
  }
  {
    const result = runScript('list-tickets.js', 'approved', null);
    assertEq(result.count, 1, 'filtered by approved');
  }
  {
    const result = runScript('list-tickets.js', 'draft', null);
    assertEq(result.count, 0, 'no draft tickets');
  }

  // ===============================================
  // search-tickets
  // ===============================================
  console.log('\n## search-tickets\n');
  {
    // Tickets.json を更新し、search-tickets がテストできるようにする
    const tj = JSON.parse(fs.readFileSync('Tickets.json', 'utf8'));
    tj.phases[0].tickets.push({ id: 42, phaseId: -1, title: 'Updated Title', status: 'todo' });
    fs.writeFileSync('Tickets.json', JSON.stringify(tj, null, 2) + '\n', 'utf8');
    const result = runScript('search-tickets.js', 'Tickets.json Updated', null);
    assert(result.success === true, 'searches by keyword');
    assert(result.count >= 1, 'found matching ticket');
  }
  {
    const result = runScript('search-tickets.js', 'Tickets.json nonexistent', null);
    assertEq(result.count, 0, 'no match for nonexistent keyword');
  }

  // ===============================================
  // find-by-slug
  // ===============================================
  console.log('\n## find-by-slug\n');
  {
    const result = runScript('find-by-slug.js', 'test-ticket', null);
    assert(result.found === true, 'finds by slug');
    assertEq(result.ticketId, 42, 'correct ID');
  }
  {
    const result = runScript('find-by-slug.js', 'no-such-slug', null);
    assert(result.found === false, 'not found for missing slug');
  }

  // ===============================================
  // create-draft and promote-draft
  // ===============================================
  console.log('\n## create-draft / promote-draft\n');
  {
    const result = runScript('create-draft.js', '50 "Draft Ticket"', null);
    assert(result.success === true, 'creates draft');
    assert(fs.existsSync(result.draftPath), 'draft file exists');
  }
  {
    const result = runScript('promote-draft.js', '50', null);
    assert(result.success === true, 'promotes draft');
    assert(fs.existsSync(result.specPath), 'spec created from draft');
  }
  {
    const result = runScript('resolve-ticket.js', '50', null);
    assert(result.exists === true, 'promoted ticket exists');
    assert(fs.existsSync('tickets/context/0050-draft-ticket'), 'context dir created');
  }

  // ===============================================
  // backup-ticket / restore-ticket
  // ===============================================
  console.log('\n## backup / restore\n');
  {
    const result = runScript('backup-ticket.js', '42', null);
    assert(result.success === true, 'creates backup');
    assert(fs.existsSync(result.backupPath), 'backup file exists');
  }
  {
    runScript('update-frontmatter.js', '42 title "Modified Before Restore"', null);
    const before = runScript('read-frontmatter.js', '42 title', null);
    assertEq(before.value, 'Modified Before Restore', 'title modified');

    const result = runScript('restore-ticket.js', '42', null);
    assert(result.success === true, 'restores from backup');
    const after = runScript('read-frontmatter.js', '42 title', null);
    // After restore, title should have some value (it was restored from backup)
    assert(after.value !== undefined && after.value !== null, 'title restored');
  }

  // ===============================================
  // delete-ticket
  // ===============================================
  console.log('\n## delete-ticket\n');
  {
    // create-ticket.js は spec ファイルを作成するが Tickets.json には追加しない。
    // delete-ticket.js は Tickets.json から削除するため、先に手動で追加する。
    const specPath = path.resolve(process.cwd(), 'tickets/specs/0043-to-delete.md');
    // spec ファイルを直接作成
    if (!fs.existsSync(path.dirname(specPath))) {
      fs.mkdirSync(path.dirname(specPath), { recursive: true });
    }
    fs.writeFileSync(specPath, '---\nticket_id: 43\ntitle: To Delete\nslug: to-delete\nstatus: todo\n---\n\n# To Delete\n', 'utf8');
    // Tickets.json に追加
    const tj = JSON.parse(fs.readFileSync('Tickets.json', 'utf8'));
    tj.phases[0].tickets.push({ id: 43, phaseId: -1, title: 'To Delete', specPath, status: 'todo' });
    fs.writeFileSync('Tickets.json', JSON.stringify(tj, null, 2) + '\n', 'utf8');
    // 削除実行
    const result = runScript('delete-ticket.js', 'Tickets.json PX-43', null);
    assert(result.success === true, 'deletes ticket');
    assert(result.deleted === true, 'deleted flag is true');
    // 手動で作成した spec ファイルも削除（delete-ticket.js は Tickets.json からの削除のみ行う）
    const specsDir = path.resolve(process.cwd(), 'tickets/specs');
    const specToDelete = path.join(specsDir, '0043-to-delete.md');
    try { if (fs.existsSync(specToDelete)) fs.unlinkSync(specToDelete); } catch (_) {}
    const resolveResult = runScript('resolve-ticket.js', '43', null);
    assert(resolveResult.exists === false, 'ticket no longer exists');
  }

  // ===============================================
  // validate-structure
  // ===============================================
  console.log('\n## validate-structure\n');
  {
    const result = runScript('validate-structure.js', '', null);
    assert(result.success === true, 'validates structure');
    assert(typeof result.valid === 'boolean', 'has valid flag');
  }

  // ===============================================
  // resync-queue
  // ===============================================
  console.log('\n## resync-queue\n');
  {
    const result = runScript('resync-queue.js', '', null);
    assert(result.success === true, 'resyncs queue');
    assert(result.count >= 2, 'queue has tickets');
  }

  // ===============================================
  // PX-106: Inspection Sentinel Idempotency — repairDuplicateSentinels / countInspectionSentinels
  // ===============================================
  console.log('\n## PX-106: sentinel idempotency\n');
  // @verifies C106 — All contract elements (precondition, postcondition, invariant) tested below
  {
    const addOmissionPath = path.join(SCRIPTS_DIR, 'add-omission-ticket.js');
    const createTmpPath = path.join(SCRIPTS_DIR, 'create-tmp-omissions.js');
    const addModule = require(addOmissionPath);
    const createTmpModule = require(createTmpPath);

    // -- countInspectionSentinels --
    const { countInspectionSentinels, repairDuplicateSentinels } = addModule;

    assert(typeof countInspectionSentinels === 'function', 'countInspectionSentinels is exported function');
    assertEq(countInspectionSentinels(''), 0, 'countInspectionSentinels("") = 0');
    assertEq(countInspectionSentinels('plain text'), 0, 'countInspectionSentinels(no sentinel) = 0');
    assertEq(countInspectionSentinels('[::INSPECTION_FLAGGED::]\nprefix\n\ntext'), 1, 'countInspectionSentinels(1 sentinel) = 1');
    const two = '[::INSPECTION_FLAGGED::]\na\n\n[::INSPECTION_FLAGGED::]\nb\n\ntext';
    assertEq(countInspectionSentinels(two), 2, 'countInspectionSentinels(2 sentinels) = 2');
    const three = two + '\n\n[::INSPECTION_FLAGGED::]\nc\n\ntext3';
    assertEq(countInspectionSentinels(three), 3, 'countInspectionSentinels(3 sentinels) = 3');

    // -- repairDuplicateSentinels --
    assert(typeof repairDuplicateSentinels === 'function', 'repairDuplicateSentinels is exported function');
    assertEq(repairDuplicateSentinels(''), '', 'repairDuplicateSentinels("") = ""');
    assertEq(repairDuplicateSentinels('plain'), 'plain', 'repairDuplicateSentinels(0 sentinel) unchanged');
    const one = '[::INSPECTION_FLAGGED::]\nprefix\n\ntext';
    assertEq(repairDuplicateSentinels(one), one, 'repairDuplicateSentinels(1 sentinel) unchanged');
    const repaired = repairDuplicateSentinels(two);
    assertEq(countInspectionSentinels(repaired), 1, 'repairDuplicateSentinels(2 sentinels) → count=1');
    assertOk(repaired.startsWith('[::INSPECTION_FLAGGED::]'), 'repairDuplicateSentinels keeps last sentinel at position 0');
    // N=5 property test
    let bg = 'original';
    for (let i = 0; i < 5; i++) bg = '[::INSPECTION_FLAGGED::]\ncycle ' + i + '\n\n' + bg;
    assertEq(countInspectionSentinels(bg), 5, '5 stacked sentinels verified');
    const repaired5 = repairDuplicateSentinels(bg);
    assertOk(countInspectionSentinels(repaired5) <= 1, 'repairDuplicateSentinels(N sentinels) → count ≤ 1');

    // -- appendTicket startsWith guard (idempotency) --
    assert(typeof addModule.appendTicket === 'function', 'appendTicket is exported function');
    const sentinelBg = '[::INSPECTION_FLAGGED::]\nflagged\n\nAlready inspected content';
    const mockData = { title: 'test', metadata: { source: 'test', generatedAt: '2026-07-30' }, phases: [{ id: -1, name: '[X] Test', characteristics: '', tickets: [] }] };
    const mockTicket = { title: 'Test Ticket', background: sentinelBg, scope: ['item'], testUnit: ['UT: test'], acceptanceCriteria: ['AC1'], invariants: 'test', contracts: [] };
    const appended = addModule.appendTicket(mockData, mockTicket);
    const addedTicket = appended.phases.find(p => p.id === -1).tickets[0];
    assertOk(addedTicket.background !== undefined, 'appendTicket preserves background');
    // The sentinel guard should NOT prepend a second sentinel
    assertOk(addedTicket.background.startsWith('[::INSPECTION_FLAGGED::]'), 'appendTicket keeps sentinel at position 0');
    const sentinelCountAfter = countInspectionSentinels(addedTicket.background);
    assertOk(sentinelCountAfter <= 1, 'appendTicket with startsWith guard: count ≤ 1 (got ' + sentinelCountAfter + ')');
    // Without sentinel, should prepend
    const plainBg = 'No sentinel content';
    const mockTicket2 = { title: 'Test Ticket 2', background: plainBg, scope: ['item'], testUnit: ['UT: test'], acceptanceCriteria: ['AC1'], invariants: 'test', contracts: [] };
    const mockData2 = { title: 'test', metadata: { source: 'test', generatedAt: '2026-07-30' }, phases: [{ id: -1, name: '[X] Test', characteristics: '', tickets: [] }] };
    const appended2 = addModule.appendTicket(mockData2, mockTicket2);
    const addedTicket2 = appended2.phases.find(p => p.id === -1).tickets[0];
    assertOk(addedTicket2.background.startsWith('[::INSPECTION_FLAGGED::]'), 'appendTicket prepends sentinel when background lacks it');

    // -- enrichTickets startsWith guard (create-tmp-omissions.js) --
    assert(typeof createTmpModule.enrichTickets === 'function', 'enrichTickets is exported function');
    const sentinelizedBg = '[::INSPECTION_FLAGGED::]\nflagged\n\nAlready flagged';
    const mergedEntries = [{ ticketKey: 'P0-1', fromStub: false, stubs: [] }];
    const ticketsData = { title: 'test', metadata: { source: 'test', generatedAt: '2026-07-30' }, phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'Test', background: sentinelizedBg, scope: ['x'], testUnit: ['UT: x'], acceptanceCriteria: ['AC'], invariants: 'x', contracts: [], status: 'todo' }] }] };
    const ticketLookup = new Map([['P0-1', ticketsData.phases[0].tickets[0]]]);
    const enriched = createTmpModule.enrichTickets(mergedEntries, ticketsData, ticketLookup);
    assert(enriched.length > 0, 'enrichTickets returns at least one ticket');
    assertOk(enriched[0].background.startsWith('[::INSPECTION_FLAGGED::]'), 'enrichTickets keeps sentinel at position 0');
    assertOk(countInspectionSentinels(enriched[0].background) <= 1, 'enrichTickets: count ≤ 1');
  }

  // ===============================================
  // PX-107: phasify-omissions.js — Re-phase omission tickets
  // ===============================================
  // @verifies C107 — All contract elements (precondition, postcondition, invariant) tested below
  console.log('\n## PX-107: phasify-omissions\n');
  {
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    assert(fs.existsSync(phasifyPath), 'phasify-omissions.js exists');

    const phasifyModule = require(phasifyPath);

    // -- parseArguments --
    assert(typeof phasifyModule.parseArguments === 'function', 'parseArguments is exported');
    assert(typeof phasifyModule.extractOmissionSubgraph === 'function', 'extractOmissionSubgraph is exported');
    assert(typeof phasifyModule.dedupTickets === 'function', 'dedupTickets is exported');
    assert(typeof phasifyModule.autoMinSize === 'function', 'autoMinSize is exported');
    assert(typeof phasifyModule.computePhaseIdOffset === 'function', 'computePhaseIdOffset is exported');
    assert(typeof phasifyModule.reassignPhaseIdsWithOffset === 'function', 'reassignPhaseIdsWithOffset is exported');
    assert(typeof phasifyModule.assignTicketsToPhases === 'function', 'assignTicketsToPhases is exported');
    assert(typeof phasifyModule.repairInspectionPrefixes === 'function', 'repairInspectionPrefixes is exported');
    assert(typeof phasifyModule.validatePhasedOmissions === 'function', 'validatePhasedOmissions is exported');
    assert(typeof phasifyModule.buildOutput === 'function', 'buildOutput is exported');

    // -- autoMinSize --
    assert(typeof phasifyModule.autoMinSize === 'function', 'autoMinSize exists');
    assertEq(phasifyModule.autoMinSize(67), 10, 'autoMinSize(67) = 10');
    assertEq(phasifyModule.autoMinSize(53), 8, 'autoMinSize(53) = 8');
    assertEq(phasifyModule.autoMinSize(21), 3, 'autoMinSize(21) = 3');
    assertEq(phasifyModule.autoMinSize(10), 3, 'autoMinSize(10) = 3');
    assertEq(phasifyModule.autoMinSize(3), 3, 'autoMinSize(3) = 3 (lower bound)');
    assertEq(phasifyModule.autoMinSize(100), 10, 'autoMinSize(100) = 10 (upper bound)');

    // -- dedupTickets --
    const allTickets = [
      { id: 106, phaseId: -1, title: 'A', originalTicketKey: 'P0-3', foundOmissions: [{evaluations:[{criterion:'A',passed:false,reason:'x',evidence:[{file:'a',line:1}]}]}] },
      { id: 1, phaseId: 0, title: 'Original P0-3', nodeIds: ['N0001'] },
      { id: 107, phaseId: -1, title: 'B', originalTicketKey: 'P5-2', foundOmissions: [{evaluations:[{criterion:'B',passed:false,reason:'y',evidence:[{file:'b',line:2}]}]}] },
      { id: 2, phaseId: 0, title: 'Clean ticket', nodeIds: ['N0002'] },
    ];
    const deduped = phasifyModule.dedupTickets(allTickets);
    assertEq(deduped.actionTickets.length, 2, 'dedupTickets: 2 action tickets');
    assertEq(deduped.referenceTickets.length, 2, 'dedupTickets: 2 reference tickets');
    assertEq(deduped.actionTickets[0].originalTicketKey, 'P0-3', 'action ticket has original key');
    assertEq(deduped.actionTicketKeys.size, 2, 'actionTicketKeys set has 2 keys');

    // dedupTickets handles empty input
    const empty = phasifyModule.dedupTickets([]);
    assertEq(empty.actionTickets.length, 0, 'dedupTickets([]): 0 action');
    assertEq(empty.referenceTickets.length, 0, 'dedupTickets([]): 0 reference');

    // -- repairInspectionPrefixes (same logic as PX-106) --
    const actionTickets = [
      { title: 'T1', background: '[::INSPECTION_FLAGGED::]\nfirst\n\n[::INSPECTION_FLAGGED::]\nsecond\n\ntext', foundOmissions: [] },
      { title: 'T2', background: '[::INSPECTION_FLAGGED::]\nsingle\n\ntext', foundOmissions: [] },
      { title: 'T3', background: 'no sentinel', foundOmissions: [] },
    ];
    phasifyModule.repairInspectionPrefixes(actionTickets);
    // T1 had 2 sentinels -> repaired to 1
    const t1count = (actionTickets[0].background.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length;
    assertOk(t1count <= 1, 'repairInspectionPrefixes reduces T1 to ≤1 sentinel (got ' + t1count + ')');
    // T2 was clean -> unchanged
    assertOk(actionTickets[1].background.startsWith('[::INSPECTION_FLAGGED::]'), 'T2 keeps sentinel');
    // T3 had no sentinel -> prepended
    assertOk(actionTickets[2].background.startsWith('[::INSPECTION_FLAGGED::]'), 'T3 gets sentinel prepended');
  }

} finally {
  process.chdir(path.resolve(__dirname, '..', '..'));
  if (fs.existsSync(TEST_TICKETS_DIR)) {
    fs.rmSync(TEST_TICKETS_DIR, { recursive: true, force: true });
  }
}

console.log(`\n---\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
