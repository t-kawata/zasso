// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkAssetsToRules } from '../../.claude/scripts/amend-rfc-up/law-asset/rule-link.mjs';

const RULES = [
  { id: 'AUTH-01', statement: 'Require a bearer token.', verification: 'scripts/check.py' },
  { id: 'AUTH-02', statement: 'Reject expired tokens.', verification: 'unit test' },
];

test('an explicit rule id links an asset to a rule', () => {
  const result = linkAssetsToRules({
    assets: [{ path: 'scripts/check.py', type: 'Procedure', ruleIds: ['AUTH-01'] }],
    rules: RULES,
  });
  assert.equal(result.links.length, 1);
  assert.deepEqual(result.links[0].rules, ['AUTH-01']);
  assert.equal(result.findings.length, 0);
});

test('a verification command that names the asset links it', () => {
  const result = linkAssetsToRules({
    assets: [{ path: 'scripts/check.py', type: 'Procedure' }],
    rules: RULES,
  });
  assert.deepEqual(result.links[0].rules, ['AUTH-01']);
});

test('an unlinked asset is reported', () => {
  const result = linkAssetsToRules({
    assets: [{ path: 'scripts/orphan.py', type: 'Procedure' }],
    rules: RULES,
  });
  assert.ok(result.findings.some((finding) => finding.code === 'ASSET_RULE_UNLINKED'));
});
