#!/usr/bin/env node

/**
 * show-ticket-context-target-status.test.js — Tests for PX-87
 *
 * @verifies C001
 * C001: show-ticket-context output includes ## Target Status section
 * when targetStubs/targetCrimes exist.
 */

const { execSync } = require('child_process');
const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-87 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ show-ticket-context-target-status.test.js (PX-87) — RED PHASE ━━━\n');

const scriptPath = path.resolve(__dirname, '..', 'show-ticket-context.js');

(function () {
  // PX-84 has targetStubs — should show ## Target Status
  const cmd = 'node ' + scriptPath + ' --ticket-key=PX-84 2>/dev/null';
  const stdout = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' });
  assert(stdout.includes('Target Status'), 'output contains ## Target Status section when targetStubs exist');
  assert(stdout.includes('targetStubs'), 'output mentions targetStubs');
})();

(function () {
  // --for-spec mode should NOT have Target Status
  const cmd = 'node ' + scriptPath + ' --ticket-key=PX-84 --for-spec 2>/dev/null';
  const stdout = execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' });
  assert(!stdout.includes('Target Status'), '--for-spec mode omits Target Status section');
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
