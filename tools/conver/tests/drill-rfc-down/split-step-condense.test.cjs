'use strict';

/**
 * PX-443 follow-up — drill Step 4 must end at the shared partition minimum.
 *
 * `--approve` promotes the AI-designed staging document. Without `--condense`,
 * a drill that adds one small ticket per graph node can leave that mass set in
 * Tickets.json. The flag runs the shared condense CLI after the promote and
 * restores the pre-approve document when the partition or its gate refuses.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/split-step.js');
const ADD_TICKET = path.resolve(__dirname, '../../.claude/scripts/tickets/add-ticket.js');
const COMMAND_PATH = path.resolve(__dirname, '../../.claude/commands/drill-rfc-down.md');

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Write an empty graph so the closure and coverage gates can read the package. */
function writeGraph(directory) {
  writeJson(path.join(directory, 'RFC-GRAPH.json'), {
    sourceFile: 'RFC.md',
    nodes: [],
    edges: [],
  });
}

function setupProject() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'split-step-condense-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'Test',
    round: 1,
    metadata: { source: 'RFC.md', generatedAt: '2026-11-18' },
    phases: [
      {
        id: 0,
        name: 'Phase 0',
        nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'],
        tickets: [
          {
            id: 1,
            phaseId: 0,
            status: 'reviewed',
            title: 'Auth module',
            nodeIds: ['N0001'],
            scope: [],
            testUnit: [],
            testIntegration: [],
            testExceptions: [],
            changes: [],
          },
        ],
      },
    ],
  });
  writeGraph(directory);
  writeFile(path.join(directory, 'RFC.md'), '# RFC\n');
  const dtdPath = path.join(directory, 'dirs-tree-delta.json');
  writeJson(dtdPath, {
    sourceFile: 'RFC.md',
    newFiles: [],
    modifiedFiles: [],
    srcDrift: [],
    dependencyDirs: [],
  });
  return { directory, ticketsPath, dtdPath };
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function runStep(args, ticketsPath) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--tickets=${ticketsPath}`, ...args], { encoding: 'utf8' });
}

function addTicket(stagingPath, phase, ticket) {
  const result = spawnSync(process.execPath, [ADD_TICKET, stagingPath, phase], {
    encoding: 'utf8',
    input: JSON.stringify(ticket),
  });
  assert.equal(result.status, 0, result.stderr);
}

function approveBackups(directory) {
  return fs.readdirSync(directory).filter((name) => name.startsWith('Tickets.pre-approve-'));
}

test('C003: the drill Step 4 procedure always approves with the shared condensation', () => {
  const text = fs.readFileSync(COMMAND_PATH, 'utf8');
  assert.match(text, /split-step\.js" --tickets="\$TICKETS_PATH" --approve --condense/);
});

test('C003: --approve --condense merges the staged additions to the partition minimum', () => {
  const { directory, ticketsPath, dtdPath } = setupProject();
  try {
    const stage = runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    assert.equal(stage.status, 0, stage.stderr);

    const staging = `${ticketsPath}.staging.json`;
    addTicket(staging, 'P0', { title: 'Session storage', nodeIds: ['N0002'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });
    addTicket(staging, 'P0', { title: 'Session cache', nodeIds: ['N0003'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });
    addTicket(staging, 'P0', { title: 'Session expiry', nodeIds: ['N0004'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });

    const approve = runStep(['--approve', '--condense'], ticketsPath);
    assert.equal(approve.status, 0, approve.stderr);

    const promoted = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const tickets = promoted.phases.flatMap((phase) => phase.tickets);
    assert.equal(tickets.length, 2, 'three todo additions condense into one survivor');
    assert.ok(tickets.some((ticket) => ticket.status === 'reviewed' && ticket.title === 'Auth module'));
    const survivor = tickets.find((ticket) => ticket.status === 'todo');
    assert.match(survivor.title, /Session storage \/ Session cache \/ Session expiry/);
    assert.equal(survivor.condensedFrom.tickets.length, 2, 'the ledger records the two absorbed seeds');
    assert.deepEqual(
      survivor.condensedFrom.tickets.map((entry) => entry.title).sort(),
      ['Session cache', 'Session expiry'],
    );
    assert.equal(fs.existsSync(staging), false, 'staging removed after a successful approve');
    assert.equal(approveBackups(directory).length, 1, 'the pre-approve document is archived');

    const delta = JSON.parse(fs.readFileSync(`${ticketsPath}.delta.json`, 'utf8'));
    assert.equal(delta.newTickets.length, 1, 'the handoff records the condensed survivor, not three seeds');
    assert.equal(delta.newTickets[0].title, survivor.title);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C003: --condense is rejected outside --approve', () => {
  const { directory, ticketsPath, dtdPath } = setupProject();
  try {
    const result = runStep([`--dirs-tree-delta=${dtdPath}`, '--stage', '--condense'], ticketsPath);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--condense requires --approve/);
    assert.equal(fs.existsSync(`${ticketsPath}.staging.json`), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('C003: a refused condensation restores the pre-approve Tickets.json and keeps the staging design', () => {
  const { directory, ticketsPath, dtdPath } = setupProject();
  try {
    const stage = runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    assert.equal(stage.status, 0, stage.stderr);

    const staging = `${ticketsPath}.staging.json`;
    addTicket(staging, 'P1', { title: 'One small phase', nodeIds: ['N0099'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });

    const before = fs.readFileSync(ticketsPath, 'utf8');
    const approve = runStep(['--approve', '--condense'], ticketsPath);
    assert.equal(approve.status, 1);
    assert.match(approve.stderr, /CONDENSE_AFTER_WRITE_FAILED|PHASE_BELOW_MIN_TICKETS/);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'pre-approve Tickets.json restored');
    assert.ok(fs.existsSync(staging), 'the staged design is kept for repair');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
