// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// @verifies C005
// C005 precondition: The rebuilt bundle with the PX-427 traversal envelope
// C005 postcondition: Every concept is reachable from index.md within two hops and every response has a frontier or an explicit stop
// C005 invariant: No concept is reachable only by raw file read
/**
 * Rebuilt concepts stay reachable through the traversal envelope.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadBundle, buildTraversal } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';

const BUNDLE = join(process.cwd(), '.claude/skills/rust-interface-law/okf');

test('C005: every concept returns a frontier or an explicit stop', async () => {
  const bundle = await loadBundle(BUNDLE);
  const empty = [];
  for (const concept of bundle.concepts) {
    const profile = concept.type === 'Rule' ? 'law-implement' : 'okf-wiki';
    const page = buildTraversal({ bundle, id: concept.id, profile });
    if (page.frontier.length === 0 && page.guidance.state !== 'stop') empty.push(concept.id);
  }
  assert.deepEqual(empty, []);
});

test('C005: a package section is reachable by concept id', async () => {
  const bundle = await loadBundle(BUNDLE);
  const page = buildTraversal({ bundle, id: 'sources/part-iii-6/6-http-rules', profile: 'okf-wiki' });
  assert.equal(page.node.id, 'sources/part-iii-6/6-http-rules');
  assert.ok(page.frontier.length >= 1);
  assert.equal(page.coverage.sufficient, page.coverage.missing.length === 0);
});

test('C005: a rule links to its package section', async () => {
  const bundle = await loadBundle(BUNDLE);
  const rule = bundle.concepts.find((concept) => concept.frontmatter?.['x-rule-id'] === 'REST-01');
  const page = buildTraversal({ bundle, id: rule.id, profile: 'law-implement' });
  assert.ok(page.frontier.some((entry) => entry.kind === 'source-section'));
});

test('C005: a legacy alias resolves to its canonical concept', () => {
  const cli = join(process.cwd(), '.claude/skills/rust-interface-law/dist/skill.mjs');
  const result = spawnSync(process.execPath, [cli, 'show', 'INV-08'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).id, 'rules/c/ops-06');
});
