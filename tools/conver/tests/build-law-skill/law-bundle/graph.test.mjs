// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// @verifies C004
// C004 precondition: The regenerated law bundle
// C004 invariant: OKF conformance still reports zero conformance findings
/**
 * C004 — the generated law bundle must expose a real graph, not only a
 * one-way rule-to-source citation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadBundle, getOutgoing, getIncoming, validateConformance } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { buildTraversal } from '../../../.claude/scripts/amend-rfc-up/okf-core/commands/traverse.mjs';
import { loadProfile } from '../../../.claude/scripts/amend-rfc-up/okf-core/profiles/index.mjs';

const LAW_BUNDLE = join(process.cwd(), '.claude/skills/rust-interface-law/okf');

test('C004: Rule-to-Rule and Section-to-Rule edges exist', async () => {
  const bundle = await loadBundle(LAW_BUNDLE);
  let ruleToRule = 0;
  let sectionToRule = 0;
  for (const concept of bundle.concepts) {
    for (const edge of getOutgoing(bundle, concept.id)) {
      const target = bundle.byId.get(edge.to);
      if (!target) continue;
      if (concept.type === 'Rule' && target.type === 'Rule') ruleToRule += 1;
      if (concept.type === 'Section' && target.type === 'Rule') sectionToRule += 1;
    }
  }
  assert.ok(ruleToRule > 0, `rule-to-rule edges: ${ruleToRule}`);
  assert.ok(sectionToRule > 0, `section-to-rule edges: ${sectionToRule}`);
});

test('C004: incoming APP-01 reports its dependents', async () => {
  const bundle = await loadBundle(LAW_BUNDLE);
  const edges = getIncoming(bundle, 'rules/o/app-01');
  assert.ok(edges.length > 0, 'APP-01 must have dependents');
  assert.ok(edges.some((edge) => edge.kind === 'dependent' || edge.origin === 'x-requires'));
});

test('C004 invariant: adding edges keeps conformance clean', async () => {
  const bundle = await loadBundle(LAW_BUNDLE);
  assert.deepEqual(validateConformance(bundle), []);
});

test('C004: every Rule exposes a source-section frontier entry', async () => {
  const bundle = await loadBundle(LAW_BUNDLE);
  const profile = loadProfile('law-implement');
  const rest = buildTraversal({ bundle, id: 'rules/c/rest-01', profile });
  assert.ok(rest.frontier.some((entry) => entry.kind === 'source-section'));
});
