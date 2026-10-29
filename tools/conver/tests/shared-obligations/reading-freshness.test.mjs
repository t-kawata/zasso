// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveReadingsObligations,
  validateReadingCitation,
} from '../../.claude/scripts/shared-obligations/predicates.mjs';

// @verifies C011
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C011 a reading quote must occur on the cited line', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const linesByPath = { 'spec.md': ['', 'the clause'] };
  assert.equal(validateReadingCitation({
    subject: 's', lens: 'omission', path: 'spec.md', line: 2, quote: 'the clause',
  }, linesByPath).ok, true);

  assert.equal(validateReadingCitation({
    subject: 's', lens: 'omission', path: 'spec.md', line: 2, quote: 'other',
  }, linesByPath).code, 'READING_QUOTE_NOT_FOUND');
});

// @verifies C011
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C011 an inherited reading is not held under the blocking policy', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const obligations = [{
    id: 'READ:INQUEST:s:omission',
    subject: 's:omission',
    class: 'semantic',
    state: 'open',
    kind: 'reading',
  }];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const resolved = resolveReadingsObligations(obligations, {
    readings: {
      inquest: [{
        subject: 's',
        lens: 'omission',
        answer: 'No',
        path: 'spec.md',
        line: 2,
        quote: 'the clause',
        inheritedFrom: 'generation-11',
        artifactDigest: 'a',
      }],
    },
    artifactDigest: 'a',
    linesByPath: { 'spec.md': ['', 'the clause'] },
    inheritedPolicy: 'block',
  });
  assert.equal(resolved[0].state, 'open');
  assert.equal(resolved[0].reason, 'INHERITED_READING');
});

// @verifies C011
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C011 a fresh reading whose quote is on the line closes', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const obligations = [{
    id: 'READ:INQUEST:s:omission',
    subject: 's:omission',
    class: 'semantic',
    state: 'open',
    kind: 'reading',
  }];
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const resolved = resolveReadingsObligations(obligations, {
    readings: {
      inquest: [{
        subject: 's',
        lens: 'omission',
        answer: 'No',
        path: 'spec.md',
        line: 2,
        quote: 'the clause',
        artifactDigest: 'a',
      }],
    },
    artifactDigest: 'a',
    linesByPath: { 'spec.md': ['', 'the clause'] },
    inheritedPolicy: 'block',
  });
  assert.equal(resolved[0].state, 'closed');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
const generationObligation = {
  id: 'READ:INQUEST:s:omission',
  subject: 's:omission',
  class: 'semantic',
  state: 'open',
  kind: 'reading',
};
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
const generationRow = {
  subject: 's',
  lens: 'omission',
  answer: 'No',
  path: 'spec.md',
  line: 2,
  quote: 'the clause',
  artifactDigest: 'a',
  readerGeneration: 47,
  readAt: '2026-10-23T01:00:00.000Z',
};

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('C004 a reading from an older generation is not held', () => {
  const [resolved] = resolveReadingsObligations([generationObligation], {
    readings: { inquest: [{ ...generationRow, readerGeneration: 46 }] },
    artifactDigest: 'a',
    linesByPath: { 'spec.md': ['', 'the clause'] },
    inheritedPolicy: 'block',
    generation: 47,
    generationStartedAt: '2026-10-23T00:00:00.000Z',
  });
  assert.equal(resolved.state, 'open');
  assert.equal(resolved.reason, 'READER_GENERATION_STALE');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('C004 a reading older than the generation start is not held', () => {
  const [resolved] = resolveReadingsObligations([generationObligation], {
    readings: { inquest: [{ ...generationRow, readAt: '2026-10-01T00:00:00.000Z' }] },
    artifactDigest: 'a',
    linesByPath: { 'spec.md': ['', 'the clause'] },
    inheritedPolicy: 'block',
    generation: 47,
    generationStartedAt: '2026-10-23T00:00:00.000Z',
  });
  assert.equal(resolved.state, 'open');
  assert.equal(resolved.reason, 'READING_NOT_REREAD');
});

// @verifies C004
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
test('C004 a current-generation reading after the generation start is held', () => {
  const [resolved] = resolveReadingsObligations([generationObligation], {
    readings: { inquest: [generationRow] },
    artifactDigest: 'a',
    linesByPath: { 'spec.md': ['', 'the clause'] },
    inheritedPolicy: 'block',
    generation: 47,
    generationStartedAt: '2026-10-23T00:00:00.000Z',
  });
  assert.equal(resolved.state, 'closed');
});
