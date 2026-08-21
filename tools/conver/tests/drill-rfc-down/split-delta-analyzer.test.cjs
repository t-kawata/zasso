/**
 * split-delta-analyzer.test.cjs — Tests for the Step 4 tickets-delta analyzer (PX-162)
 *
 * Covers contracts C001/C002 of the split delta pipeline:
 *   - Reads dirs-tree-delta.json + Tickets.json and proposes new-ticket /
 *     edit-ticket candidates and phase assignments deterministically (C001)
 *   - Generates tickets-delta.json with a validated schema, never writing to
 *     Tickets.json (C002)
 *
 * RED at make time: split-delta-analyzer.js does not exist yet.
 *
 * @verifies C001  (analyzer generates split-candidates.json as information and never writes Tickets.json)
 * @verifies C002  (duplicate-node ticket conflict flagged in the advisory)
 * @verifies C003  (scope/test-plan deficiency flag, advisory-only deterministic)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ANALYZER = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/split-delta-analyzer.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'split-analyzer-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return filePath;
}

/** Build a small Tickets.json fixture and a dirs-tree-delta fixture. */
function setupProject() {
  const ticketsPath = path.join(tmpRoot, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'Test',
    round: 1,
    metadata: { source: 'RFC.md' },
    phases: [
      { id: 0, name: 'Phase 0', tickets: [
        { id: 1, phaseId: 0, status: 'reviewed', title: 'Auth module', nodeIds: ['N0002'] },
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

function runAnalyzer(dtdPath, ticketsPath, outPath) {
  return spawnSync(process.execPath, [ANALYZER, `--dirs-tree-delta=${dtdPath}`, `--tickets=${ticketsPath}`, `--out=${outPath}`], { encoding: 'utf8' });
}

describe('split-delta-analyzer.js', () => {
  it('proposes new-ticket / edit-ticket candidates and phase assignments in tickets-delta.json', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const outPath = path.join(tmpRoot, 'tickets-delta.json');
    const res = runAnalyzer(dtdPath, ticketsPath, outPath);
    assert.equal(res.status, 0, res.stderr);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(Array.isArray(out.newTickets), 'newTickets is an array');
    assert.ok(Array.isArray(out.editedTickets), 'editedTickets is an array');
    assert.ok(Array.isArray(out.phaseAssignments), 'phaseAssignments is an array');
  });

  it('proposes a new ticket for a new file', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const outPath = path.join(tmpRoot, 'td-new.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const newTicket = out.newTickets.find((t) => (t.nodeIds || []).includes('N0003'));
    assert.ok(newTicket, 'new ticket proposed for N0003');
    assert.ok(newTicket.title && newTicket.status === 'todo', 'new ticket has title and todo status');
  });

  it('identifies the existing ticket mapped to a modified node', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const outPath = path.join(tmpRoot, 'td-edit.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const edit = out.editedTickets.find((e) => e.id === 1);
    assert.ok(edit, 'existing ticket id 1 (mapped to N0002) proposed as an edit candidate');
    assert.ok(edit.changes, 'edit candidate carries changes');
  });

  it('surfaces existing ticket statuses so the AI can preserve them', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const outPath = path.join(tmpRoot, 'td-status.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.existingStatuses.some((s) => s.id === 1 && s.status === 'reviewed'), 'reviewed status surfaced');
  });

  it('fails with a clear message on malformed dirs-tree-delta.json', () => {
    const { ticketsPath } = setupProject();
    const badDtd = path.join(tmpRoot, 'bad-dtd.json');
    fs.writeFileSync(badDtd, 'not json');
    const outPath = path.join(tmpRoot, 'td-bad.json');
    const res = runAnalyzer(badDtd, ticketsPath, outPath);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /dirs-tree-delta|invalid/i);
  });

  it('never writes to Tickets.json (C001 invariant)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const outPath = path.join(tmpRoot, 'td-no-write.json');
    const res = runAnalyzer(dtdPath, ticketsPath, outPath);
    assert.equal(res.status, 0);
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'Tickets.json byte-identical after analysis');
  });

  it('is deterministic (same inputs -> same output, C002 invariant)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const out1 = path.join(tmpRoot, 'td-det1.json');
    const out2 = path.join(tmpRoot, 'td-det2.json');
    runAnalyzer(dtdPath, ticketsPath, out1);
    runAnalyzer(dtdPath, ticketsPath, out2);
    assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'), 'identical output for identical inputs');
  });
});

