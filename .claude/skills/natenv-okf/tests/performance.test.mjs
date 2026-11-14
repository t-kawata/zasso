import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../okf-core/index.mjs';

const CONCEPT_BUDGET_MS = 2000;
const CONCEPT_CEILING = 400;

test('the bundle loads within the performance budget', async () => {
  const root = fileURLToPath(new URL('../okf', import.meta.url));
  const started = Date.now();
  const bundle = await loadBundle(root);
  const elapsed = Date.now() - started;
  assert.ok(bundle.concepts.length > 0, 'bundle is empty');
  assert.ok(bundle.concepts.length <= CONCEPT_CEILING, `concepts: ${bundle.concepts.length}`);
  assert.ok(elapsed < CONCEPT_BUDGET_MS, `load took ${elapsed}ms`);
});

test('a one-hop page read stays interactive', async () => {
  const root = fileURLToPath(new URL('../okf', import.meta.url));
  const bundle = await loadBundle(root);
  const entry = bundle.concepts[0];
  const started = Date.now();
  const page = (await import('../okf-core/index.mjs')).buildTraversal({ bundle, id: entry.id, profile: 'okf-wiki' });
  assert.ok(Date.now() - started < 500);
  assert.equal(page.protocol, 'okf-traversal/v1');
  assert.ok(page.frontier.length > 0 || page.guidance.state === 'stop');
});
