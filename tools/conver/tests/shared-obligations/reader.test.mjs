import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attackReaderForGeneration,
  readerForGeneration,
} from '../../.claude/scripts/shared-obligations/reader.mjs';
import {
  buildWorklist,
  validateAttackRecord,
  validateJudgmentRecord,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';

const obligation = {
  id: 'JUDGE:TRANSLATION:bd-1',
  class: 'semantic',
  state: 'open',
  kind: 'judgment',
  subject: 'bd-1',
  claim: 'translation holds',
};

// [::TICKET::] PX-292, PX-293 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function item() {
  return buildWorklist([obligation], {}, {
    reader: readerForGeneration({ generation: 7 }),
    attackReader: attackReaderForGeneration({ generation: 7 }),
  })[0];
}

// @verifies C006
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('the reader and attack reader are derived from the generation', () => {
  assert.equal(readerForGeneration({ generation: 7 }), 'educe-sequences/generation-7');
  assert.equal(attackReaderForGeneration({ generation: 7 }), 'educe-sequences/generation-7/attack');
  assert.equal(readerForGeneration({ generation: 7 }, 'smooth-sequences'), 'smooth-sequences/generation-7');
});

// @verifies C006
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a judgment written by a ticket-key reader is rejected', () => {
  const worklistItem = item();
  const record = {
    schemaVersion: 2,
    obligationId: worklistItem.obligationId,
    contextDigest: worklistItem.contextDigest,
    worklistDigest: worklistItem.worklistDigest,
    artifactDigest: null,
    verdict: 'consistent',
    basis: [{ source: 'contract_registry', boundaryId: 'bd-1', field: 'translation', value: 'x' }],
    reader: 'remediation/PX-290',
  };
  const result = validateJudgmentRecord(record, worklistItem, { linesByPath: {} });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'READER_MISMATCH');
});

// @verifies C006
// [::TICKET::] PX-292 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('an attack written by the wrong reader is rejected', () => {
  const worklistItem = item();
  const record = { reader: worklistItem.reader };
  const attack = {
    obligationId: worklistItem.obligationId,
    contextDigest: worklistItem.contextDigest,
    worklistDigest: worklistItem.worklistDigest,
    outcome: 'held',
    reader: 'someone-else/generation-7',
    searched: { source: 'spec', path: 'spec.md', from: 1, to: 2, quote: 'the clause' },
  };
  const result = validateAttackRecord(attack, record, worklistItem);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'READER_MISMATCH');
});
