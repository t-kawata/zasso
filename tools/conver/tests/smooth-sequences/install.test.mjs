import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('the command and scripts live inside the installed .claude tree', () => {
  assert.ok(existsSync('.claude/commands/smooth-sequences.md'));
  assert.ok(existsSync('.claude/scripts/smooth-sequences/run.mjs'));
  assert.ok(existsSync('.claude/scripts/smooth-sequences/lib/workspace.mjs'));
});

test('the installer does not exclude the new command or scripts', () => {
  const source = readFileSync('install.js', 'utf8');
  assert.ok(!source.includes('smooth-sequences'));
});
