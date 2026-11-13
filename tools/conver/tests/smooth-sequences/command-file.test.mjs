import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMAND = fileURLToPath(new URL('../../.claude/commands/smooth-sequences.md', import.meta.url));

test('design findings are repaired without a human surface', () => {
  const text = readFileSync(COMMAND, 'utf8');
  assert.match(text, /Command = repair loop/);
  assert.match(text, /No human surface/);
  assert.match(text, /No human questions/);
  assert.equal(text.includes('Only human surface'), false, 'a human question surface remains');
  assert.match(text, /its question gate is decided by this AI/);
  assert.match(text, /only `0` is completion/);
});
