// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEscape,
  validatePositionDisposition,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';

// @verifies C010
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C010 an escape whose cited line orders an act is rejected', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = {
    'spec.md': [
      '',
      'DiscoveryServiceObservationを導入する。',
      'the default mode is observe_only',
    ],
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const escape = {
    subject: 'RecordDiscoveryServiceObservation',
    outcome: 'escaped',
    escapeKind: 'no_act',
    line: 2,
    quote: 'DiscoveryServiceObservationを導入する。',
    why: 'the cited line orders no act for an actor to perform',
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validateEscape({
    escape,
    linesByPath: lines,
    actPatterns: ['導入する', '追記する', '起動し', '確かめる'],
  });
  assert.equal(result.code, 'ESCAPE_ACT_CONFLICT');
});

// @verifies C010
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C010 a genuine object or rule escape is accepted', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const lines = { 'spec.md': ['', 'DiscoveryServiceObservationを導入する。', 'the default mode is observe_only'] };
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const escape = {
    subject: 'AssetScore',
    outcome: 'escaped',
    escapeKind: 'no_act',
    line: 3,
    quote: 'the default mode is observe_only',
    why: 'the cited line states a rule',
  };
  assert.equal(validateEscape({
    escape,
    linesByPath: lines,
    actPatterns: ['導入する'],
  }).ok, true);
});

// @verifies C010
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C010 an active operation with an excluded position and a no-act ground conflicts', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validatePositionDisposition({
    id: 'RecordDiscoveryServiceObservation',
    position: 'excluded',
    disposition: 'active',
    grounding: { classification: 'no_act_stated_by_the_specification' },
  });
  assert.equal(result.code, 'POSITION_DISPOSITION_CONFLICT');
});

// @verifies C010
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C010 a designer-supplied ground resolves the position conflict', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validatePositionDisposition({
    id: 'CreateAuthorityDelegation',
    position: 'suppliedRule',
    disposition: 'active',
    grounding: { classification: 'designer_supplied', note: 'the designer supplies this operation' },
  });
  assert.equal(result.ok, true);
});
