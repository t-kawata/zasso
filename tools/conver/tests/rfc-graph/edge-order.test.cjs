// [::TICKET::] PX-358 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-358 --for-spec --no-implementation-order`.
// PX-343 @verifies C001
// The split pipeline decides phase order and ticket prerequisites from graph edges.
// This test pins the single shared rule every consumer must read instead of keeping a
// private weight table.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  directionOf,
  effectiveStrength,
  weightOf,
  isHardEdge,
  typeDefaultWeight,
  providerConsumerEdge,
} = require('../../.claude/scripts/rfc-graph/lib/edge-order.js');

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-343 --for-spec --no-implementation-order`.
describe('directionOf', () => {
  it('treats depends_on and implements as provider-is-to', () => {
    assert.equal(directionOf({ type: 'depends_on' }), 'provider-is-to');
    assert.equal(directionOf({ type: 'implements' }), 'provider-is-to');
  });

  it('treats precedes, triggers and constrains as provider-is-from', () => {
    assert.equal(directionOf({ type: 'precedes' }), 'provider-is-from');
    assert.equal(directionOf({ type: 'triggers' }), 'provider-is-from');
    assert.equal(directionOf({ type: 'constrains' }), 'provider-is-from');
  });

  it('returns null for a non-ordering edge', () => {
    assert.equal(directionOf({ type: 'references' }), null);
    assert.equal(directionOf({ type: 'unknown_type' }), null);
  });
});

describe('effectiveStrength', () => {
  it('uses the type default when attributes.strength is absent', () => {
    assert.equal(effectiveStrength({ type: 'depends_on' }), 'hard');
    assert.equal(effectiveStrength({ type: 'constrains' }), 'hard');
    assert.equal(effectiveStrength({ type: 'precedes' }), 'soft');
    assert.equal(effectiveStrength({ type: 'references' }), 'none');
  });

  it('prefers an explicit attributes.strength', () => {
    assert.equal(effectiveStrength({ type: 'depends_on', attributes: { strength: 'soft' } }), 'soft');
    assert.equal(effectiveStrength({ type: 'precedes', attributes: { strength: 'hard' } }), 'hard');
  });

  it('accepts a bare type string for backward compatibility', () => {
    assert.equal(effectiveStrength('constrains'), 'hard');
    assert.equal(effectiveStrength('precedes'), 'soft');
  });
});

describe('weightOf', () => {
  it('returns Infinity for a hard edge', () => {
    assert.equal(weightOf({ type: 'depends_on' }), Infinity);
    assert.equal(weightOf({ type: 'constrains' }), Infinity);
    assert.equal(weightOf({ type: 'precedes', attributes: { strength: 'hard' } }), Infinity);
  });

  it('returns the soft cost for a soft edge', () => {
    assert.equal(weightOf({ type: 'precedes' }), 2);
    assert.equal(weightOf({ type: 'triggers' }), 1);
    assert.equal(weightOf({ type: 'depends_on', attributes: { strength: 'soft' } }), 2);
  });

  it('returns zero for a non-ordering edge', () => {
    assert.equal(weightOf({ type: 'references' }), 0);
  });

  it('never orders a non-ordering type even when strength is hard', () => {
    const references = { type: 'references', attributes: { strength: 'hard' } };
    assert.equal(directionOf(references), null);
    assert.equal(weightOf(references), 0);
    assert.equal(isHardEdge(references), false);
  });

  it('isHardEdge agrees with weightOf', () => {
    assert.equal(isHardEdge({ type: 'constrains' }), true);
    assert.equal(isHardEdge({ type: 'precedes' }), false);
    assert.equal(isHardEdge({ type: 'precedes', attributes: { strength: 'hard' } }), true);
  });

  it('typeDefaultWeight keeps the string API for existing callers', () => {
    assert.equal(typeDefaultWeight('depends_on'), Infinity);
    assert.equal(typeDefaultWeight('constrains'), Infinity);
    assert.equal(typeDefaultWeight('precedes'), 2);
    assert.equal(typeDefaultWeight('triggers'), 1);
    assert.equal(typeDefaultWeight('references'), 0);
  });
});

// PX-358 @verifies C001
// The edge's from/to are the orientation the author wrote. The implementation order
// has one representation, provider first, and every order reader must share it.
describe('providerConsumerEdge', () => {
  it('projects depends_on to provider-first and keeps every other field', () => {
    const edge = { from: 'A', to: 'B', type: 'depends_on', attributes: { strength: 'soft' } };
    assert.deepEqual(providerConsumerEdge(edge), {
      from: 'B',
      to: 'A',
      type: 'depends_on',
      attributes: { strength: 'soft' },
    });
  });

  it('projects constrains to provider-first', () => {
    assert.deepEqual(
      providerConsumerEdge({ from: 'B', to: 'A', type: 'constrains' }),
      { from: 'B', to: 'A', type: 'constrains' },
    );
  });

  it('returns null for a directionless edge', () => {
    assert.equal(providerConsumerEdge({ from: 'E', to: 'F', type: 'references' }), null);
  });

  it('does not mutate the input and returns a distinct object', () => {
    const edge = { from: 'A', to: 'B', type: 'depends_on' };
    const projected = providerConsumerEdge(edge);
    assert.notStrictEqual(projected, edge);
    assert.deepEqual(edge, { from: 'A', to: 'B', type: 'depends_on' });
    assert.deepEqual(providerConsumerEdge(edge), projected);
  });
});
