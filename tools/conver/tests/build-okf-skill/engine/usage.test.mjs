// @verifies C007
/**
 * PX-424 — the generated SKILL.md must carry exhaustive usage scenarios.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { auditUsageManual } from '../lib/command-contract.mjs';

const HEADINGS = [
  '## When to Use',
  '## Query Recipes',
  '## Evidence and Citation',
  '## Freshness and Conflict',
  '## Update Procedure',
  '## Page Authoring',
  '## Failure Modes',
  '## Examples',
];

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function manual() {
  return [
    '# Example OKF',
    '',
    ...HEADINGS.flatMap((heading) => [heading, '', 'Body.', '']),
    '### Example 1',
    '',
    'Ask a question.',
    '',
    '### Example 2',
    '',
    'Cite the answer.',
    '',
  ].join('\n');
}

test('C007: a complete usage manual has every section and two examples', () => {
  assert.deepEqual(auditUsageManual(manual()), []);
});

test('C007: a missing section or fewer than two examples is incomplete', () => {
  const missing = manual().replace('## When to Use', '## Usage');
  assert.ok(auditUsageManual(missing).some((finding) => finding.code === 'USAGE_INCOMPLETE'));
  const oneExample = manual().replace('### Example 2', '### Sample');
  assert.ok(auditUsageManual(oneExample).some((finding) => finding.code === 'USAGE_INCOMPLETE'));
});
