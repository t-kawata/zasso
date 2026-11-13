// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainRule, loadRuleMap } from '../scripts/lib/law-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ruleMap = loadRuleMap(join(root, 'source/rule-concepts.json'));

test('explain includes the implementation contract when supplied', async () => {
  const output = await explainRule({
    ruleId: 'REST-01',
    ruleMap,
    skillRoot: root,
    implementation: {
      rule: 'REST-01',
      version: '=0.8.9',
      template: 'templates/rest/api-mod.rs.tmpl',
      detector: 'scan/dispatcher-bypass',
      test: 'rest_auth_body_order',
    },
  });
  assert.match(output, /## Implementation contract/);
  assert.match(output, /templates\/rest\/api-mod\.rs\.tmpl/);
  assert.match(output, /scan\/dispatcher-bypass/);
  assert.match(output, /rest_auth_body_order/);
});
