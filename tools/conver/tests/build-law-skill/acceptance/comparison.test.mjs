// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// @verifies C009 C010
/**
 * Same-source wiki comparison and the evidence-backed final report.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { loadBundle, validateConformance } from '../../../.claude/scripts/amend-rfc-up/okf-core/index.mjs';
import { buildWikiFromSources } from './wiki-comparison.mjs';
import { buildFinalReport } from './final-report.mjs';

const REPO = process.cwd();
const LAW = join(REPO, '.claude/skills/rust-interface-law');

test('C009: law and wiki conform on the same source set and share okf-core', async () => {
  const wiki = await buildWikiFromSources({ repoRoot: REPO });
  try {
    const lawBundle = await loadBundle(join(LAW, 'okf'));
    const wikiBundle = await loadBundle(join(wiki.skillDir, 'okf'));
    assert.deepEqual(validateConformance(lawBundle), []);
    assert.deepEqual(validateConformance(wikiBundle), []);
    assert.ok(lawBundle.concepts.some((concept) => concept.frontmatter['x-rule-id'] === 'REST-01'));
    assert.ok(wikiBundle.concepts.some((concept) => concept.type === 'Page'));
    assert.equal(wiki.core, 'okf-core');
    assert.ok(wikiBundle.concepts.some((concept) => /HTTP Rules/i.test(concept.title ?? '')));
  } finally {
    rmSync(wiki.root, { recursive: true, force: true });
  }
});

test('C010: every reported claim names its evidence', () => {
  const report = buildFinalReport({
    results: {
      conformance: 'dev 26/26 machine_verified',
      audit: '0 stale phrases',
      scenarios: '12/12 sufficient',
      performance: 'list 12ms',
      comparison: 'law and wiki conform',
    },
  });
  assert.deepEqual(report.sections, ['conformance', 'auditMatrix', 'scenarios', 'performance', 'comparison']);
  for (const claim of report.claims) assert.ok(claim.evidence, claim.id);
});
