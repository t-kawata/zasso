import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const commands = join(here, '../../../commands');

test('C005 start and review invoke the implementation pipeline and gate', () => {
  const start = readFileSync(join(commands, 'start-ticket.md'), 'utf8');
  const review = readFileSync(join(commands, 'review-ticket.md'), 'utf8');
  assert.match(start, /law-implementation/);
  assert.match(start, /implementation-check/);
  assert.match(start, /gate/);
  assert.match(start, /attest/);
  assert.match(review, /implementation-check/);
});

test('make and plan record the law implementation scope', () => {
  const make = readFileSync(join(commands, 'make-ticket.md'), 'utf8');
  const plan = readFileSync(join(commands, 'plan-ticket.md'), 'utf8');
  assert.match(make, /implementation-policy/);
  assert.match(plan, /template/);
});

test('resolve adds implementation findings to the repair loop', () => {
  const resolve = readFileSync(join(commands, 'resolve-ticket.md'), 'utf8');
  assert.match(resolve, /implementation-check/);
});
