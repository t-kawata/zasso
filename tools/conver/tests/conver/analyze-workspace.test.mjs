// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
// PX-364 @verifies C001 @verifies C002 @verifies C003 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { analyzeWorkspace } from '../../.claude/scripts/conver/draw-progress-gif.js';
import { buildFrames } from '../../.claude/scripts/conver/progress-gif/loop.js';
import { writeWorkspace } from './fixtures.mjs';

const CLI = path.resolve(new URL('../../.claude/scripts/conver/draw-progress-gif.js', import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const PREVIOUS_STAMP = '20261101000000';
const OMISSIONS_STAMP = '20261103000000';
const MAX_BUFFER = 64 * 1024 * 1024;

/** One package whose only obligation is a ticket contract, so its total is 1. */
// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
function createWorkspaceWithOneTicketContract() {
  return writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': {
        phases: [{
          id: 0,
          tickets: [{
            id: 1,
            phaseId: 0,
            status: 'todo',
            title: 'ticket',
            contracts: [{ id: 'C1', sourceEdge: 'e', precondition: 'p', postcondition: 'q', invariant: 'r' }],
          }],
        }],
      },
    },
  });
}

/** Write a previous snapshot so the current obligations look like growth. */
// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
function seedPreviousSnapshot(root, totals) {
  const directory = path.join(root, 'progress-gif', 'snapshots');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `${PREVIOUS_STAMP}.json`),
    JSON.stringify({
      schema: 'conver-progress-snapshot-v1',
      packages: totals.map(({ id, total }) => ({ id, name: id, path: id, obligations: { total } })),
    }),
  );
}

// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
function runCli(root, extraArgs = []) {
  const emptyConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-empty-config-'));
  return spawnSync(process.execPath, [CLI, '-t', root, '--no-open', '--no-source-scan', ...extraArgs], {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    env: { ...process.env, CLAUDE_CONFIG_DIR: emptyConfig },
  });
}

// [::TICKET::] PX-364 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-364 --for-spec --no-implementation-order`.
function computeDigest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('a bare previous-snapshot delta is not drawn as FIND', () => {
  const root = createWorkspaceWithOneTicketContract();
  seedPreviousSnapshot(root, [{ id: 'pkg-1', total: 0 }]);

  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.growthEvents.filter((event) => event.evidence === 'previous-snapshot').length, 0);
  assert.equal(model.growthEvents.filter((event) => event.stage === 'find').length, 0);
  const frames = buildFrames(model, { frames: 60 });
  assert.equal(frames.filter((frame) => frame.stage === 'find').length, 0);
});

test('every FIND growth event names an existing artifact path', () => {
  const root = createWorkspaceWithOneTicketContract();
  seedPreviousSnapshot(root, [{ id: 'pkg-1', total: 0 }]);

  const model = analyzeWorkspace(root, { sourceScan: false });
  const findEvents = model.growthEvents.filter((event) => event.stage === 'find');
  for (const event of findEvents) {
    assert.notEqual(event.evidence, 'previous-snapshot');
    assert.ok(fs.existsSync(event.evidence), `missing artifact ${event.evidence}`);
  }
});

test('an OMISSIONS artifact keeps exactly one FIND event at its stamp', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
    files: { [`pkg-1/OMISSIONS-${OMISSIONS_STAMP}.json`]: { omissions: [{ ticketKey: 'P2-1' }] } },
  });

  const model = analyzeWorkspace(root, { sourceScan: false });
  const findEvents = model.growthEvents.filter((event) => event.stage === 'find');

  assert.equal(findEvents.length, 1);
  assert.equal(findEvents[0].evidence, path.join(root, 'pkg-1', `OMISSIONS-${OMISSIONS_STAMP}.json`));
  assert.equal(findEvents[0].t, new Date(2026, 10, 3, 0, 0, 0).getTime());
});

test('an OMISSIONS artifact and a snapshot delta yield one FIND event, not two', () => {
  const root = writeWorkspace({
    packages: [{ id: 'pkg-1', name: 'pkg-1', path: 'pkg-1' }],
    files: {
      'pkg-1/Tickets.json': {
        phases: [{
          id: 0,
          tickets: [{ id: 1, phaseId: 0, status: 'todo', contracts: [{ id: 'C1' }] }],
        }],
      },
      [`pkg-1/OMISSIONS-${OMISSIONS_STAMP}.json`]: { omissions: [{ ticketKey: 'P2-1' }] },
    },
  });
  seedPreviousSnapshot(root, [{ id: 'pkg-1', total: 0 }]);

  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.growthEvents.filter((event) => event.stage === 'find').length, 1);
});

test('a malformed previous snapshot is ignored without throwing', () => {
  const root = createWorkspaceWithOneTicketContract();
  const directory = path.join(root, 'progress-gif', 'snapshots');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${PREVIOUS_STAMP}.json`), '{not json');

  const model = analyzeWorkspace(root, { sourceScan: false });

  assert.equal(model.growthEvents.filter((event) => event.stage === 'find').length, 0);
  assert.ok(Array.isArray(model.packages));
});

test('snapshot writing survives and --dry-run writes nothing', () => {
  const root = createWorkspaceWithOneTicketContract();
  const written = runCli(root);

  assert.equal(written.status, 0, written.stderr);
  const snapshots = fs.readdirSync(path.join(root, 'progress-gif', 'snapshots'))
    .filter((name) => /^\d{14}\.json$/.test(name));
  assert.equal(snapshots.length, 1);

  const dryRoot = createWorkspaceWithOneTicketContract();
  const dry = runCli(dryRoot, ['--dry-run']);

  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(fs.existsSync(path.join(dryRoot, 'progress-gif', 'snapshots')), false);
});

test('the installed copy equals the source and drops the removed strings', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'conver-install-'));
  const installed = spawnSync(
    process.execPath,
    ['install.js', '-y', '-t', path.join(target, '.claude'), '--no-install-deps'],
    { cwd: PROJECT_ROOT, encoding: 'utf8', maxBuffer: MAX_BUFFER },
  );

  assert.equal(installed.status, 0, installed.stderr);
  const sourceFile = path.join(PROJECT_ROOT, '.claude', 'scripts', 'conver', 'draw-progress-gif.js');
  const installedFile = path.join(target, '.claude', 'scripts', 'conver', 'draw-progress-gif.js');
  assert.equal(computeDigest(installedFile), computeDigest(sourceFile));

  const installedText = fs.readFileSync(installedFile, 'utf8');
  assert.equal(installedText.includes('previous-snapshot'), false);
  assert.equal(installedText.includes('snapshot-diff'), false);
});
