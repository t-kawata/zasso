import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReadingsObligations } from '../../.claude/scripts/shared-obligations/predicates.mjs';

const OBLIGATION = Object.freeze({
  id: 'READ:INQUEST:s1:omission',
  class: 'semantic',
  state: 'open',
  subject: 's1:omission',
  required: true,
});

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function row(overrides = {}) {
  return {
    subject: 's1',
    lens: 'omission',
    question: 'is a required act absent from this subject',
    answer: 'No',
    line: 2,
    quote: 'the act is present',
    reader: 'educe-sequences/generation-1',
    artifactDigest: 'art-1',
    ...overrides,
  };
}

// [::TICKET::] PX-292, PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-292|PX-293) --for-spec --no-implementation-order`.
function resolve(rows, artifactDigest = 'art-1') {
  return resolveReadingsObligations([OBLIGATION], {
    readings: { inquest: rows },
    artifactDigest,
  })[0];
}

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a Yes answer is a finding until the same generation records a fixed resolution', () => {
  const open = resolve([row({ answer: 'Yes' })]);
  assert.equal(open.state, 'open');
  assert.equal(open.reason, 'FINDING_OPEN');

  const fixed = resolve([row({
    answer: 'Yes',
    resolution: {
      kind: 'artifact-change',
      artifactDigest: 'art-1',
      evidence: { source: 'spec', path: 'spec.md', line: 2, quote: 'the act is present' },
    },
  })]);
  assert.equal(fixed.state, 'closed');
  assert.equal(fixed.reason, 'FINDING_FIXED');
});

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a Yes with a resolution from another artifact generation stays open', () => {
  const result = resolve([row({
    answer: 'Yes',
    resolution: {
      kind: 'artifact-change',
      artifactDigest: 'art-0',
      evidence: { source: 'spec', path: 'spec.md', line: 2, quote: 'the act is present' },
    },
  })]);
  assert.equal(result.state, 'open');
  assert.equal(result.reason, 'FINDING_OPEN');
});

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a stale or legacy row never answers the current artifact', () => {
  const stale = resolve([row({ artifactDigest: 'art-0' })]);
  assert.equal(stale.state, 'open');
  assert.equal(stale.reason, 'STALE_EVIDENCE');
  const legacy = resolve([row({ artifactDigest: undefined })]);
  assert.equal(legacy.state, 'open');
  assert.equal(legacy.reason, 'LEGACY_RECORD');
});

// @verifies C001
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
test('a No answer closes only with a citation and a known answer vocabulary', () => {
  const cited = resolve([row()]);
  assert.equal(cited.state, 'closed');
  const uncited = resolve([row({ line: 0, quote: '' })]);
  assert.equal(uncited.state, 'open');
  assert.equal(uncited.reason, 'MISSING_BASIS');
  const unknown = resolve([row({ answer: 'Maybe' })]);
  assert.equal(unknown.state, 'open');
  assert.equal(unknown.reason, 'UNKNOWN_ANSWER');
});
