'use strict';

/**
 * PX-443 follow-up — amend leaves every changed package at the partition minimum.
 *
 * The tickets artifact is owned by /split-to-tickets, which condenses. This
 * command-level postcondition only observes the result: the shared gate is
 * read-only and a refusal routes to the writer instead of merging in place.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMMAND_PATH = path.resolve(__dirname, '../../.claude/commands/amend-rfc-up.md');

test('C014: every changed package passes the shared condensation gate', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');

  assert.match(text, /condense-tickets\.js" --gate --tickets="\$PKG_TICKETS"/);
  assert.match(text, /condensation gate is read-only/i);
  assert.match(text, /CONDENSE_REQUIRED/);
  assert.match(text, /\/condense-tickets/);
});
