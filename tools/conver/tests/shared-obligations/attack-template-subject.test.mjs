// PX-306 @verifies C001
// A template whose only variation is the subject id is the same sentence attacking every
// claim. The signature strips the subject and the id-shaped tokens so the degeneracy is
// visible, while a genuinely different searched claim keeps a different signature.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  templateSignature,
  validateAttackTemplate,
} from '../../.claude/scripts/shared-obligations/attack-template.mjs';

test('C001 the subject id does not make a template unique', () => {
  const first = 'searched JUDGE:ENTAILMENT:boundary-005 for a contradiction; none found.';
  const second = 'searched JUDGE:ENTAILMENT:boundary-006 for a contradiction; none found.';
  assert.equal(
    templateSignature(first, 'JUDGE:ENTAILMENT:boundary-005'),
    templateSignature(second, 'JUDGE:ENTAILMENT:boundary-006'),
  );
});

test('C001 an operation and boundary id are stripped as subject tokens', () => {
  const first = 'searched op-ProduceFact across boundary-005 for a contradiction; none found.';
  const second = 'searched op-ConsumeFact across boundary-006 for a contradiction; none found.';
  assert.equal(
    templateSignature(first, 'op-ProduceFact'),
    templateSignature(second, 'op-ConsumeFact'),
  );
});

test('C001 a different searched claim keeps a different signature', () => {
  const sameClaim = 'searched the boundary for a contradiction on line 14147; none found.';
  const otherClaim = 'searched the boundary for a contradiction on line 15100; none found.';
  assert.notEqual(
    templateSignature(sameClaim, 'boundary-005'),
    templateSignature(otherClaim, 'boundary-005'),
  );
});

test('C001 validateAttackTemplate rejects a reused subject-stripped signature', () => {
  const signature = templateSignature('searched JUDGE:ENTAILMENT:boundary-005 for a contradiction; none found.', 'JUDGE:ENTAILMENT:boundary-005');
  const result = validateAttackTemplate({
    attack: 'searched JUDGE:ENTAILMENT:boundary-006 for a contradiction; none found.',
    subject: 'JUDGE:ENTAILMENT:boundary-006',
    seen: new Map([[signature, 3]]),
    threshold: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ATTACK_TEMPLATE_REUSED');
});
