/**
 * split-step.test.cjs — Tests for the Step 4 split step driver (PX-162)
 *
 * Covers contract C003 (AI approval -> write):
 *   - --dry-run prints the candidate report without changing Tickets.json
 *   - --reject leaves Tickets.json byte-identical (perfect-before-write gate)
 *   - --approve applies the plan (new ticket + edit) and validate-tickets passes
 *
 * RED at make time: split-step.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STEP_DRIVER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/split-step.js');
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

function runStep(args, ticketsPath, dtdPath) {
  return spawnSync(process.execPath, [STEP_DRIVER, `--tickets=${ticketsPath}`, `--dirs-tree-delta=${dtdPath}`, ...args], { encoding: 'utf8' });
}

describe('split-step.js', () => {
  it('--dry-run prints the candidate report without changing Tickets.json', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep(['--dry-run'], ticketsPath, dtdPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /new ticket|newTickets|Session storage/i, 'report shows the new-ticket candidate');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'Tickets.json unchanged on dry-run');
  });

  it('--reject leaves Tickets.json byte-identical (perfect-before-write gate)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const res = runStep(['--reject'], ticketsPath, dtdPath);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'Tickets.json byte-identical on reject');
  });

  it('--approve applies the plan (new ticket + edit) and validate-tickets passes', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const res = runStep(['--approve'], ticketsPath, dtdPath);
    assert.equal(res.status, 0, res.stderr);

    const updated = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
    const allTickets = updated.phases.flatMap((p) => p.tickets);
    assert.ok(allTickets.some((t) => t.title === 'Session storage'), 'new ticket added');
    assert.ok(allTickets.some((t) => t.id === 1 && t.title === 'Auth module extended'), 'existing ticket edited');

    const { validateTickets } = require(VALIDATE_LIB);
    const result = validateTickets(updated);
    assert.equal(result.valid, true, `validate-tickets should pass: ${JSON.stringify(result.errors)}`);
  });
});
