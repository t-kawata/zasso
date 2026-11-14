// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// @verifies C007 C008
/**
 * Twelve law scenarios and the performance budgets.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { runLawScenarios } from './law-scenarios.mjs';
import { measureLawPerformance } from './law-performance.mjs';

const REPO = process.cwd();
const SKILL = join(REPO, '.claude/skills/rust-interface-law');
const FIXTURES = join(SKILL, 'tests/fixtures/runtime');

test('C007: twelve scenarios reach the authoritative rule without raw grep', async () => {
  const scenarios = await runLawScenarios({ skillDir: SKILL, fixtureRoot: FIXTURES });
  assert.equal(scenarios.length, 12);
  for (const scenario of scenarios) {
    assert.ok(scenario.commands.length > 0);
    const zeroResultScenario = ['applies REST', 'freshness', 'trust unverified', 'lint', 'required adapter phase'].includes(scenario.label);
    if (!zeroResultScenario) assert.ok(scenario.conceptIds.length > 0, scenario.label);
    assert.ok(scenario.payloadBytes > 0, scenario.label);
    assert.ok(scenario.latencyMs >= 0, scenario.label);
    assert.equal(scenario.usedRawFileRead, false, scenario.label);
    assert.equal(scenario.contentOk, true, scenario.label);
    assert.equal(scenario.verdict, 'sufficient', `${scenario.label} exited ${scenario.status}`);
  }
});

test('C008: law and synthetic bundles stay inside the performance budgets', async () => {
  const result = await measureLawPerformance({ skillDir: SKILL, syntheticConcepts: 2500 });
  assert.ok(result.law.listMs < 300, `law list ${result.law.listMs}ms`);
  assert.ok(result.law.showMs < 80, `law show ${result.law.showMs}ms`);
  assert.ok(result.law.contextMs < 800, `law context ${result.law.contextMs}ms`);
  assert.ok(result.scenarios.totalMs < 30000, `scenarios ${result.scenarios.totalMs}ms`);
  assert.ok(result.law.rss < 512 * 1024 * 1024);
  assert.equal(result.synthetic.concepts, 2500);
  assert.ok(result.synthetic.listMs < 300, `synthetic list ${result.synthetic.listMs}ms`);
});
