import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../okf-core/index.mjs';

const read = (relativePath) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8'));

test('the coverage ledger counts every loss class', () => {
  const coverage = read('source/coverage.json');
  assert.equal(coverage.schema, 'okf-source-coverage/v1');
  for (const key of ['unmappedHeadings', 'unmappedPreamble', 'unmappedLines']) {
    assert.equal(coverage.counts[key], 0, key);
  }
  const lines = coverage.records.reduce((total, record) => total + record.lines, 0);
  const concepts = coverage.records.reduce((total, record) => total + record.concepts, 0);
  assert.equal(coverage.counts.lines, lines);
  assert.equal(coverage.counts.concepts, concepts);
});

test('every inventory entry and lock concept agree, and every source names one', () => {
  const inventory = read('source/concept-inventory.json');
  const lock = read('atoms.lock.json');
  assert.equal(inventory.schema, 'okf-concept-inventory/v1');
  assert.equal(lock.schema, 'okf-atoms/v2');
  assert.deepEqual(
    inventory.entries.map((entry) => entry.id).sort(),
    lock.concepts.map((entry) => entry.id).sort(),
  );
  for (const entry of inventory.entries) {
    assert.ok(entry.source, entry.id);
    assert.ok(entry.path.endsWith('.md'), entry.id);
  }
});

test('the lock, inventory, and bundle describe the same ids', async () => {
  const bundle = await loadBundle(fileURLToPath(new URL('../okf', import.meta.url)));
  const lock = read('atoms.lock.json');
  assert.equal(bundle.concepts.length, lock.concepts.length);
  for (const record of lock.concepts) {
    assert.ok(bundle.byId.has(record.id), record.id);
  }
});

test('every source is recorded in the input ledger as included', () => {
  const ledger = read('source/input-ledger.json');
  assert.equal(ledger.schema, 'okf-input-ledger/v1');
  const included = ledger.inputs.filter((input) => input.status === 'included');
  assert.equal(included.length, ledger.counts.included);
  assert.ok(included.length > 0);
});
