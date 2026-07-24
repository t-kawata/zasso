#!/usr/bin/env node
// @verifies C001 C002 C003 C004 — Gate P verifies concrete test code in plan testUnit
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-plan-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function makeTicket(id, contracts, testUnit) {
  return { id, phaseId: 0, title: 'T' + id, status: 'planned', contracts: contracts || [], testUnit: testUnit || [] };
}
function c(id, pre, post, inv) { return { id, sourceEdge: 'N1->N2', precondition: pre, postcondition: post, invariant: inv }; }
console.log('\n--- verify-plan-contracts tests (Gate P) ---\n');
if (!mod || !mod.verifyPlanContracts) {
  for (let i = 1; i <= 10; i++) test('Test ' + i + ' — SKIPPED (module not loaded)', () => { throw new Error('not loaded'); });
} else {
  // C004: Empty contracts
  test('C004: empty contracts passes trivially', () => {
    const t = makeTicket(74, [], []);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });

  test('C004: undefined contracts passes trivially', () => {
    const t = makeTicket(74, undefined, []);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });

  // C001+C002+C003: Full coverage with code patterns
  test('C001+C002+C003: precondition+postcondition+invariant with code passes', () => {
    const t = makeTicket(74, [c('C001', 'Input must be valid email', 'Returns Ok result', 'State remains valid')],
      ['UT: [Normal] Validate email\n  ```rust\n  let input = "user@example.com";\n  let result = validate_email(&input);\n  assert!(result.is_ok());\n  ```']);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected 0 errors, got: ' + JSON.stringify(errs));
  });

  test('C001+C002+C003: expect-style assertion passes', () => {
    const t = makeTicket(74, [c('C001', 'Input must be valid', 'Returns expected object', 'State is unchanged')],
      ['UT: [Normal] Validate input\n  ```ts\n  const input = "valid@example.com";\n  const result = validate(input);\n  expect(result).toMatchObject({ ok: true });\n  ```']);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected 0 errors, got: ' + JSON.stringify(errs));
  });

  // C001: Precondition without test code
  test('C001: precondition sans test input code is rejected', () => {
    const t = makeTicket(74, [c('C001', 'Input must be valid email', '', '')],
      ['UT: [Normal] Check that email validation works correctly with a proper input']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0, 'Expected errors for missing precondition code');
    assert.ok(errs.some(e => e.contract === 'C001'), 'Expected C001 error');
  });

  // C002: Postcondition without assertion code
  test('C002: postcondition sans assertion code is rejected', () => {
    const t = makeTicket(74, [c('C002', '', 'Function should return Ok with valid data', '')],
      ['UT: [Normal] The function should return Ok when input is valid']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0);
    assert.ok(errs.some(e => e.contract === 'C002'));
  });

  // C003: Invariant without predicate code
  test('C003: invariant sans predicate code is rejected', () => {
    const t = makeTicket(74, [c('C003', '', '', 'Internal state must always be consistent')],
      ['UT: [Invariant] The internal state should remain consistent after any operation']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0);
    assert.ok(errs.some(e => e.contract === 'C003'));
  });

  // All contracts missing code reported at once
  test('reports all missing contracts at once (not fail-fast)', () => {
    const t = makeTicket(74, [
      c('C001', 'Precondition A', '', ''),
      c('C002', '', 'Postcondition B', ''),
      c('C003', '', '', 'Invariant C'),
    ], ['UT: [Normal] Some vague description without code patterns']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length >= 3, 'Expected 3+ errors for 3 missing contract elements, got: ' + errs.length);
    const contractIds = errs.map(e => e.contract);
    assert.ok(contractIds.includes('C001'), 'Missing C001');
    assert.ok(contractIds.includes('C002'), 'Missing C002');
    assert.ok(contractIds.includes('C003'), 'Missing C003');
  });

  // Edge case: empty precondition/postcondition/invariant strings → ignore that element
  test('empty precondition/postcondition/invariant strings are ignored', () => {
    const t = makeTicket(74, [c('C001', '', '', '')],
      ['UT: [Normal] Vague description without any code']);
    const errs = mod.verifyPlanContracts(t);
    // All elements are empty strings → nothing to verify → should pass
    assert.strictEqual(errs.length, 0);
  });

  // Missing testUnit field
  test('missing testUnit field is handled gracefully', () => {
    const t = { id: 74, phaseId: 0, title: 'T74', status: 'planned', contracts: [c('C001', 'Input must be valid', 'Returns Ok', 'State consistent')] };
    const errs = mod.verifyPlanContracts(t);
    assert.ok(Array.isArray(errs));
    assert.ok(errs.length > 0, 'Expected errors when testUnit is missing');
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
