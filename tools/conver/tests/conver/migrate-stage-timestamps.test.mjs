import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MIGRATE = fileURLToPath(new URL('../../.claude/scripts/tickets/migrate-stage-timestamps.js', import.meta.url));

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function temporaryDirectory(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `px401-${label}-`));
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function fixtureRoot(label) {
  const root = temporaryDirectory(label);
  writeJson(path.join(root, 'Tickets.json'), {
    title: 'PX-401 migration fixture',
    round: 1,
    metadata: {},
    phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'reviewed', status: 'reviewed', contracts: [] }] }],
  });
  writeJson(path.join(root, 'Malfeasance.json'), { version: 1, records: [] });
  writeJson(path.join(root, 'CRYSTALIZE-Status.json'), { sourceFile: 'a', graphFile: 'b', currentStep: 1, steps: { 1: 'pending' } });
  writeJson(path.join(root, 'drills', 'Status.json'), { state: 'COMPLETE', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' });
  writeJson(path.join(root, '.claude', 'scripts', 'hidden.json'), { status: 'reviewed' });
  writeJson(path.join(root, 'tests', 'fixtures', 'Tickets.json'), { phases: [] });
  writeJson(path.join(root, 'node_modules', 'hidden.json'), { status: 'reviewed' });
  return root;
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function snapshotOf(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else entries.push([path.relative(root, file), fs.readFileSync(file, 'utf8')]);
    }
  };
  walk(root);
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

// [::TICKET::] PX-401 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-401 --for-spec --no-implementation-order`.
function run(root, extra = []) {
  return execFileSync('node', [MIGRATE, `--root=${root}`, ...extra], { encoding: 'utf8' });
}

test('C009: dry-run writes nothing and reports the missing completion', () => {
  const root = fixtureRoot('dry');
  const before = snapshotOf(root);
  const output = run(root, ['--dry-run']);
  assert.match(output, /\[migration\]/);
  assert.match(output, /0 files changed/);
  assert.match(output, /missing_completion=1/);
  assert.deepEqual(snapshotOf(root), before);
});

test('C009: apply is idempotent and the second run changes nothing', () => {
  const root = fixtureRoot('apply');
  const first = run(root);
  assert.match(first, /0 files changed/);
  const second = run(root);
  assert.match(second, /0 files changed/);
});

test('C009: .claude, tests and node_modules are never scanned', () => {
  const root = fixtureRoot('exclude');
  const before = snapshotOf(root);
  const output = run(root, ['--dry-run']);
  assert.equal(output.includes('.claude'), false);
  assert.equal(output.includes('node_modules'), false);
  assert.deepEqual(snapshotOf(root), before);
});

test('C009: multiple roots are scanned in one run', () => {
  const first = fixtureRoot('multi-a');
  const second = fixtureRoot('multi-b');
  const output = execFileSync('node', [MIGRATE, `--root=${first}`, `--root=${second}`, '--dry-run'], { encoding: 'utf8' });
  assert.match(output, /scanned=8/);
  assert.match(output, /0 files changed/);
});

test('C009: an unreadable ticket file exits non-zero and writes nothing', () => {
  const root = temporaryDirectory('broken');
  fs.writeFileSync(path.join(root, 'Tickets.json'), '{not json');
  const before = fs.readFileSync(path.join(root, 'Tickets.json'), 'utf8');
  assert.throws(() => run(root), (error) => error.status !== 0);
  assert.equal(fs.readFileSync(path.join(root, 'Tickets.json'), 'utf8'), before);
});
