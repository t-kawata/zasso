// @verifies C004
//
// /grill-me-for-rfc and /drill-rfc-down each carry their own settle-run.js, and the
// files are byte-identical today. Their header claims the two copies cannot drift,
// but nothing enforced that claim: a fix applied to one copy only would leave half
// the commands broken while every test stayed green. The claim is made checkable
// here, so it is a fact the suite verifies rather than a sentence a reader trusts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { DRILL_SETTLE_RUN, GRILL_SETTLE_RUN } from '../helpers/fixture-workspace.mjs';

/** The content digest of a file, which is equal exactly when the bytes are. */
// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
function digestOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('C004 invariant: the two settle-run copies are byte-identical', () => {
  assert.equal(
    digestOf(GRILL_SETTLE_RUN),
    digestOf(DRILL_SETTLE_RUN),
    'the shared driver has one behaviour, so a change to one copy must reach the other',
  );
});
