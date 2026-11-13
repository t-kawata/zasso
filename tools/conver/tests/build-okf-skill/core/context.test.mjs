// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * C007 — x-requires closure is complete or stops with BUDGET_EXCEEDED.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { resolveRequired } from '../../../.claude/scripts/amend-rfc-up/okf-core/context/resolve-required.mjs';
import { buildContext } from '../../../.claude/scripts/amend-rfc-up/okf-core/context/assemble.mjs';
import { createRequiresBundle } from '../lib/fixture-v2.mjs';

test('C007: closure returns every required concept in deterministic order', async () => {
  const fixture = createRequiresBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const set = resolveRequired({ bundle, entryIds: ['A'] });
    assert.deepEqual(set.required, ['A', 'B', 'C', 'D']);
    assert.deepEqual(set.cycles, []);
  } finally {
    fixture.cleanup();
  }
});

test('C007: a cycle is reported once and terminates', async () => {
  const fixture = createRequiresBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const set = resolveRequired({ bundle, entryIds: ['E'] });
    assert.deepEqual(set.required, ['E', 'F']);
    assert.equal(set.cycles.length, 1);
  } finally {
    fixture.cleanup();
  }
});

test('C007: an over-budget context throws BUDGET_EXCEEDED, never truncates', async () => {
  const fixture = createRequiresBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const set = resolveRequired({ bundle, entryIds: ['A'] });
    assert.throws(
      () => buildContext({ bundle, requiredSet: set, budgetBytes: 1 }),
      (error) => error.code === 'BUDGET_EXCEEDED' && error.limit === 1 && error.actual > 1,
    );
  } finally {
    fixture.cleanup();
  }
});

test('C007: an unresolved requirement is a named finding, not a silent drop', async () => {
  const fixture = createRequiresBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const set = resolveRequired({ bundle, entryIds: ['A'], additionalRequires: { A: ['MISSING'] } });
    assert.ok(set.findings.some((finding) => finding.code === 'REQUIREMENT_MISSING'));
  } finally {
    fixture.cleanup();
  }
});
