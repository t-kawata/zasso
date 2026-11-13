// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MARKER = '<!-- law-skill:checkpoint -->';
const COMMANDS = ['make-ticket', 'plan-ticket', 'start-ticket', 'review-ticket', 'resolve-ticket'];

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function findHostRoot(start = process.cwd()) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, '.claude/CLAUDE.md'))
      && existsSync(join(current, '.claude/commands/make-ticket.md'))) {
      return join(current, '.claude');
    }
    const parent = dirname(current);
    if (parent === current) throw new Error('HOST_ROOT_NOT_FOUND');
    current = parent;
  }
}

// [::TICKET::] PX-423 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-423 --for-spec --no-implementation-order`.
function resolveHostRoot() {
  if (process.env.LAW_HOST_ROOT) return resolve(process.env.LAW_HOST_ROOT);
  try {
    return findHostRoot();
  } catch {
    // Installed mode has no host tree; use the bundled tests/fixtures/host copy.
    return join(here, 'fixtures/host');
  }
}

test('the six canonical checkpoints are present and CLI-free', () => {
  const host = resolveHostRoot();
  const files = [
    join(host, 'CLAUDE.md'),
    ...COMMANDS.map((command) => join(host, 'commands', `${command}.md`)),
  ];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n').filter((line) => line.startsWith(MARKER));
    assert.equal(lines.length, 1, file);
    assert.equal(/--(?:root|source-root|path-alias)/.test(lines[0]), false, file);
  }
});

test('SKILL.md names every pipeline command', () => {
  const skill = readFileSync(join(here, '..', 'SKILL.md'), 'utf8');
  for (const command of COMMANDS) assert.ok(skill.includes(command), command);
});
