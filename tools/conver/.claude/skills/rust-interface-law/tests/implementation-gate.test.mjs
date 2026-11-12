import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImplementationReport, checkLawIdentity } from '../scripts/lib/implementation-gate.mjs';

const manifest = {
  nodes: [
    { id: 'IMP-01', delivery: 'must', phase: 'adapter' },
    { id: 'IMP-09', delivery: 'must', phase: 'conformance' },
  ],
};

test('C003 report statuses merge by rule and missing rules become not_run', () => {
  const report = {
    statuses: [{ rule: 'IMP-01', status: 'machine_verified', evidence: { ok: true } }],
  };
  const merged = mergeImplementationReport({ manifest, report });
  assert.equal(merged.statuses.find((entry) => entry.rule === 'IMP-01').status, 'machine_verified');
  assert.equal(merged.statuses.find((entry) => entry.rule === 'IMP-09').status, 'not_run');
  assert.equal(merged.ok, false);
});

test('C003 a missing report makes every implementation rule not_run', () => {
  const merged = mergeImplementationReport({ manifest, report: null });
  assert.equal(merged.statuses.every((entry) => entry.status === 'not_run'), true);
  assert.equal(merged.ok, false);
});

test('C004 law identity mismatch fails and a scoped exception passes', () => {
  const mismatch = checkLawIdentity({
    manifest: { spec_version: '0.4.0', dist_sha256: 'a', policy_sha256: 'b' },
    installed: { spec_version: '0.4.0', dist_sha256: 'x', policy_sha256: 'b' },
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.findings[0].kind, /dist_sha256/);

  const excused = checkLawIdentity({
    manifest: { spec_version: '0.4.0', dist_sha256: 'a', policy_sha256: 'b' },
    installed: { spec_version: '0.4.0', dist_sha256: 'x', policy_sha256: 'b' },
    exception: { scope: 'local', expires: '2099-12-31', approval_ref: 'A-1' },
  });
  assert.equal(excused.ok, true);
});
