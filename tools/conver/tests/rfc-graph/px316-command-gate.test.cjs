// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
// [::TICKET::] PX-316 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-316 --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-332 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-332 --for-spec --no-implementation-order`.
  const gate = GRAPHIFY.indexOf('verify-smooth-verdict.mjs" --package=');
  const dedup = GRAPHIFY.indexOf('deduplicate-headings.js" "$sourcePath"');
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

// [::TICKET::] PX-317 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-317 --for-spec --no-implementation-order`.
test('PX-317 graphify names the artifact denominator and view-digest receipt', () => {
  assert.match(GRAPHIFY, /MISSING_OPERATION/);
  assert.match(GRAPHIFY, /MISSING_SEQUENCE/);
  assert.match(GRAPHIFY, /STEP_IDENTITY_MISMATCH/);
  assert.match(GRAPHIFY, /OWNER_ROLE_UNDECLARED/);
  assert.match(GRAPHIFY, /viewDigests/);
});

test('PX-317 boundify and split name the artifact denominator codes', () => {
  assert.match(BOUNDIFY, /MISSING_OPERATION/);
  assert.match(SPLIT, /MISSING_SEQUENCE/);
  assert.match(SPLIT, /STEP_IDENTITY_MISMATCH/);
});
