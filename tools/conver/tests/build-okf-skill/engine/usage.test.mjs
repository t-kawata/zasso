// @verifies C007
/**
 * The generated SKILL.md must carry the traversal manual.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { auditUsageManual, REQUIRED_SECTIONS, MINIMUM_SCENARIOS } from '../../../.claude/scripts/amend-rfc-up/okf-core/commands/usage.mjs';

// [::TICKET::] PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-425|PX-426) --for-spec --no-implementation-order`.
function manual() {
  return [
    '# Example OKF',
    '',
    ...REQUIRED_SECTIONS.flatMap((heading) => [heading, '', 'Body.', '']),
    ...Array.from({ length: MINIMUM_SCENARIOS }, (_, index) => [
      `### Scenario ${index + 1}`,
      '',
      'Run `show <id>`.',
      '',
    ].join('\n')),
  ].join('\n');
}

test('C007: a complete traversal manual has every section and ten scenarios', () => {
  assert.deepEqual(auditUsageManual(manual()), []);
});

test('C007: a missing section or too few scenarios is incomplete', () => {
  const missing = manual().replace('## Start Here', '## Usage');
  assert.ok(auditUsageManual(missing).some((finding) => finding.code === 'USAGE_INCOMPLETE'));
  const fewer = manual().replace('### Scenario 10', '### Sample');
  assert.ok(auditUsageManual(fewer).some((finding) => finding.code === 'USAGE_INCOMPLETE'));
});
