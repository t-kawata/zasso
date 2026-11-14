import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(join(here, '..', 'source/applicability.json'), 'utf8'));

test('the trigger instruction is one-line English and names the skill', () => {
  assert.equal(record.classification, 'specific-case-trigger');
  assert.match(record.instruction, /^[\x20-\x7E]+$/);
  assert.ok(record.instruction.includes(record.skill));
});

test('the trigger instruction is compressed and carries every condition term', () => {
  assert.ok(record.instruction.length <= 240);
  for (const condition of record.conditions) {
    for (const term of condition.terms) {
      assert.ok(record.instruction.toLowerCase().includes(term.toLowerCase()), term);
    }
  }
});

test('the trigger instruction names the gate, the skip exit, and the skip action', () => {
  for (const action of ['applies', 'exit 3', 'skip']) {
    assert.ok(record.instruction.toLowerCase().includes(action), action);
  }
});
