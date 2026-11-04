// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The recorded identities the grill compares before it writes.
 *
 * The seed, the INFO document and the sequences artifact each record the specification
 * differently. Reading all three into one shape is what lets a mismatch name the record
 * that disagrees instead of reporting a generic failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseInfoSpecification,
  parseSeedIdentity,
  parseSequencesSpec,
} from '../../.claude/scripts/spec-formula/index.mjs';

const SPEC_SHA = 'd'.repeat(64);

const SEED_TEXT = [
  '# RFC Seed: alpha',
  '',
  '## 1. Identity and Position in the Whole System',
  '',
  '```json',
  JSON.stringify({
    package: { id: 'pkg-0001', name: 'alpha' },
    source_spec: { path: 'specs/Gaia.md', sha256: SPEC_SHA },
    source_segments: ['seg-1', 'seg-2'],
    stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'e'.repeat(64) },
  }, null, 2),
  '```',
].join('\n');

const INFO_TEXT = [
  '## 1. What this document verified',
  '',
  `- specification: \`specs/Gaia.md\` (sha256 \`${SPEC_SHA}\`)`,
].join('\n');

test('C001 precondition: the seed identity block is read from its fenced JSON', () => {
  const identity = parseSeedIdentity(SEED_TEXT);

  assert.equal(identity.packageId, 'pkg-0001');
  assert.equal(identity.sourceSpec.path, 'specs/Gaia.md');
  assert.equal(identity.sourceSpec.sha256, SPEC_SHA);
  assert.deepEqual(identity.sourceSegments, ['seg-1', 'seg-2']);
});

test('C001 error: a seed with no identity block names the missing record', () => {
  assert.throws(
    () => parseSeedIdentity('# RFC Seed\n\nNo block.'),
    (error) => error.code === 'SEED_IDENTITY_MISSING',
  );
});

test('C001 precondition: the INFO document hash line is read', () => {
  const recorded = parseInfoSpecification(INFO_TEXT);

  assert.equal(recorded.path, 'specs/Gaia.md');
  assert.equal(recorded.sha256, SPEC_SHA);
});

test('C001 error: an INFO document without the verification line records nothing', () => {
  assert.equal(parseInfoSpecification('## 1. What this document verified\n\nNone.\n'), null);
});

test('C001 precondition: the sequences artifact identity is read', () => {
  const recorded = parseSequencesSpec({ spec: { path: 'Gaia.md', sha256: SPEC_SHA, lines: 42 } });

  assert.deepEqual(recorded, { path: 'Gaia.md', sha256: SPEC_SHA, lines: 42 });
});

test('C001 boundary: an artifact without a spec record is refused by name', () => {
  assert.throws(
    () => parseSequencesSpec({ spec: { path: 'Gaia.md' } }),
    (error) => error.code === 'SEQUENCES_SPEC_INCOMPLETE',
  );
});
