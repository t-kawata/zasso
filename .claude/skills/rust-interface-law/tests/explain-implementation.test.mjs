import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explainRule } from '../scripts/lib/explain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const lock = JSON.parse(readFileSync(join(root, 'atoms.lock.json'), 'utf8'));

test('explain includes the implementation contract when supplied', () => {
  const output = explainRule({
    ruleId: 'REST-01',
    lock,
    root,
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
