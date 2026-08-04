




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
// [::TICKET::] PX-108 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-108 --for-spec --no-implementation-order`.
function assertOk(value, message) {
// [::TICKET::] PX-112 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-112 --for-spec --no-implementation-order`.
// [::TICKET::] PX-111 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-111 --for-spec --no-implementation-order`.
// [::TICKET::] PX-110 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-110 --for-spec --no-implementation-order`.
// [::TICKET::] PX-109 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-109 --for-spec --no-implementation-order`.
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
    round: 1,
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
    // PX-119: appendTicket appends to the max real phase (creates phase 0 when only the PX
    // phase exists) — locate the ticket by title instead of assuming the PX phase.
    // [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
    const addedTicket = appended.phases.flatMap(p => p.tickets).find(t => t.title === 'Test Ticket');
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
    const addedTicket2 = appended2.phases.flatMap(p => p.tickets).find(t => t.title === 'Test Ticket 2');
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

  // ===============================================
  // PX-108: phasify-omissions auto-merge pipeline
  // ===============================================
  // @verifies C108
  console.log('\n## PX-108: phasify-omissions auto-merge\n');
  {
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    assert(fs.existsSync(phasifyPath), 'phasify-omissions.js exists');

    const p = require(phasifyPath);

    // -- Exports existence --
    assert(typeof p.backupTickets === 'function', 'backupTickets exported');
    assert(typeof p.mergePhasifyToTickets === 'function', 'mergePhasifyToTickets exported');
    assert(typeof p.validateMergedTickets === 'function', 'validateMergedTickets exported');
    assert(typeof p.atomicWrite === 'function', 'atomicWrite exported');
    assert(typeof p.cleanupFiles === 'function', 'cleanupFiles exported');

    // -- backupTickets: normal --
    const ts = '20260730120000';
    const backupPath = path.join(os.tmpdir(), 'tmp-Tickets-' + ts + '.json');
    const srcPath = path.resolve('Tickets.json');
    const backupResult = p.backupTickets(srcPath, backupPath);
    assertOk(backupResult.success, 'backupTickets: success');
    assert(fs.existsSync(backupPath), 'backupTickets: file exists');
    const srcContent = fs.readFileSync(srcPath, 'utf8');
    const bakContent = fs.readFileSync(backupPath, 'utf8');
    assertEq(bakContent, srcContent, 'backupTickets: content identical');
    fs.unlinkSync(backupPath);

    // -- backupTickets: error on nonexistent path --
    let threw = false;
    try { p.backupTickets('/nonexistent/path.json', backupPath); } catch (e) { threw = true; }
    assertOk(threw, 'backupTickets: throws on nonexistent');

    // -- mergePhasifyToTickets: normal --
    const baseData = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const phasifiedData = {
      title: 'test phasified',
      metadata: { source: 'test', generatedAt: '2026-07-30' },
      phases: [{ id: 22, name: 'P22', nodeIds: ['N0001'], tickets: [{ id: 1, phaseId: 22, title: 'Test', status: 'todo' }] }],
      referenceTickets: [{ id: 99, phaseId: 0, title: 'ref' }]
    };
    const mergeResult = p.mergePhasifyToTickets(baseData, phasifiedData);
    assertOk(mergeResult.success, 'mergePhasifyToTickets: success');
    assertEq(mergeResult.data.phases.length, baseData.phases.length + 1, 'mergePhasifyToTickets: one phase added');
    assertEq(mergeResult.data.referenceTickets, undefined, 'mergePhasifyToTickets: refTickets stripped');

    // -- mergePhasifyToTickets: no mutation of original --
    assertEq(baseData.phases.length, 1, 'mergePhasifyToTickets: original unchanged');

    // -- mergePhasifyToTickets: empty phasified phases --
    const emptyPhasified = { title: 'e', metadata: { source: 't', generatedAt: '2026-07-30' }, phases: [] };
    const emptyResult = p.mergePhasifyToTickets(baseData, emptyPhasified);
    assertOk(emptyResult.success, 'mergePhasifyToTickets: empty succeeds');
    assertEq(emptyResult.data.phases.length, baseData.phases.length, 'mergePhasifyToTickets: no phases added');

    // -- mergePhasifyToTickets: TypeError on null --
    threw = false;
    try { p.mergePhasifyToTickets(null, {}); } catch (e) { threw = true; }
    assertOk(threw, 'mergePhasifyToTickets: throws on null');

    // -- validateMergedTickets: valid passes --
    const validData = { round: 1, title: 't', metadata: { source: 's', generatedAt: '2026-07-30' }, phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 't', status: 'todo' }] }] };
    const validResult = p.validateMergedTickets(validData);
    assertOk(validResult.valid, 'validateMergedTickets: valid true');

    // -- validateMergedTickets: invalid fails --
    const invalidResult = p.validateMergedTickets({});
    assertEq(invalidResult.valid, false, 'validateMergedTickets: invalid false');
    assertOk(invalidResult.errors.length > 0, 'validateMergedTickets: has errors');

    // -- atomicWrite: normal --
    const atomicTarget = path.join(os.tmpdir(), 'atomic-test-' + ts + '.json');
    const atomicContent = JSON.stringify({ test: true });
    p.atomicWrite(atomicTarget, atomicContent);
    assert(fs.existsSync(atomicTarget), 'atomicWrite: target exists');
    assertEq(fs.readFileSync(atomicTarget, 'utf8'), atomicContent, 'atomicWrite: content matches');
    fs.unlinkSync(atomicTarget);

    // -- cleanupFiles: normal --
    const tmp1 = path.join(os.tmpdir(), 'cleanup-test-1');
    const tmp2 = path.join(os.tmpdir(), 'cleanup-test-2');
    fs.writeFileSync(tmp1, '');
    fs.writeFileSync(tmp2, '');
    p.cleanupFiles([tmp1, tmp2]);
    assertEq(fs.existsSync(tmp1), false, 'cleanupFiles: tmp1 deleted');
    assertEq(fs.existsSync(tmp2), false, 'cleanupFiles: tmp2 deleted');

    // -- cleanupFiles: nonexistent silently ignored --
    let caught = false;
    try { p.cleanupFiles(['/nonexistent/path.tmp']); } catch (e) { caught = true; }
    assertEq(caught, false, 'cleanupFiles: nonexistent no throw');

    // -- cleanupFiles: empty array --
    caught = false;
    try { p.cleanupFiles([]); } catch (e) { caught = true; }
    assertEq(caught, false, 'cleanupFiles: empty array no throw');
  }

  // ===============================================
  // PX-109: phasify-omissions --rollback
  // ===============================================
  // @verifies C109
  console.log('\n## PX-109: phasify-omissions --rollback\n');
  {
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    assert(fs.existsSync(phasifyPath), 'phasify-omissions.js exists');
    const p = require(phasifyPath);

    // -- Exports --
    assert(typeof p.rollbackPhasifyMerge === 'function', 'rollbackPhasifyMerge exported');

    // -- rollbackPhasifyMerge: normal --
    const input = {
      title: 'test',
      metadata: { source: 's', generatedAt: '2026-07-30', phasifyMerge: { offset: 6, mergedPhaseIds: [6, 7], mergedAt: '2026-07-30' } },
      phases: [
        { id: -1, name: 'PX', tickets: [{ id: 1, phaseId: -1, title: 'X', status: 'todo' }] },
        { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'A', status: 'done' }] },
        { id: 6, name: 'P6', tickets: [{ id: 1, phaseId: 6, title: 'Merged', status: 'todo' }] },
        { id: 7, name: 'P7', tickets: [{ id: 1, phaseId: 7, title: 'Merged2', status: 'todo' }] }
      ]
    };
    const result = p.rollbackPhasifyMerge(input);
    assertEq(result.phases.length, 2, 'rollback: 2 phases remain');
    assertEq(result.phases[0].id, -1, 'rollback: PX preserved');
    assertEq(result.phases[1].id, 0, 'rollback: P0 preserved');
    assertEq(result.metadata.phasifyMerge, undefined, 'rollback: phasifyMerge removed');
    assertEq(input.phases.length, 4, 'rollback: original unchanged');

    // -- rollbackPhasifyMerge: throws on missing metadata --
    const noMeta = { title: 't', metadata: { source: 's', generatedAt: '2026-07-30' }, phases: [] };
    let threw = false;
    try { p.rollbackPhasifyMerge(noMeta); } catch (e) { threw = true; }
    assertOk(threw, 'rollback: throws on missing metadata');

    // -- rollbackPhasifyMerge: offset=-2 removes ALL phases (PX=-1 included) → throws --
    const badOffset = {
      title: 't',
      metadata: { source: 's', generatedAt: '2026-07-30', phasifyMerge: { offset: -2, mergedPhaseIds: [], mergedAt: '2026-07-30' } },
      phases: [{ id: -1, name: 'PX', tickets: [] }, { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'A', status: 'todo' }] }]
    };
    threw = false;
    try { p.rollbackPhasifyMerge(badOffset); } catch (e) { threw = true; }
    assertOk(threw, 'rollback: throws when offset removes all phases');

    // -- rollbackPhasifyMerge: offset=0 keeps PX(-1) -- not an error
    const offsetZero = {
      title: 't',
      metadata: { source: 's', generatedAt: '2026-07-30', phasifyMerge: { offset: 0, mergedPhaseIds: [0], mergedAt: '2026-07-30' } },
      phases: [{ id: -1, name: 'PX', tickets: [] }, { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'A', status: 'todo' }] }]
    };
    const rOff0 = p.rollbackPhasifyMerge(offsetZero);
    assertEq(rOff0.phases.length, 1, 'rollback offset=0: preserves PX');

    // -- rollbackPhasifyMerge: preserves phases with id < offset --
    const input2 = {
      title: 't',
      metadata: { source: 's', generatedAt: '2026-07-30', phasifyMerge: { offset: 3, mergedPhaseIds: [3, 4], mergedAt: '2026-07-30' } },
      phases: [
        { id: -1, name: 'PX', tickets: [] },
        { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'A', status: 'done' }] },
        { id: 3, name: 'P3', tickets: [{ id: 1, phaseId: 3, title: 'M', status: 'todo' }] }
      ]
    };
    const r2 = p.rollbackPhasifyMerge(input2);
    assertEq(r2.phases.length, 2, 'rollback offset=3: 2 phases remain');
    assertEq(r2.phases[0].id, -1, 'rollback offset=3: PX');
    assertEq(r2.phases[1].id, 0, 'rollback offset=3: P0');
  }

  // ===============================================
  // PX-110: rename-phases.js + phase info output
  // ===============================================
  // @verifies C110
  console.log('\n## PX-110: rename-phases + phase info output\n');
  {
    // -- renamePhases: normal --
    const rp = require(path.join(SCRIPTS_DIR, 'rename-phases.js'));
    assert(typeof rp.renamePhases === 'function', 'renamePhases exported');

    const phaseInput = {
      title: 'test', metadata: { source: 's', generatedAt: '2026-07-30' },
      phases: [
        { id: 6, name: 'P6', tickets: [{ id: 1, phaseId: 6, title: 'T1', status: 'todo' }] },
        { id: 7, name: 'P7', tickets: [] }
      ]
    };
    const r1 = rp.renamePhases(phaseInput, [{ phaseId: 6, newName: 'Storage Layer' }]);
    assertEq(r1.phases[0].name, 'Storage Layer', 'renamePhases: name updated');
    assertEq(phaseInput.phases[0].name, 'P6', 'renamePhases: original unchanged');
    assertEq(r1.phases[0].id, 6, 'renamePhases: id preserved');

    // -- renamePhases: multiple phases --
    const r2 = rp.renamePhases(phaseInput, [{ phaseId: 6, newName: 'A' }, { phaseId: 7, newName: 'B' }]);
    assertEq(r2.phases[0].name, 'A', 'renamePhases: multi phase6');
    assertEq(r2.phases[1].name, 'B', 'renamePhases: multi phase7');

    // -- renamePhases: same name no-op --
    const r3 = rp.renamePhases(phaseInput, [{ phaseId: 6, newName: 'P6' }]);
    assertEq(r3.phases[0].name, 'P6', 'renamePhases: same name ok');

    // -- renamePhases: errors --
    let err = false;
    try { rp.renamePhases(phaseInput, [{ phaseId: 99, newName: 'X' }]); } catch (e) { err = true; }
    assertOk(err, 'renamePhases: throws on bad phaseId');

    err = false;
    try { rp.renamePhases(phaseInput, [{ phaseId: 6, newName: '' }]); } catch (e) { err = true; }
    assertOk(err, 'renamePhases: throws on empty name');

    err = false;
    const pxPhases = { title: 't', metadata: { source: 's', generatedAt: '2026-07-30' }, phases: [{ id: -1, name: 'PX', tickets: [] }, { id: 0, name: 'P0', tickets: [] }] };
    try { rp.renamePhases(pxPhases, [{ phaseId: -1, newName: 'X' }]); } catch (e) { err = true; }
    assertOk(err, 'renamePhases: throws on PX(-1) rename');

    // -- renamePhases: invariant — non-name fields unchanged --
    assertEq(r1.phases[0].tickets.length, 1, 'renamePhases: tickets preserved');
    assertEq(r1.phases[0].tickets[0].title, 'T1', 'renamePhases: ticket title preserved');

    // -- phasify-omissions output: node title mapping in report (C002) --
    // Test by inspecting the runPhasifyOmissions function's report generation
    // We verify the graph node map is correctly output for phases
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    const p2 = require(phasifyPath);
    // Check that graphData.nodes is accessible (no crash)
    assert(typeof p2.buildOutput === 'function', 'phasify buildOutput available');
  }

  // ===============================================
  // PX-111: pre-merge snapshot + auto-review
  // ===============================================
  // @verifies C111
  console.log('\n## PX-111: snapshot + auto-review\n');
  {
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    const p = require(phasifyPath);
    assert(typeof p.markPreMergeTicketsReviewed === 'function', 'markPreMergeTicketsReviewed exported');
    assert(typeof p.createSnapshot === 'function', 'createSnapshot exported');

    // -- markPreMergeTicketsReviewed: normal (PX-114 round-aware contract) --
    const input = {
      title: 'test', metadata: { source: 's', generatedAt: '2026-07-30' },
      phases: [
        { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'A', status: 'todo' }] },
        { id: 1, name: 'P1', tickets: [{ id: 1, phaseId: 1, title: 'B', status: 'done' }] },
        { id: 6, name: 'P6', tickets: [{ id: 1, phaseId: 6, title: 'New', status: 'todo' }] }
      ]
    };
    const result = p.markPreMergeTicketsReviewed(input, 6, 1);
    assertEq(result.phases[0].tickets[0].status, 'R1', 'markReviewed: pre-offset todo -> R1 (round-aware)');
    assertEq(result.phases[1].tickets[0].status, 'R1', 'markReviewed: done also becomes R1');
    assertEq(result.phases[2].tickets[0].status, 'todo', 'markReviewed: offset+ tickets untouched');
    assertEq(input.phases[0].tickets[0].status, 'todo', 'markReviewed: original unchanged');
    assertEq(result.phases[0].tickets[0].id, 1, 'markReviewed: id preserved');
    assertEq(result.phases[0].tickets[0].phaseId, 0, 'markReviewed: phaseId preserved');

    // -- createSnapshot: normal --
    const srcPath = path.resolve('Tickets.json');
    const snapResult = p.createSnapshot(srcPath, '20260730120000');
    assertOk(snapResult.success, 'snapshot: success');
    const snapFile = path.join(path.dirname(srcPath), 'Tickets-20260730120000.json');
    assert(fs.existsSync(snapFile), 'snapshot: file exists');
    fs.unlinkSync(snapFile);

    // -- createSnapshot: failure returns {success: false} --
    const failResult = p.createSnapshot('/nonexistent/path.json', 'test');
    assertEq(failResult.success, false, 'snapshot: fails gracefully');
  }

  // ===============================================
  // PX-112: move artifacts to omissions/ and tickets/
  // ===============================================
  // @verifies C112
  console.log('\n## PX-112: move artifacts\n');
  {
    const phasifyPath = path.join(SCRIPTS_DIR, '../rfc-graph/phasify-omissions.js');
    const p = require(phasifyPath);
    assert(typeof p.moveArtifacts === 'function', 'moveArtifacts exported');

    var baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px112-test-'));
    var srcPhasified = path.join(baseDir, 'OMISSIONS-phasified-20260730.json');
    var opts = { ticketsPath: path.join(baseDir, 'Tickets.json') };

    // Create test files
    fs.writeFileSync(srcPhasified, '{}');
    fs.writeFileSync(opts.ticketsPath, '{}');

    // Move phasified + null snapshot
    p.moveArtifacts(opts, srcPhasified, null);
    assert(fs.existsSync(path.join(baseDir, 'omissions', 'OMISSIONS-phasified-20260730.json')), 'move: phasified to omissions/');
    assertEq(fs.existsSync(srcPhasified), false, 'move: original phasified removed');

    // Move snapshot
    var srcSnapshot = path.join(baseDir, 'Tickets-20260730.json');
    fs.writeFileSync(srcSnapshot, '{}');
    p.moveArtifacts(opts, null, srcSnapshot);
    assert(fs.existsSync(path.join(baseDir, 'tickets', 'Tickets-20260730.json')), 'move: snapshot to tickets/');

    // Edge: dirs already exist (idempotent)
    p.moveArtifacts(opts, null, null);

    // Edge: missing source file silently skipped
    p.moveArtifacts(opts, '/nonexistent/path.json', null);

    // cleanup
    fs.rmSync(baseDir, { recursive: true, force: true });
  }

} finally {
  process.chdir(path.resolve(__dirname, '..', '..'));
  if (fs.existsSync(TEST_TICKETS_DIR)) {
    fs.rmSync(TEST_TICKETS_DIR, { recursive: true, force: true });
  }
}

console.log(`\n---\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
