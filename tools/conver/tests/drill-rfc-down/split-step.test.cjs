/**
 * split-step.test.cjs — Tests for the Step 4 split step driver (PX-162, PX-165)
 *
 * Covers the AI-as-engineer staging flow:
 *   - --stage copies the real Tickets.json to a staging path and shows
 *     candidates; the real Tickets.json is untouched
 *   - the AI designs the evolution by editing the STAGING Tickets.json via
 *     add-ticket.js / update-ticket.js (no hand-edited JSON, no driver re-running
 *     the analyzer on --approve)
 *   - --approve validates the staging Tickets.json with validate-tickets,
 *     derives tickets-delta.json, and promotes
 *   - --reject leaves the real Tickets.json byte-identical
 *
 * RED at make time: split-step.js still auto-applies the analyzer output.
 *
 * @verifies C003  (--approve validates and promotes; reject leaves Tickets.json byte-identical)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/split-step.js');
const ADD_TICKET = path.resolve(__dirname, '../../.claude/scripts/tickets/add-ticket.js');
const UPDATE_TICKET = path.resolve(__dirname, '../../.claude/scripts/tickets/update-ticket.js');
const VALIDATE_LIB = path.resolve(__dirname, '../../.claude/scripts/lib/validate-tickets.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'split-step-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Build a validate-valid Tickets.json + dirs-tree-delta fixture. */
function setupProject() {
  const ticketsPath = path.join(tmpRoot, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'Test',
    round: 1,
    metadata: { source: 'RFC.md', generatedAt: '2026-08-20' },
    phases: [
      { id: 0, name: 'Phase 0', tickets: [
        { id: 1, phaseId: 0, status: 'reviewed', title: 'Auth module', nodeIds: ['N0002'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] },
      ] },
    ],
  });

  const dtdPath = path.join(tmpRoot, 'dirs-tree-delta.json');
  writeJson(dtdPath, {
    sourceFile: 'RFC.md',
    newFiles: [
      { path: 'src/session_storage.rs', kind: 'architecture', nodeId: 'N0003', title: 'Session storage' },
    ],
    modifiedFiles: [
      { nodeId: 'N0002', path: 'src/api/auth.rs', changes: { title: 'Auth module extended' } },
    ],
    srcDrift: [],
    dependencyDirs: [],
  });

  return { ticketsPath, dtdPath };
}

function stagingPathOf(ticketsPath) {
  return `${ticketsPath}.staging.json`;
}

function candidatesPathOf(ticketsPath) {
  return `${ticketsPath}.candidates.json`;
}

function deltaPathOf(ticketsPath) {
  return `${ticketsPath}.delta.json`;
}

