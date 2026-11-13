import test from 'node:test';
import assert from 'node:assert/strict';
import { runRegisteredScan, detectorIds } from '../scripts/lib/implementation-scan.mjs';

test('detector registry exposes the implementation detectors', () => {
  assert.ok(detectorIds().includes('scan/forbidden-dependency'));
  assert.ok(detectorIds().includes('scan/unbounded-channel'));
});

test('C003 a detector with findings fails instead of passing', () => {
  const result = runRegisteredScan('scan/forbidden-dependency', {
    text: 'actix-web = "=4.0.0"',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.findings[0].kind, 'forbidden-dependency');
});

test('a clean source passes every detector', () => {
  const result = runRegisteredScan('scan/unbounded-channel', {
    text: 'let (tx, rx) = tokio::sync::mpsc::channel(64);',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.findings, []);
});
