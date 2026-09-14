#!/usr/bin/env node
// [::TICKET::] PX-120: phasify key rewrite — tests for rewriteStubKeys / guardExcuseMerge.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-120 --for-spec --no-implementation-order`.

/**
 * phasify-key-rewrite.test.js — RED tests for the phasify key rewrite helpers.
 *
 * @verifies C004 (clone plus newKey to rewritten stubs)
 * @verifies C005 (validate to fix loop to proceed)
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

// RED: the helpers do not exist yet — requiring must fail the suite.
let h;
try {
  h = require('../../rfc-graph/phasify-helpers.js');
} catch (e) {
  console.error('[RED] phasify-helpers.js not implemented:', e.code);
  process.exit(1);
}

const { rewriteStubKeys, guardExcuseMerge } = h;

// Fixture: build a Tickets.json-like structure with the correct phase per key
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function fixtureTickets(map) {
  const byPhase = {};
  for (const key of Object.keys(map)) {
    const m = key.match(/^P(-?\d+|X)-(\d+)$/);
    const phaseId = m[1] === 'X' ? -1 : parseInt(m[1], 10);
    if (!byPhase[phaseId]) byPhase[phaseId] = [];
    byPhase[phaseId].push({ id: parseInt(m[2], 10), phaseId, status: map[key].status });
  }
  return {
    phases: Object.keys(byPhase).map(pid => ({
      id: parseInt(pid, 10),
      name: 'P' + pid,
      tickets: byPhase[pid]
    }))
  };
}

console.log('\n━━━ phasify-key-rewrite.test.js — TESTS ━━━\n');

// ============================================================
// C004 — key rewrite
// ============================================================
console.log('## C004 — rewriteStubKeys\n');

(function testC004RewritesContent() {
  console.log('  ── old key replaced by new key in stubs[].content');
  const clone = {
    id: 1,
    phaseId: 9,
    stubs: [{ content: '// [::STUB::] P4-2: codec placeholder -- Implement via pjsua_codec_info' }]
  };
  const rewritten = rewriteStubKeys(clone, { 'P4-2': 'P9-1' });
  assert(rewritten.stubs[0].content.includes('P9-1'), 'content key rewritten to newKey');
  assert(!rewritten.stubs[0].content.includes('P4-2'), 'old key removed from content');
})();

(function testC004DeterministicMapping() {
  console.log('  ── oldKey -> newKey mapping is deterministic and applies to all stubs');
  const clone = {
    id: 2,
    phaseId: 9,
    stubs: [
      { content: '// [::STUB::] P4-2: a -- b' },
      { content: '// [::STUB::] P4-2: c -- d' },
      { content: '// [::STUB::] P3-2: e -- f' }
    ]
  };
  const rewritten = rewriteStubKeys(clone, { 'P4-2': 'P9-1', 'P3-2': 'P9-2' });
  assert(rewritten.stubs[0].content.includes('P9-1'), 'stub 0 rewritten');
  assert(rewritten.stubs[1].content.includes('P9-1'), 'stub 1 rewritten');
  assert(rewritten.stubs[2].content.includes('P9-2'), 'stub 2 rewritten with its own newKey');
  assert(!rewritten.stubs.some(s => /P[34]-2:/.test(s.content)), 'no old keys remain');
})();

(function testC004LeavesUnmappedKeys() {
  console.log('  ── unmapped keys are left untouched');
  const clone = { id: 3, phaseId: 9, stubs: [{ content: '// [::STUB::] P8-4: x -- y' }] };
  const rewritten = rewriteStubKeys(clone, { 'P4-2': 'P9-1' });
  assert(rewritten.stubs[0].content.includes('P8-4'), 'unmapped key preserved');
})();

// ============================================================
// C004 — excuse merge guard
// ============================================================
console.log('\n## C004 — guardExcuseMerge\n');

(function testC004ExcuseBlocksMerge() {
  console.log('  ── a clone with an excuse stub is not merged');
  const badClone = {
    id: 4,
    phaseId: 9,
    stubs: [{ content: '// [::STUB::] P9-1: requires external headers -- ' }]
  };
  let threw = false;
  try {
    guardExcuseMerge([badClone], {});
  } catch (e) {
    threw = true;
    assert(String(e.message).length > 0, 'rejection carries a diagnostic message');
  }
  assert(threw, 'excuse stub must throw from guardExcuseMerge');
})();

(function testC004CleanMergePasses() {
  console.log('  ── clean clones merge without throwing');
  const goodClone = {
    id: 5,
    phaseId: 9,
    stubs: [{ content: '// [::STUB::] P9-1: codec placeholder -- Implement via pjsua_codec_info' }]
  };
  let threw = false;
  try {
    guardExcuseMerge([goodClone], {});
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'clean clone must not throw');
})();

// ============================================================
// C005 — self-healing loop
// ============================================================
console.log('\n## C005 — self-healing loop\n');

(function testC005RunSelfHealingLoopTerminatesGreen() {
  console.log('  ── loop terminates with zero failures and proceeds');
  const h2 = require('../../rfc-graph/phasify-helpers.js');
  if (typeof h2.runSelfHealingLoop !== 'function') {
    assert(false, 'runSelfHealingLoop must be exported');
    return;
  }
  const excuses = [
    { content: '// [::STUB::] P9-1: requires external a -- ' },
    { content: '// [::STUB::] P9-1: requires external b -- ' },
    { content: '// [::STUB::] P9-1: requires external c -- ' }
  ];
  const tickets = fixtureTickets({ 'P9-1': { status: 'todo' } });
  const fixStub = (stub) => ({ ...stub, content: stub.content + '-- Implement real logic' });
  const finalRound = h2.runSelfHealingLoop(excuses, fixStub, { ticketsData: tickets });
  assert(finalRound.failures === 0, 'loop terminates with zero failures');
  assert(finalRound.proceeded === true, 'proceeds only after green');
})();

(function testC005ZeroProgressHardStops() {
  console.log('  ── a zero-progress round is a hard-stop diagnostic');
  const h2 = require('../../rfc-graph/phasify-helpers.js');
  if (typeof h2.runSelfHealingLoop !== 'function') {
    assert(false, 'runSelfHealingLoop must be exported');
    return;
  }
  const excuse = [{ content: '// [::STUB::] P9-1: requires external a -- ' }];
  let threw = false;
  try {
    h2.runSelfHealingLoop(excuse, () => { /* no-op fix: no progress */ });
  } catch (e) {
    threw = true;
  }
  assert(threw, 'no-op fix round must hard-stop');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
