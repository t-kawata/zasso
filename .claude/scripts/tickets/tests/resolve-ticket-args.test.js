#!/usr/bin/env node

/**
 * resolve-ticket-args.test.js — Tests for PX-88
 *
 * C001: resolve-ticket argument handling
 * - Precondition: resolve-ticket is called with optional ticket-key
 * - Postcondition: Step 7.5a/7.5b execute only when ARGUMENTS is non-empty
 * - Invariant: No-args mode behavior unchanged
 *
 * Red phase: tests should fail before implementation (no branching logic exists).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-88, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-88|PX-89) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-88, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-88|PX-89) --for-spec --no-implementation-order`.
function assertIncludes(text, substring, message) {
  if (text.includes(substring)) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected "' + substring + '" not found\n'); }
}

// [::TICKET::] PX-88, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-88|PX-89) --for-spec --no-implementation-order`.
function assertNotIncludes(text, substring, message) {
  if (!text.includes(substring)) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — unexpected "' + substring + '" found\n'); }
}

console.log('\n━━━ resolve-ticket-args.test.js (PX-88) — RED PHASE ━━━\n');

const resolveTicketPath = path.resolve(__dirname, '..', '..', '..', 'commands', 'resolve-ticket.md');
const enumerateScriptPath = path.resolve(__dirname, '..', 'enumerate-ticket-targets.js');
const scriptsDir = path.resolve(__dirname, '..');

// ======================================================================
// C001-Postcondition: resolve-ticket.md contains branching logic
// ======================================================================

console.log('## C001 — resolve-ticket.md branching logic\n');

(function () {
  // Postcondition: Step 7.5a usage line references $ARGUMENTS only when non-empty
  const content = fs.readFileSync(resolveTicketPath, 'utf8');
  // The branching logic: if $ARGUMENTS is non-empty, run enumerate/validate
  // RED: this does not exist — the file always uses $ARGUMENTS unconditionally
  const hasConditional = content.includes('if') && content.includes('$ARGUMENTS') &&
    (content.includes('-n "$ARGUMENTS"') || content.includes('non-empty') || content.includes('skip'));
  assert(hasConditional, 'resolve-ticket.md contains branching logic for $ARGUMENTS');
})();

(function () {
  // Invariant: no-args mode documented (backward compat)
  const content = fs.readFileSync(resolveTicketPath, 'utf8');
  // RED: backward compat not yet documented
  const hasNoArgsDoc = content.includes('no argument') || content.includes('no-args') ||
    content.includes('No arguments') || content.includes('skips');
  assert(hasNoArgsDoc, 'resolve-ticket.md documents no-args behavior');
})();

// ======================================================================
// C001-Postcondition: enumerate-ticket-targets.js .claude comment
// ======================================================================

console.log('\n## C001 — .claude SKIP_DIRS comment\n');

(function () {
  const content = fs.readFileSync(enumerateScriptPath, 'utf8');
  // Postcondition: SKIP_DIRS has comment explaining .claude exclusion
  // RED: no comment exists
  const hasComment = content.includes('.claude') &&
    (content.includes('self-referenc') || content.includes('loop') || content.includes('pipeline'));
  assert(hasComment, 'enumerate-ticket-targets.js explains .claude skip reason');
})();

// ======================================================================
// C001-Postcondition: enumerate-ticket-targets.js still works
// ======================================================================

console.log('\n## C001 — enumerate script backward compat\n');

(function () {
  // Invariant: enumerate still works with --dir and --ticket-key
  // Create a minimal temp dir to scan
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px88-enum-'));
  const ticketsPath = path.join(tmpDir, 'Tickets.json');
  const data = {
    title: 'test', metadata: { source: 'test', generatedAt: '2026-07-28' },
    phases: [{ id: -1, name: 'PX', tickets: [{ id: 99, phaseId: -1, status: 'todo', title: 'test stub' }] }]
  };
  fs.writeFileSync(ticketsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

  // Create a small test file with a STUB marker
  fs.writeFileSync(path.join(tmpDir, 'dummy.rs'),
    '// [::STUB::] PX-99: test stub\nfn placeholder() {}\n', 'utf8');

  try {
    const r = execSync('node ' + enumerateScriptPath + ' --dir=' + tmpDir + ' --ticket-key=PX-99 --tickets=' + ticketsPath, {
      encoding: 'utf8', timeout: 5000, shell: '/bin/bash'
    });
    const parsed = JSON.parse(r.trim());
    assert(parsed.ok === true, 'enumerate with --dir and --ticket-key returns ok=true');
    assert(typeof parsed.found === 'number', 'enumerate returns found count');
  } catch (e) {
    assert(false, 'enumerate with valid args exits 0 — ' + (e.message || e.stdout || ''));
  }

  // Cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
