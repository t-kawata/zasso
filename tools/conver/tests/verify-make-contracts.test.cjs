#!/usr/bin/env node
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-make-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function makeTicket(id, contracts, testUnit, testExceptions) {
  return { id, phaseId: 0, title:'T'+id, status:'todo', contracts: contracts||[], testUnit: testUnit||[], testExceptions: testExceptions||[] };
}
function c(id, pre, post, inv) { return { id, sourceEdge:'N1→N2', precondition: pre, postcondition: post, invariant: inv }; }
console.log('\n--- verify-make-contracts tests ---\n');
if (!mod || !mod.verifyMakeContracts) {
  for (let i = 1; i <= 6; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('passes when all contracts covered in testUnit', () => {
    const t = makeTicket(1, [c('C001','key loaded','token signed','mem clean')],
      ['UT: [Normal] key loaded → token signed (mem clean)']);
    const errs = mod.verifyMakeContracts(t);
    assert.strictEqual(errs.length, 0);
  });
  test('blocks missing precondition in testUnit', () => {
    const t = makeTicket(1, [c('C001','prerequisite_x','result_y','state_z')],
      ['UT: result_y test']);
    const errs = mod.verifyMakeContracts(t);
    assert.ok(errs.some(e => e.detail && e.detail.includes('precondition')));
  });
  test('blocks missing postcondition in testUnit', () => {
    const t = makeTicket(1, [c('C001','pre_a','post_b','inv_c')],
      ['UT: pre_a setup test']);
    const errs = mod.verifyMakeContracts(t);
    assert.ok(errs.some(e => e.detail && e.detail.includes('postcondition')));
  });
  test('detects insufficient testExceptions justification', () => {
    const t = makeTicket(1, [], [], ['Some item cannot be tested']);
    const errs = mod.verifyMakeContracts(t);
    assert.ok(errs.some(e => e.detail && e.detail.includes('testException')));
  });
  test('passes with no contracts', () => {
    const errs = mod.verifyMakeContracts(makeTicket(1, [], [], []));
    assert.strictEqual(errs.length, 0);
  });
  test('handles missing testUnit field gracefully', () => {
    const t = { id:1, phaseId:0, title:'T1', status:'todo', contracts:[c('C001','prerequisite_condition','result_behavior','state_invariant')] };
    const errs = mod.verifyMakeContracts(t);
    assert.ok(Array.isArray(errs));
    assert.ok(errs.length > 0); // pre/post/inv uncovered due to missing testUnit
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
