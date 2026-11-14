// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
// @verifies C001
// @verifies C002
// @verifies C003
// C001 precondition: The law CLI is asked for a non-Rule Section, a search result, or a list entry.
// C001 postcondition: Every emitted command starts with node "$LAW" and contains no $OKF substring.
// C001 invariant: No law response names a variable the law SKILL.md does not define.
// C002 precondition: expand is called with --hop N and --from id1.
// C002 postcondition: guidance.hop equals N, backTo names the previous id, and max hop yields state back.
// C002 invariant: state stop if and only if coverage.missing is empty.
// C003 precondition: outgoing, incoming, neighbors, or context --rule is called on a known concept.
// C003 postcondition: The response carries protocol, node, coverage, frontier, and guidance.
// C003 invariant: Every one-hop read exposes the drill-down list and the stop/expand/back decision.
/**
 * PX-429 — the law CLI must hand the AI executable continuation commands.
 *
 * The CLI is the product, not the library. These tests spawn dist/skill.mjs so
 * a stale bundle or a library-only fix fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(process.cwd(), '.claude/skills/rust-interface-law/dist/skill.mjs');
const LAW_PREFIX = 'node "$LAW"';

// [::TICKET::] PX-429, PX-430 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-429|PX-430) --for-spec --no-implementation-order`.
function run(args) {
  return spawnSync(process.execPath, [CLI, ...args, '--format', 'json'], { encoding: 'utf8' });
}

// [::TICKET::] PX-429 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-429 --for-spec --no-implementation-order`.
function parse(args) {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('C001: a Section page emits only $LAW-prefixed continuation commands', () => {
  const page = parse(['show', 'sources/part-iii-6/6-http-rules']);
  assert.ok(page.frontier.length > 0);
  for (const entry of page.frontier) assert.ok(entry.command.startsWith(LAW_PREFIX), entry.command);
  assert.ok(page.guidance.ifBack.startsWith(LAW_PREFIX), page.guidance.ifBack);
  assert.equal(JSON.stringify(page).includes('$OKF'), false);
});

test('C001: search rows are executable as printed', () => {
  const result = parse(['search', '--query', 'authorization']);
  assert.ok(result.rows.length > 0);
  for (const row of result.rows) assert.ok(row.expand_command.startsWith(LAW_PREFIX), row.expand_command);
});

test('C001: an absent id exits 2 with candidates', () => {
  const result = run(['show', 'NOPE-999']);
  assert.equal(result.status, 2);
  assert.match(`${result.stdout}${result.stderr}`, /candidate/i);
});

test('C002: expand reads hop and from, and max hop reaches back', () => {
  const atOne = parse(['expand', '--id', 'rules/c/rest-01', '--hop', '1', '--from', 'rules/c/rest-01']);
  assert.equal(atOne.guidance.hop, 1);
  assert.equal(atOne.backTo, 'rules/c/rest-01');

  const atMax = parse(['expand', '--id', 'rules/c/rest-01', '--hop', '3', '--from', 'rules/c/rest-01']);
  assert.equal(atMax.guidance.state, 'back');
  assert.ok(atMax.guidance.ifBack.startsWith(LAW_PREFIX), atMax.guidance.ifBack);
});

test('C002: an explicit profile selects its facets', () => {
  const review = parse(['show', 'rules/c/rest-01', '--profile', 'law-review']);
  assert.equal(review.coverage.profile, 'law-review');
  assert.deepEqual(review.coverage.requiredFacets, ['requirement', 'verification', 'source']);
});

test('C003: edge commands carry the traversal envelope', () => {
  for (const command of ['outgoing', 'incoming', 'neighbors']) {
    const result = parse([command, '--id', 'rules/c/rest-01']);
    assert.equal(result.protocol, 'okf-traversal/v1', command);
    assert.equal(result.node.id, 'rules/c/rest-01', command);
    assert.ok(Array.isArray(result.frontier), command);
    assert.ok(['stop', 'expand', 'back'].includes(result.guidance.state), command);
  }
});

test('C003: context --rule reports sufficiency and a stop decision', () => {
  const context = parse(['context', '--rule', 'REST-01']);
  assert.equal(context.coverage.sufficient, true);
  assert.deepEqual(context.coverage.missing, []);
  assert.equal(context.guidance.state, 'stop');
  assert.ok(context.frontier.length > 0);
});

test('C003: directory listings carry an executable command', () => {
  const listing = parse(['list', '--path', '/']);
  assert.ok(listing.entries.length > 0);
  for (const entry of listing.entries) {
    assert.equal(typeof entry.command, 'string', entry.path);
    assert.ok(entry.command.startsWith(LAW_PREFIX), entry.command);
  }
});
