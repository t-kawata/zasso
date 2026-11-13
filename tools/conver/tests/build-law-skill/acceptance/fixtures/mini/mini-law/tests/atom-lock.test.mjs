import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync(new URL('../atoms.lock.json', import.meta.url)));
const coverage = JSON.parse(readFileSync(new URL('../coverage.json', import.meta.url)));
test('lock has one rule and a full partition', () => {
  assert.equal(lock.atoms.filter((atom) => atom.type === 'Rule').length, 1);
  assert.equal(coverage.gaps.length, 0);
  assert.equal(coverage.overlaps.length, 0);
  for (const file of coverage.files) assert.equal(file.attributed, file.lines);
});
