#!/usr/bin/env node
// @verifies C001 C002 C003 C004 — Gate P reads from planTestCode field (PX-75)
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-plan-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function makeTicket(id, contracts, planTestCode) {
  return { id, phaseId: 0, title: 'T' + id, status: 'planned', contracts: contracts || [], planTestCode: planTestCode || [] };
}
function c(id, pre, post, inv) { return { id, sourceEdge: 'N1->N2', precondition: pre, postcondition: post, invariant: inv }; }
console.log('\n--- verify-plan-contracts tests (Gate P, planTestCode field) ---\n');
if (!mod || !mod.verifyPlanContracts) {
  for (let i = 1; i <= 12; i++) test('Test ' + i + ' — SKIPPED (module not loaded)', () => { throw new Error('not loaded'); });
} else {
  // C004: Empty contracts
  test('C004: empty contracts passes trivially', () => {
    const t = makeTicket(75, [], []);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });

  test('C004: undefined contracts passes trivially', () => {
    const t = makeTicket(75, undefined, []);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });

  // C002: Full coverage with code patterns in planTestCode
  test('C002: planTestCode with concrete code patterns passes', () => {
    const t = makeTicket(75, [c('C001', 'Input must be valid email', 'Returns Ok result', 'State remains valid')],
      ['UT: [Normal] Validate email\n  ```rust\n  let input = "user@example.com";\n  let result = validate_email(&input);\n  assert!(result.is_ok());\n  ```']);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected 0 errors, got: ' + JSON.stringify(errs));
  });

  test('C002: planTestCode with expect-style assertion passes', () => {
    const t = makeTicket(75, [c('C001', 'Input must be valid', 'Returns expected object', 'State is unchanged')],
      ['UT: [Normal] Validate input\n  ```ts\n  const input = "valid@example.com";\n  const result = validate(input);\n  expect(result).toMatchObject({ ok: true });\n  ```']);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected 0 errors, got: ' + JSON.stringify(errs));
  });

  // C002: Rejection when planTestCode has prose only
  test('C002: planTestCode with prose only is rejected', () => {
    const t = makeTicket(75, [c('C001', 'Input must be valid email', '', '')],
      ['UT: [Normal] Check that email validation works correctly with a proper input']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0, 'Expected errors for missing precondition code');
    assert.ok(errs.some(e => e.contract === 'C001'), 'Expected C001 error');
  });

  test('C002: planTestCode with prose postcondition is rejected', () => {
    const t = makeTicket(75, [c('C002', '', 'Function should return Ok with valid data', '')],
      ['UT: [Normal] The function should return Ok when input is valid']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0);
    assert.ok(errs.some(e => e.contract === 'C002'));
  });

  test('C002: planTestCode with prose invariant is rejected', () => {
    const t = makeTicket(75, [c('C003', '', '', 'Internal state must always be consistent')],
      ['UT: [Invariant] The internal state should remain consistent after any operation']);
    const errs = mod.verifyPlanContracts(t);
    assert.ok(errs.length > 0);
    assert.ok(errs.some(e => e.contract === 'C003'));
  });

  // All contracts missing code reported at once
  test('reports all missing contracts at once (not fail-fast)', () => {
    const t = makeTicket(75, [
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

  // Edge case: empty strings → ignore
  test('empty precondition/postcondition/invariant strings are ignored', () => {
    const t = makeTicket(75, [c('C001', '', '', '')],
      ['UT: [Normal] Vague description without any code']);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });

  // C003: Empty planTestCode array when contracts exist → graceful skip
  test('C003: empty planTestCode array with contracts skips gracefully', () => {
    const t = makeTicket(75, [c('C001', 'Input must be valid', 'Returns Ok', 'State consistent')], []);
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected graceful skip when planTestCode is empty');
  });

  // C003: Absent planTestCode — graceful skip (backward compat)
  test('C003: absent planTestCode skips gracefully (backward compat)', () => {
    const t = { id: 75, phaseId: 0, title: 'T75', status: 'planned', contracts: [c('C001', 'Input must be valid', 'Returns Ok', 'State consistent')] };
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0, 'Expected graceful skip, got errors: ' + JSON.stringify(errs));
  });

  // C003: planTestCode absent and no contracts — pass
  test('C003: no planTestCode and no contracts passes', () => {
    const t = { id: 75, phaseId: 0, title: 'T75', status: 'planned' };
    const errs = mod.verifyPlanContracts(t);
    assert.strictEqual(errs.length, 0);
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
