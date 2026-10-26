// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
// PX-316 command Markdown contracts: the gate is documented before the source is changed,
// and the downstream preflights name the stale/missing receipt codes.
// @verifies C007
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const GRAPHIFY = readFileSync(path.join(ROOT, '.claude/commands/graphify-rfc.md'), 'utf8');
const BOUNDIFY = readFileSync(path.join(ROOT, '.claude/commands/boundify-graph.md'), 'utf8');
const SPLIT = readFileSync(path.join(ROOT, '.claude/commands/split-to-tickets.md'), 'utf8');

test('C007 graphify runs the smooth verdict gate before heading deduplication', () => {
  const gate = GRAPHIFY.indexOf('verify-smooth-verdict.mjs --package=');
  const dedup = GRAPHIFY.indexOf('deduplicate-headings.js "$1"');
  assert.ok(gate >= 0, 'the verdict gate must be present');
  assert.ok(dedup >= 0, 'heading deduplication must be present');
  assert.ok(gate < dedup, 'the gate must run before the source can change');
  assert.match(GRAPHIFY, /MISSING_SMOOTH_VERDICT/);
  assert.match(GRAPHIFY, /STALE_SMOOTH_VERDICT/);
  assert.match(GRAPHIFY, /SMOOTH_CERTIFICATE_INCOMPLETE/);
  assert.match(GRAPHIFY, /SMOOTH_ARTIFACT_MISMATCH/);
});

test('C007 boundify and split preflights name the missing/stale receipt', () => {
  assert.match(BOUNDIFY, /MISSING_SMOOTH_RECEIPT/);
  assert.match(BOUNDIFY, /STALE_SMOOTH_VERDICT/);
  assert.match(SPLIT, /MISSING_SMOOTH_RECEIPT/);
  assert.match(SPLIT, /STALE_SMOOTH_VERDICT/);
});
