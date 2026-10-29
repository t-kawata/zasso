// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
//
// The writers that put a runnable command into a file or into stdout need the same
// invariant as the command documents: the command must work from any working
// directory. A bare `.claude/scripts/...` is correct only when the reader happens to
// stand at the repository root. These examples are read by AIs from nested packages,
// so each one is asserted in its anchored form and rejected in its bare form.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ANCHORED_SCRIPT = /\$\(git rev-parse --show-toplevel\)\/\.claude\/scripts\//;
const BARE_SCRIPT = /(?:^|[\s'"`])\.claude\/scripts\//m;

const { buildMarkdownGuidance: buildResolvingGuidance } = require(
  path.join(ROOT, '.claude/scripts/tickets/create-resolving-ticket.js'),
);
const { buildMarkdownGuidance: buildDeferralGuidance } = require(
  path.join(ROOT, '.claude/scripts/tickets/create-deferral-ticket.js'),
);
const { buildMarkdownGuidance: buildCrimeDeferralGuidance } = require(
  path.join(ROOT, '.claude/scripts/tickets/create-crime-deferral-ticket.js'),
);
const { generateCliExamples } = require(
  path.join(ROOT, '.claude/scripts/rfc-graph/show-graph-summary-markdown.js'),
);
const preflight = require(path.join(ROOT, '.claude/scripts/drill-rfc-down/preflight.cjs'));
const { groundHandoff, describeThroughHandoff } = require(
  path.join(ROOT, '.claude/scripts/regeneration/lib/transaction.mjs'),
);

test('ticket-creation guidance anchors every script command at the git root', () => {
  const writers = [
    buildResolvingGuidance({ key: 'P1-1', sourceKey: 'P1-0' }),
    buildDeferralGuidance({ key: 'P1-1', sourceKey: 'P1-0' }),
    buildCrimeDeferralGuidance({ key: 'P1-1', sourceKey: 'P1-0' }),
  ];
  for (const guidance of writers) {
    assert.match(guidance, ANCHORED_SCRIPT, 'the guidance names the git-root .claude');
    assert.doesNotMatch(guidance, BARE_SCRIPT, 'the guidance must not carry a cwd-relative script');
  }
});

test('the graph-summary CLI examples anchor query.js at the git root', () => {
  const examples = generateCliExamples('/p/P-GRAPH.json', '/p/RFC.md', 'N0001').join('\n');
  assert.match(examples, ANCHORED_SCRIPT, 'the example names the git-root .claude');
  assert.doesNotMatch(examples, BARE_SCRIPT, 'the example must not carry a cwd-relative script');
});

test('the drill preflight binds DRILL_DIR to the git-root .claude', () => {
  assert.equal(
    preflight.DRILL_DIR,
    '$(git rev-parse --show-toplevel)/.claude/scripts/drill-rfc-down',
    'the bound value stays machine-independent and cwd-independent',
  );
});

test('the regeneration handoffs anchor the command document at the git root', () => {
  const handoffs = [
    groundHandoff({ stagingRoot: '/tmp/staging', reason: 'RFC-SEED.md line 12 has no evidence' }),
    groundHandoff({ stagingRoot: '/tmp/staging', reason: 'the obligation has no evidence' }),
    describeThroughHandoff({ exitCode: 1, stderr: 'refused' }, '/tmp/staging/spec.md'),
  ];
  for (const handoff of handoffs) {
    assert.match(
      handoff,
      /\$\(git rev-parse --show-toplevel\)\/\.claude\/commands\/[a-z-]+\.md/,
      'the handoff names the git-root command document',
    );
    assert.doesNotMatch(handoff, /run \.claude\/commands\//, 'the handoff must not carry a cwd-relative document');
  }
});
