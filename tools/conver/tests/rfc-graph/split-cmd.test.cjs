// [::TICKET::] PX-373 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-373 --for-spec --no-implementation-order`.
// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
// The split command is argument-free: the source is the package canonical RFC.md and
// every other fixed artifact is derived by the scripts from the invocation directory.
// @verifies C003
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const COMMAND_PATH = join(__dirname, '../../.claude/commands/split-to-tickets.md');

test('C003 split takes no argument and fixes RFC.md as its only input', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.equal(/^argument-hint:/m.test(content), false, 'the frontmatter must not advertise an argument');
  assert.match(content, /^# \/split-to-tickets$/m, 'the title stays argument-free');
  assert.match(content, /DOC_PATH="RFC\.md"/, 'the source is the canonical RFC');
  assert.match(content, /UNEXPECTED_ARGUMENT/, 'a non-empty argument list is refused');
  assert.match(content, /MISSING_RFC/, 'a missing canonical RFC is a named stop');
  assert.match(content, /MISSING_GRAPH/, 'a missing graph is a named stop');
  assert.match(content, /MISSING_DIRS_TREE/, 'a missing Dirs-Tree is a named stop');
});

test('C003 split passes no fixed canonical path to its scripts', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.equal(/--tickets="\$TICKETS_PATH"/.test(content), false);
  assert.equal(/--status="\$STATUS_PATH"/.test(content), false);
  assert.equal(/--graph="\$GRAPH_PATH"/.test(content), false);
  assert.equal(/--view="\$DOC_DIR\/SEQUENCES\.json"/.test(content), false);
});

test('C003 the gate literals the split preflight names are preserved', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.match(content, /MISSING_SMOOTH_RECEIPT/);
  assert.match(content, /STALE_SMOOTH_VERDICT/);
  assert.match(content, /project-step-contracts\.js --mode=verify/);
});

test('C006 the split command carries the consolidation-first work-budget policy', () => {
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.match(content, /consolidation-first/i);
  assert.match(content, /splitReason/);
  assert.match(content, /minimumWorkTickets|minimumTicketCount/);
  assert.match(content, /--enforce-work-budget/);
  assert.match(content, /MIN_TICKETS_PER_PHASE/);
  assert.match(content, /tdd-order/);
  assert.match(content, /cohesion/);
  assert.match(content, /mergeAttempts/);
  assert.match(content, /acceptedDiscretionaryRefusals/);
  assert.match(content, /budget-forced/);
  assert.match(content, /behaviours/);
  assert.match(content, /unlistedFileReason/);
  assert.match(content, /skipped:no-budget-gate/);
  assert.doesNotMatch(content, /list-phases-and-tickets\.jsnode/);
});

test('C003 the phase name gate and the end-step are two commands', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.doesNotMatch(content, /check-phase-names-summaries\.jsnode/);
  assert.match(content, /check-phase-names-summaries\.js"/);
  assert.match(content, /update-split-step-status\.js" end-step "4-2"/);
});

test('C002 the split command selects evolve mode from the presence of Tickets.json', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.match(content, /## Evolve Mode/);
  assert.match(content, /SPLIT_MODE="evolve"/);
  assert.match(content, /SPLIT_MODE="fresh"/);
  assert.match(content, /split-evolve\.js/);
  assert.match(content, /split-evolve\.js"? --check/);
  assert.match(content, /carry-status/);
  assert.match(content, /identityLost/);
});

test('C003 the split command forbids renumbering and status writes in evolve mode', () => {
  const content = readFileSync(COMMAND_PATH, 'utf8');
  assert.match(content, /never renumber/i);
  assert.match(content, /status.{0,40}never written/i);
  assert.match(content, /consolidate-phase-tickets\.js/);
  assert.match(content, /skipped in evolve mode|evolve mode skips/i);
});