describe('validateCandidates (output schema validation)', () => {
  it('accepts valid candidates (newTickets/editedTickets/phaseAssignments/existingStatuses arrays)', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({ newTickets: [], editedTickets: [], phaseAssignments: [], existingStatuses: [] });
    assert.deepEqual(errors, []);
  });

  it('rejects a new-ticket candidate missing required fields with an English message', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({
      newTickets: [{ title: 'Session storage' }], editedTickets: [], phaseAssignments: [], existingStatuses: [],
    });
    assert.ok(errors.some((e) => /status|phaseId|nodeIds/i.test(e)), 'English message names the missing field');
  });

  it('allows an unmapped edited-ticket candidate (id null) while requiring nodeId', async () => {
    const mod = await import(pathToFileURL(ANALYZER).href);
    const errors = mod.validateCandidates({
      newTickets: [], editedTickets: [{ nodeId: 'N0005', id: null, changes: {} }], phaseAssignments: [], existingStatuses: [],
    });
    assert.deepEqual(errors, [], 'id:null is an accepted design decision for an unmapped modified node');
  });
});

describe('four-axis advisory (PX-168 inspection layer)', () => {
  it('reports a file unmapped to any ticket (C001 omission)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const dtd = JSON.parse(fs.readFileSync(dtdPath, 'utf8'));
    dtd.modifiedFiles = [{ nodeId: 'N0005', path: 'src/api/new.rs', changes: { title: 'New' } }];
    writeJson(dtdPath, dtd);
    const outPath = path.join(tmpRoot, 'ad-unmapped.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.omission.some((f) => /no existing ticket|unmapped|merge/i.test(f.message)), 'unmapped modified file flagged');
  });

  it('reports an existing reviewed status overwrite risk (C001 danger)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const dtd = JSON.parse(fs.readFileSync(dtdPath, 'utf8'));
    dtd.modifiedFiles = [{ nodeId: 'N0002', path: 'src/api/auth.rs', changes: { title: 'Auth module extended' } }];
    writeJson(dtdPath, dtd);
    const outPath = path.join(tmpRoot, 'ad-status.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.danger.some((f) => /preserve|overwrite|reviewed/i.test(f.message)), 'status overwrite risk flagged');
  });

  it('detects a duplicate-node ticket conflict (C002 contradiction)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const dtd = JSON.parse(fs.readFileSync(dtdPath, 'utf8'));
    dtd.newFiles = [{ nodeId: 'N0002', path: 'src/api/auth.rs', kind: 'api_contract', title: 'Auth module extended' }];
    writeJson(dtdPath, dtd);
    const outPath = path.join(tmpRoot, 'ad-dup.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.contradiction.some((f) => /duplicate|already covered|prefer an edit/i.test(f.message)), 'duplicate-node ticket conflict flagged');
  });

  it('flags a new ticket candidate lacking scope or test plan (C003 deficiency)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const outPath = path.join(tmpRoot, 'ad-scope.json');
    runAnalyzer(dtdPath, ticketsPath, outPath);
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(out.advisory.deficiency.some((f) => /no scope|test plan/i.test(f.message)), 'scope/test-plan deficiency flagged');
  });

  it('is deterministic and never writes to Tickets.json (C001/C003 invariants)', () => {
    const { ticketsPath, dtdPath } = setupProject();
    const before = fs.readFileSync(ticketsPath, 'utf8');
    const out1 = path.join(tmpRoot, 'ad-det1.json');
    const out2 = path.join(tmpRoot, 'ad-det2.json');
    runAnalyzer(dtdPath, ticketsPath, out1);
    runAnalyzer(dtdPath, ticketsPath, out2);
    assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'), 'identical output');
    assert.equal(fs.readFileSync(ticketsPath, 'utf8'), before, 'Tickets.json untouched by analysis');
  });
});
