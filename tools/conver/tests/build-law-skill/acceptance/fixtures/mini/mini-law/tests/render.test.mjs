import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('okf index names the rule', () => {
  const index = readFileSync(new URL('../okf/index.md', import.meta.url), 'utf8');
  assert.match(index, /MINI-01/);
});