function runStep(args, ticketsPath) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--tickets=${ticketsPath}`, ...args], { encoding: 'utf8' });
}

describe('split-step.js (AI-as-engineer staging flow)', () => {
  it('--stage copies the real Tickets.json to a staging path and shows candidates; real Tickets.json unchanged', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new ticket|newTickets|Session storage/i, 'report shows the new-ticket candidate');
    assert.match(res.stdout, /Advisory Report|Danger|Omission|Contradiction|Deficiency/i, 'report shows the four-axis advisory (PX-168)');
    assert.ok(fs.existsSync(stagingPathOf(ticketsPath)), 'staging copy created');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'real Tickets.json unchanged on stage');
  });

  it('the AI designs the evolution by editing the staging Tickets.json via add-ticket; --approve validates and promotes; existing statuses preserved', () => {
    const { ticketsPath, dtdPath } = setupProject();
    runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    const staging = stagingPathOf(ticketsPath);

    // The AI designs the tickets by editing the STAGING copy via add-ticket.js.
    const ticketInput = JSON.stringify({ title: 'Session storage', nodeIds: ['N0003'], scope: [], testUnit: [], testIntegration: [], testExceptions: [], changes: [] });
    const add = spawnSync(process.execPath, [ADD_TICKET, staging, 'P1'], { encoding: 'utf8', input: ticketInput });
    assert.equal(add.status, 0, add.stderr);

    // The real Tickets.json is still untouched before --approve.
    assert.ok(!fs.readFileSync(ticketsPath, 'utf8').includes('Session storage'), 'real Tickets.json untouched before approve');

    const approve = runStep(['--approve'], ticketsPath);
    assert.equal(approve.status, 0, approve.stderr);

    // The real Tickets.json was promoted with the AI-crafted ticket.
    const promoted = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const allTickets = promoted.phases.flatMap((p) => p.tickets);
    assert.ok(allTickets.some((t) => t.title === 'Session storage'), 'new ticket promoted');

    // Existing ticket status is preserved (never silently overwritten).
    assert.ok(allTickets.some((t) => t.id === 1 && t.status === 'reviewed'), 'existing reviewed status preserved');

    // validate-tickets passes on the promoted Tickets.json.
    const { validateTickets } = require(VALIDATE_LIB);
    const validation = validateTickets(promoted);
    assert.equal(validation.valid, true, `validate-tickets should pass: ${JSON.stringify(validation.errors)}`);

    // The pipeline handoff tickets-delta.json records the AI-crafted evolution.
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(ticketsPath), 'utf8'));
    assert.ok(delta.newTickets.some((t) => t.title === 'Session storage'), 'tickets-delta.json records the AI-added ticket');

    // Garbage cleanup: the transient candidates file is removed once the design
    // is committed; the delta (handoff) is preserved.
    assert.ok(!fs.existsSync(candidatesPathOf(ticketsPath)), 'candidates removed after approve');
  });

  it('--reject leaves the real Tickets.json byte-identical and discards staging (perfect-before-write gate)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    const res = runStep(['--reject'], ticketsPath);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'real Tickets.json byte-identical on reject');
    assert.ok(!fs.existsSync(stagingPathOf(ticketsPath)), 'staging discarded on reject');
    assert.ok(!fs.existsSync(candidatesPathOf(ticketsPath)), 'candidates removed after reject');
  });

  it('--approve with a missing staging Tickets.json emits an English error and does not promote', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep(['--approve'], ticketsPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'real Tickets.json unchanged');
  });

  it('--stage without --dirs-tree-delta emits an English error and creates no staging', () => {
    const { ticketsPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep(['--stage'], ticketsPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.ok(!fs.existsSync(stagingPathOf(ticketsPath)), 'no staging created');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'real Tickets.json unchanged');
  });

  it('--approve rejects a staging Tickets.json that fails validate-tickets and does not promote', () => {
    const { ticketsPath, dtdPath } = setupProject();
    runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    // Simulate an out-of-band invalid state: a ticket with no title fails
    // validate-tickets.
    const staging = stagingPathOf(ticketsPath);
    const staged = JSON.parse(fs.readFileSync(staging, 'utf8'));
    staged.phases[0].tickets[0].title = '';
    fs.writeFileSync(staging, JSON.stringify(staged, null, 2) + '\n', 'utf8');

    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep(['--approve'], ticketsPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Error|Cause|Action/i, 'English error message');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'real Tickets.json unchanged (no promote)');
  });

  it('the delta derivation records an AI-edited ticket in editedTickets and promotes it', () => {
    const { ticketsPath, dtdPath } = setupProject();
    runStep([`--dirs-tree-delta=${dtdPath}`, '--stage'], ticketsPath);
    // The AI edits ticket P0-1 via update-ticket.js on the staging copy.
    const staging = stagingPathOf(ticketsPath);
    const edit = spawnSync(process.execPath, [UPDATE_TICKET, staging, 'P0-1'], { encoding: 'utf8', input: JSON.stringify({ title: 'Auth module extended' }) });
    assert.equal(edit.status, 0, edit.stderr);

    const approve = runStep(['--approve'], ticketsPath);
    assert.equal(approve.status, 0, approve.stderr);
    const delta = JSON.parse(fs.readFileSync(deltaPathOf(ticketsPath), 'utf8'));
    assert.ok(delta.editedTickets.some((e) => e.id === 1), 'delta records the AI-edited ticket');
  });
});
