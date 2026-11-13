import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectivePolicy, phaseForRuleId } from '../scripts/lib/implementation-policy.mjs';

const baseline = {
  spec_version: '0.4.0',
  interfaces: {
    rest: { crate: 'axum', version: '=0.8.9', features: ['json'], default_features: false },
    mcp: { crate: 'rmcp', version: '=0.8.5', features: ['server'], default_features: false },
  },
};

test('C001 effective policy accepts a compatible project pin', () => {
  const effective = resolveEffectivePolicy({
    baseline,
    project: { interfaces: { rest: { version: '0.8.9' } } },
  });
  assert.equal(effective.ok, true);
  assert.equal(effective.rest.version, '0.8.9');
  assert.deepEqual(effective.rest.features, ['json']);
  assert.match(effective.policy_sha256, /^[0-9a-f]{64}$/);
});

test('C001 effective policy rejects an incompatible project pin', () => {
  const result = resolveEffectivePolicy({
    baseline,
    project: { interfaces: { rest: { version: '0.9.0' } } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].kind, 'policy-conflict');
  assert.equal(result.effective, null);
});

test('IMP rules are adapter-phase must nodes and interface rules stay adapter-phase', () => {
  assert.equal(phaseForRuleId('IMP-01'), 'adapter');
  assert.equal(phaseForRuleId('IMP-09'), 'conformance');
  assert.equal(phaseForRuleId('REST-19'), 'adapter');
  assert.equal(phaseForRuleId('CONF-66'), 'conformance');
});
