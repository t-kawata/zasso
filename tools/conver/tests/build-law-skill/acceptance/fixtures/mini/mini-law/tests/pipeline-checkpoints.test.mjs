import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('SKILL.md names the five pipeline commands', () => {
  const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
  for (const command of ['make-ticket', 'plan-ticket', 'start-ticket', 'review-ticket', 'resolve-ticket']) {
    assert.ok(skill.includes(command), command);
  }
});
