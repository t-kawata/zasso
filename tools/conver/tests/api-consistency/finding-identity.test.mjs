// PX-372 @verifies C004
// A baseline compares findings across two runs. That comparison is only meaningful
// when one finding keeps one identity and the digest does not depend on array order.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { digestOfFindings, findingIdentity } from '../../.claude/scripts/api-consistency/finding-identity.mjs';

// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function finding(overrides = {}) {
  return {
    code: 'SYMBOL_UNDEFINED',
    symbol: 'OperationCatalogue',
    package: 'pkg-0002',
    cause: 'pkg-0002 references OperationCatalogue, which no package declares',
    ...overrides,
  };
}

test('C004: one finding keeps one identity across runs', () => {
  assert.match(findingIdentity(finding()), /^[0-9a-f]{16}$/);
  assert.equal(findingIdentity(finding()), findingIdentity(finding()));
});

test('C004: a different code, symbol, package or cause changes the identity', () => {
  const base = findingIdentity(finding());
  assert.notEqual(base, findingIdentity(finding({ code: 'ARITY_MISMATCH' })));
  assert.notEqual(base, findingIdentity(finding({ symbol: 'Other' })));
  assert.notEqual(base, findingIdentity(finding({ package: 'pkg-0003' })));
  assert.notEqual(base, findingIdentity(finding({ cause: 'another cause' })));
});

test('C004: the baseline digest is independent of finding order', () => {
  const first = { ...finding(), id: findingIdentity(finding()) };
  const second = { ...finding({ symbol: 'Other' }), id: findingIdentity(finding({ symbol: 'Other' })) };

  assert.equal(digestOfFindings([first, second]), digestOfFindings([second, first]));
  assert.notEqual(digestOfFindings([first]), digestOfFindings([first, second]));
});
