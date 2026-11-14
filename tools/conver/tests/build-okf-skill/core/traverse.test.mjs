// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// @verifies C001 C002 C005
// C001 precondition: A loaded bundle containing concept id X
// C001 postcondition: The response contains protocol=okf-traversal/v1, node.id=X, coverage, frontier, and guidance
// C001 invariant: guidance.state=stop implies coverage.missing.length=0
// C002 invariant: state is never stop while missing is non-empty
// C005 invariant: Every expand result increases hop by 1 and preserves the stack for back
/**
 * C001, C002, C005 — the traversal envelope, facet coverage, and guidance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundle, conceptText } from '../lib/fixture-v2.mjs';
import { loadBundle } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { buildTraversal } from '../../../.claude/scripts/amend-rfc-up/okf-core/commands/traverse.mjs';

// [::TICKET::] PX-427, PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-427|PX-428) --for-spec --no-implementation-order`.
function createPoliciedBundle() {
  return createBundle({
    'index.md': '# Law\n\n- [A](./rules/a.md)\n',
    'rules/a.md': conceptText({
      type: 'Rule',
      title: 'A — credentials',
      description: 'Credentials come only from Authorization.',
      'x-applies-to': 'rest',
      'x-verification': 'V3 test.',
      'x-enforcement': 'conformance driver',
      'x-requires': [],
    }, '# A\n\nCredentials come only from Authorization.\n\n[Source section](../sources/s.md)'),
    'rules/b.md': conceptText({ type: 'Rule', title: 'B — sibling', description: 'Sibling rule.' }, '# B\n\nSibling.'),
    'sources/s.md': conceptText({ type: 'Section', title: 'Source section', description: 'Source text.' }, '# Source section\n\nThe section text.'),
  });
}

const LAW_PROFILE = {
  id: 'law-test',
  requiredFacets: ['requirement', 'applies_to', 'verification', 'enforcement', 'source'],
  facetKinds: { source: ['source-section'], requirement: ['source-section'] },
  maxHops: 3,
  actions: [],
};

const WORKSPACE_ROOT = new URL('../../../', import.meta.url).pathname;

test('C001: buildTraversal returns protocol, node, coverage, frontier, and guidance', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const page = buildTraversal({ bundle, id: 'rules/a', profile: LAW_PROFILE });

    assert.equal(page.protocol, 'okf-traversal/v1');
    assert.equal(page.node.id, 'rules/a');
    assert.equal(page.node.type, 'Rule');
    assert.ok(Array.isArray(page.coverage.requiredFacets));
    assert.ok(Array.isArray(page.coverage.present));
    assert.ok(Array.isArray(page.coverage.missing));
    assert.ok(Array.isArray(page.frontier));
    assert.ok(['stop', 'expand', 'back'].includes(page.guidance.state));
  } finally {
    fixture.cleanup();
  }
});

test('C002: a missing source facet drives expand with a runnable frontier command', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const page = buildTraversal({ bundle, id: 'rules/a', profile: LAW_PROFILE, payloadIds: ['rules/a'] });

    assert.ok(page.coverage.missing.includes('source'));
    assert.equal(page.coverage.sufficient, false);
    assert.equal(page.guidance.state, 'expand');
    const target = page.frontier.find((entry) => entry.kind === 'source-section');
    assert.ok(target, 'frontier names the source section');
    assert.equal(page.guidance.mustRun, target.command);
    assert.ok(page.guidance.mustRun.includes('sources/s'));
  } finally {
    fixture.cleanup();
  }
});

test('C001 invariant: stop is impossible while a required facet is missing', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const incomplete = buildTraversal({ bundle, id: 'rules/a', profile: LAW_PROFILE, payloadIds: ['rules/a'] });
    assert.notEqual(incomplete.guidance.state, 'stop');
  } finally {
    fixture.cleanup();
  }
});

test('C002 boundary: stopping requires every required facet in the payload', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const complete = buildTraversal({
      bundle,
      id: 'rules/a',
      profile: LAW_PROFILE,
      payloadIds: ['rules/a', 'sources/s'],
    });
    assert.deepEqual(complete.coverage.missing, []);
    assert.equal(complete.coverage.sufficient, true);
    assert.equal(complete.guidance.state, 'stop');
    assert.equal(complete.guidance.stopWhen, 'now');
  } finally {
    fixture.cleanup();
  }
});

test('C005: a response at maximum hop returns back with a runnable command', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const page = buildTraversal({
      bundle,
      id: 'rules/a',
      profile: LAW_PROFILE,
      payloadIds: ['rules/a'],
      hop: LAW_PROFILE.maxHops,
      stack: ['rules/b'],
    });
    assert.equal(page.guidance.state, 'back');
    assert.equal(page.backTo, 'rules/b');
    assert.ok(page.guidance.ifBack.includes('rules/b'));
  } finally {
    fixture.cleanup();
  }
});

test('C005 invariant: hop one preserves back_to and the frontier is never silent', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const page = buildTraversal({
      bundle,
      id: 'sources/s',
      profile: LAW_PROFILE,
      payloadIds: ['sources/s'],
      hop: 1,
      stack: ['rules/a'],
    });
    assert.equal(page.backTo, 'rules/a');
    assert.ok(page.frontier.length >= 1 || page.guidance.state === 'stop');
  } finally {
    fixture.cleanup();
  }
});

test('C005 boundary: budget exhaustion is explicit and never truncates facets', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const page = buildTraversal({
      bundle,
      id: 'rules/a',
      profile: LAW_PROFILE,
      payloadIds: ['rules/a', 'sources/s'],
      budgetBytes: 1,
    });
    assert.equal(page.coverage.sufficient, false);
    assert.equal(page.coverage.insufficient, true);
    assert.equal(page.guidance.reason, 'BUDGET_INSUFFICIENT');
    assert.equal(page.guidance.state, 'expand');
    assert.ok(page.guidance.mustRun.includes('--budget'));
  } finally {
    fixture.cleanup();
  }
});

test('guidance is deterministic for the same id, profile, and hop', async () => {
  const fixture = createPoliciedBundle();
  try {
    const bundle = await loadBundle(fixture.root);
    const first = buildTraversal({ bundle, id: 'rules/a', profile: LAW_PROFILE });
    const second = buildTraversal({ bundle, id: 'rules/a', profile: LAW_PROFILE });
    assert.deepEqual(first.guidance, second.guidance);
    assert.deepEqual(first.frontier, second.frontier);
  } finally {
    fixture.cleanup();
  }
});

test('the law profiles are loadable from the okf-core profile directory', async () => {
  const { loadProfile } = await import('../../../.claude/scripts/amend-rfc-up/okf-core/profiles/index.mjs');
  const profile = loadProfile('law-implement');
  assert.equal(profile.id, 'law-implement');
  assert.ok(profile.requiredFacets.includes('source'));
  assert.equal(profile.maxHops, 3);
  assert.ok(WORKSPACE_ROOT.length > 0);
});
