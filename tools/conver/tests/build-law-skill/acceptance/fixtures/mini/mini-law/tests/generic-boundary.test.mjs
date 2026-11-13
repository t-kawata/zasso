import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
test('SKILL.md carries procedure and no rule text', () => {
  assert.match(skill, /## Procedure/);
  assert.doesNotMatch(skill, /^## Rule/m);
});
