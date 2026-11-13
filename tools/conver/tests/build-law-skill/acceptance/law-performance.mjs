/**
 * Performance measurements for the law bundle and the synthetic 2,500-concept
 * bundle. The law bundle is the real migrated rust-interface-law tree.
 */

import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { loadBundle, listDirectory, getOutgoing, getIncoming } from '../../../.claude/skills/rust-interface-law/okf-core/index.mjs';
import { resolveRequired } from '../../../.claude/skills/rust-interface-law/okf-core/context/resolve-required.mjs';
import { buildContext } from '../../../.claude/skills/rust-interface-law/okf-core/context/assemble.mjs';
import { createSyntheticBundle } from '../../build-okf-skill/lib/fixture-v2.mjs';
import { runLawScenarios } from './law-scenarios.mjs';

export async function measureLawPerformance({ skillDir, syntheticConcepts = 2500 } = {}) {
  const law = await measureBundle(join(skillDir, 'okf'));
  const scenarios = await runLawScenarios({ skillDir, fixtureRoot: join(skillDir, 'tests/fixtures/runtime') });
  const totalMs = scenarios.reduce((sum, scenario) => sum + scenario.latencyMs, 0);
  const synthetic = await measureSynthetic(syntheticConcepts);
  return { law, scenarios: { totalMs, count: scenarios.length }, synthetic };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
async function measureBundle(root) {
  const startedLoad = performance.now();
  const bundle = await loadBundle(root);
  const loadMs = performance.now() - startedLoad;
  const startedList = performance.now();
  listDirectory(bundle, '');
  const listMs = performance.now() - startedList;
  const rule = bundle.concepts.find((concept) => concept.frontmatter?.['x-rule-id'] === 'REST-01');
  const startedShow = performance.now();
  getOutgoing(bundle, rule.id);
  getIncoming(bundle, rule.id);
  const showMs = performance.now() - startedShow;
  const startedContext = performance.now();
  const set = resolveRequired({ bundle, entryIds: [rule.id] });
  buildContext({ bundle, requiredSet: set, budgetBytes: 1_000_000 });
  const contextMs = performance.now() - startedContext;
  return { concepts: bundle.concepts.length, loadMs, listMs, showMs, contextMs, rss: process.memoryUsage().rss };
}

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
async function measureSynthetic(concepts) {
  const fixture = createSyntheticBundle({ concepts, edges: concepts * 4 });
  try {
    const bundle = await loadBundle(fixture.root);
    const started = performance.now();
    listDirectory(bundle, '');
    return { concepts: bundle.concepts.length, listMs: performance.now() - started };
  } finally {
    fixture.cleanup();
  }
}
