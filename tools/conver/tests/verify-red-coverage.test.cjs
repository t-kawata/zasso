#!/usr/bin/env node
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

let mod;
try { mod = require('../.claude/scripts/tickets/verify-red-coverage.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }

console.log('\n--- verify-red-coverage tests ---\n');

if (!mod || !mod.scanContractCoverage) {
  for (let i = 1; i <= 8; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('passes when all contract IDs have @verifies', () => {
    const content = '// @verifies C001\n// @verifies C002\n#[test] fn test1() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001', 'C002']));
    assert.strictEqual(result.missing.length, 0);
    assert.strictEqual(result.unknown.length, 0);
  });

  test('blocks when contract ID missing @verifies', () => {
    const content = '// @verifies C001\n#[test] fn test1() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001', 'C002']));
    assert.ok(result.missing.includes('C002'));
  });

  test('warns on unknown @verifies ID', () => {
    const content = '// @verifies C001\n// @verifies C999\n#[test] fn test1() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001']));
    assert.strictEqual(result.missing.length, 0);
    assert.ok(result.unknown.some(u => u.id === 'C999'));
  });

  test('handles multiple @verifies in one file', () => {
    const content = '// @verifies C001\n// @verifies C002\n// @verifies C003\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001', 'C002', 'C003']));
    assert.strictEqual(result.missing.length, 0);
  });

  test('handles @requires and @assert-invariant', () => {
    const content = '// @verifies C001\n// @requires C002\n// @assert-invariant C003\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001', 'C002', 'C003']));
    assert.strictEqual(result.missing.length, 0);
  });

  test('handles empty contracts array', () => {
    const content = 'fn test() {}';
    const result = mod.scanContractCoverage(content, new Set());
    assert.strictEqual(result.missing.length, 0);
    assert.strictEqual(result.unknown.length, 0);
  });

  test('handles empty file', () => {
    const result = mod.scanContractCoverage('', new Set(['C001']));
    assert.ok(result.missing.includes('C001'));
  });

  test('regex matches multi-digit IDs', () => {
    const content = '// @verifies C010\n// @verifies C100\n// @verifies C999\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['C010', 'C100', 'C999']));
    assert.strictEqual(result.missing.length, 0);
  });

  // PX-326: registry boundary contracts carry the id contract-<boundary_id>. The Gate S
  // scanner must cover it exactly as it covers a C-format edge contract.
  test('PX-326 covers a registry boundary contract id', () => {
    const content = '// @verifies contract-boundary-001\n#[test] fn registry_contract() {}';
    const result = mod.scanContractCoverage(content, new Set(['contract-boundary-001']));
    assert.strictEqual(result.missing.length, 0);
    assert.strictEqual(result.unknown.length, 0);
  });

  test('PX-326 covers @requires and @assert-invariant with a registry id', () => {
    const content = '// @requires contract-boundary-002\n// @assert-invariant contract-boundary-003\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['contract-boundary-002', 'contract-boundary-003']));
    assert.strictEqual(result.missing.length, 0);
  });

  test('PX-326 reports an unknown registry id', () => {
    const content = '// @verifies contract-boundary-999\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['contract-boundary-001']));
    assert.ok(result.missing.includes('contract-boundary-001'));
    assert.ok(result.unknown.some(u => u.id === 'contract-boundary-999'));
  });

  test('PX-326 keeps C-format coverage when a registry id is present', () => {
    const content = '// @verifies C001\n// @verifies contract-boundary-001\nfn test() {}';
    const result = mod.scanContractCoverage(content, new Set(['C001', 'contract-boundary-001']));
    assert.strictEqual(result.missing.length, 0);
  });
}

console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
