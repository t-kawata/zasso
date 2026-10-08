// Pin re-derivation (PX-240, contracts C008, C012).
//
// The property under test is the one that keeps the single-input design from becoming
// a self-referential one: a pin recorded in the artifact is not trusted, it is re-read
// from the specification text by the rule the pin declares. An artifact that records a
// wrong predicate line therefore fails its own verification rather than passing
// because it agrees with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveSet, readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { flattenPins, rederiveAll, rederivePin } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const ARTIFACT_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;

const spec = readSpecification(SPEC_PATH);
const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
const pinsOf = (overrides = {}) => ({ ...structuredClone(artifact.pins), ...overrides });

test('C012 every pin in the fixture artifact re-derives and reports the rule it used', () => {
  for (const pin of flattenPins(artifact.pins)) {
    const result = rederivePin(pin, spec.lines);
    assert.equal(result.ok, true, `${pin.kind}: ${result.reason ?? ''}`);
    assert.equal(typeof result.rule, 'string');
    assert.equal(result.rule.length > 0, true);
  }
});

test('C012 a predicate line moved to a line without the limbs is refused by name', () => {
  const pins = pinsOf();
  pins.predicate.line = 1;

  const result = rederiveAll(pins, spec.lines);

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].pin, 'predicate');
  assert.equal(result.failures[0].rule, 'predicate-line-contains-limbs');
  assert.equal(result.failures[0].line, 1);
  assert.equal(spec.lines[0].includes(pins.predicate.limbs[0]), false);
});

test('C012 an enumeration range that omits a member is refused', () => {
  const pins = pinsOf();
  pins.enumerations[0].ranges = [[100, 200]];

  const result = rederiveAll(pins, spec.lines);

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].pin, 'enumerations.OperationStatus');
  assert.match(result.failures[0].reason, /Recovered|Pending/);
});

test('C012 a block partition that overlaps or leaves a gap is refused', () => {
  const overlapping = pinsOf();
  overlapping.blocks[1].firstLine = overlapping.blocks[0].lastLine;
  assert.equal(rederiveAll(overlapping, spec.lines).failures[0].rule, 'block-partition-covers-once');

  const gapped = pinsOf();
  gapped.blocks[1].firstLine += 2;
  assert.equal(rederiveAll(gapped, spec.lines).failures[0].rule, 'block-partition-covers-once');
});

test('C012 a form entry that decides rather than proposes is refused', () => {
  const pins = pinsOf();
  pins.forms[0].proposes = false;

  const result = rederiveAll(pins, spec.lines);

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].rule, 'form-proposes-only');
});

test('C012 establishment reads the line from the text rather than being told it', () => {
  assert.equal(artifact.pins.predicate.line, 10);
  assert.equal(spec.lines[9].includes('acceptance of a signed transfer'), true);
  assert.equal(artifact.pins.rowSchema.line, 14);
  assert.equal(spec.lines[13].includes('contract'), true);
});

test('C008 a listing whose declared total equals the entries present yields the whole set', () => {
  const derived = deriveSet({ declaredTotal: 3, entries: ['a', 'b', 'c'] });

  assert.equal(derived.entries.length, 3);
  assert.equal(derived.truncated, undefined);
});

test('C008 a listing that stopped early is refused and names its truncation marker', () => {
  const derived = deriveSet({ declaredTotal: 74, entries: new Array(40).fill('row'), truncationMarker: 'and 34 more' });

  assert.equal(derived.entries, undefined, 'a partial list is never read as the whole');
  assert.equal(derived.refused, true);
  assert.match(derived.reason, /and 34 more/);
});

test('C008 a listing that declares no total is refused', () => {
  const derived = deriveSet({ entries: ['a'] });

  assert.equal(derived.refused, true);
  assert.match(derived.reason, /declares no total/);
});
