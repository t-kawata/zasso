// PX-365 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
test('C004 postcondition: README states the enhanced drill role without ticket-id noise', () => {
  assert.match(README, /drill.*数式|数式.*drill/);
  assert.match(README, /Tickets\.json/);
  assert.match(README, /FRESH \/ MIGRATION \/ REPAIR \/ VERIFY_ONLY/);
  assert.match(README, /COMPLETE/);
  assert.match(README, /BLOCKED_PREREQUISITE/);
  assert.match(README, /REPAIR_NO_PROGRESS/);
  assert.match(README, /S8/);
  const start = README.indexOf('drill の役割は');
  const paragraph = README.slice(start, README.indexOf('\n\n', start));
  assert.equal(/PX-[0-9]+/.test(paragraph), false);
});
