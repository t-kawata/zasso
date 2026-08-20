/**
 * rfc-evolution.test.cjs — Tests for rfc-evolution.js (PX-158 Phase 2)
 *
 * Covers contracts C003/C004/C005 using tests/sample-rfcs real data:
 *   - capture: baseline.json written with sha256 + line count under SESSION_DIR (C003)
 *   - verify append-only: ordered-subsequence gate; delta.json written (C004)
 *   - verify well-formedness: TBD/TODO/stub/IO-INFO-STUB rejected (C005)
 *   - contradiction candidates against real GRAPH/Dirs-Tree/Tickets data
 *
 * RED at make time: rfc-evolution.js does not exist yet.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/rfc-evolution.js');
const SAMPLE_DIR = path.resolve(__dirname, '../sample-rfcs');
const SAMPLE_RFC = path.join(SAMPLE_DIR, 'RFC-ROOT.md');

const IO_BOUNDARY_HINT = 'I/O boundary: graphify-rfc + boundify-graph reference info applies.';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rfc-evolution-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Copy the real sample RFC into a fresh project dir. */
function setupProject() {
  const project = path.join(tmpRoot, 'project');
  fs.mkdirSync(project, { recursive: true });
  const rfcPath = path.join(project, 'RFC-ROOT.md');
  fs.writeFileSync(rfcPath, fs.readFileSync(SAMPLE_RFC, 'utf8'));
  return { project, rfcPath, sessionDir: path.join(project, 'drills') };
}

/** Build a cwd containing a fixture Tickets.json + real GRAPH/Dirs-Tree for contradiction detection. */
function setupContradictionCwd() {
  const cwd = path.join(tmpRoot, 'cwd');
  fs.mkdirSync(cwd, { recursive: true });
  fs.copyFileSync(path.join(SAMPLE_DIR, 'RFC-ROOT-GRAPH.json'), path.join(cwd, 'RFC-ROOT-GRAPH.json'));
  fs.copyFileSync(path.join(SAMPLE_DIR, 'RFC-ROOT-Dirs-Tree.json'), path.join(cwd, 'RFC-ROOT-Dirs-Tree.json'));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({
    metadata: {
      source: 'RFC-ROOT.md',
      resolvedPaths: {
        rfcPath: 'RFC-ROOT.md',
        graphPath: 'RFC-ROOT-GRAPH.json',
        dirsTreePath: 'RFC-ROOT-Dirs-Tree.json',
      },
    },
    phases: [],
  }));
  return cwd;
}

function capture(rfcPath) {
  return spawnSync(process.execPath, [SCRIPT, 'capture', rfcPath], { encoding: 'utf8' });
}

function verify(rfcPath, cwd) {
  return spawnSync(process.execPath, [SCRIPT, 'verify', rfcPath], { encoding: 'utf8', cwd: cwd || path.dirname(rfcPath) });
}

describe('rfc-evolution.js capture', () => {
  it('writes baseline.json with sha256 and line count under SESSION_DIR (deterministic path)', () => {
    const { rfcPath, sessionDir } = setupProject();
    const res = capture(rfcPath);
    assert.equal(res.status, 0);
    const baselinePath = path.join(sessionDir, 'baseline.json');
    assert.equal(baselinePath, path.join(path.dirname(rfcPath), 'drills', 'baseline.json'));
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    assert.match(baseline.hash, /^[0-9a-f]{64}$/);
    assert.ok(baseline.lineCount >= 100);
    assert.ok(Array.isArray(baseline.lines));
  });
});

describe('rfc-evolution.js verify (append-only, C004)', () => {
  it('accepts a tail append and writes delta.json', () => {
    const { rfcPath, sessionDir } = setupProject();
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n## 62. New evolution section\n\nNew capability. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(sessionDir, 'delta.json')), 'delta.json written');
  });

  it('accepts a mid-insert', () => {
    const { rfcPath, sessionDir } = setupProject();
    capture(rfcPath);
    const content = fs.readFileSync(rfcPath, 'utf8');
    const lines = content.split('\n');
    const insertAt = Math.floor(lines.length / 2);
    lines.splice(insertAt, 0, `## 63. Inserted section\n\nMid content. ${IO_BOUNDARY_HINT}`, '');
    fs.writeFileSync(rfcPath, lines.join('\n'));
    const res = verify(rfcPath);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(sessionDir, 'delta.json')));
  });

  it('rejects a deletion with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    const content = fs.readFileSync(rfcPath, 'utf8');
    fs.writeFileSync(rfcPath, content.split('\n').slice(1).join('\n')); // delete first line
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
  });

  it('rejects a modification with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    const content = fs.readFileSync(rfcPath, 'utf8');
    fs.writeFileSync(rfcPath, content.replace(/Purpose/, 'PURPOSE!!!'));
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
  });

  it('rejects a line reorder with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    const lines = fs.readFileSync(rfcPath, 'utf8').split('\n');
    // swap the first two lines
    [lines[0], lines[1]] = [lines[1], lines[0]];
    fs.writeFileSync(rfcPath, lines.join('\n'));
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
  });

  it('fails when baseline.json is missing', () => {
    const { rfcPath } = setupProject();
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
  });
});

describe('rfc-evolution.js verify (well-formedness, C005)', () => {
  it('rejects TBD/TODO in added content with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n## 64. Incomplete section\n\nTODO fill this later.\n`);
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
    assert.match(res.stdout + res.stderr, /TBD|TODO/i);
  });

  it('rejects a remaining IO-INFO-STUB marker with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n<!-- [::IO-INFO-STUB::] fill this -->\n`);
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
  });

  it('rejects an empty delta (no evolution) with exit 1', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    const res = verify(rfcPath);
    assert.equal(res.status, 1);
    assert.match(res.stdout + res.stderr, /delta/i);
  });
});

describe('rfc-evolution.js verify (contradiction candidates)', () => {
  it('detects candidates against the real GRAPH', () => {
    const { rfcPath, sessionDir } = setupProject();
    const cwd = setupContradictionCwd();
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n## 65. Purpose of the new module\n\nAdds a purpose. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath, cwd);
    assert.equal(res.status, 0, res.stderr);
    const delta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'delta.json'), 'utf8'));
    assert.ok(delta.contradictionCandidates.length > 0, 'candidates found against GRAPH');
  });

  it('reports not-checked when Tickets.json is unavailable', () => {
    const { rfcPath } = setupProject();
    const emptyCwd = path.join(tmpRoot, 'empty-cwd');
    fs.mkdirSync(emptyCwd, { recursive: true });
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n## 66. Standalone section\n\nContent. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath, emptyCwd);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /not.?checked/i);
  });
});

describe('rfc-evolution.js verify report (AI judgment aid)', () => {
  it('includes the delta section body content so the AI can judge danger/deficiency', () => {
    const { rfcPath } = setupProject();
    capture(rfcPath);
    const bodyMarker = 'UNIQUE_BODY_MARKER_XYZ for danger judgment';
    fs.appendFileSync(rfcPath, `\n## 62. New evolution section\n\n${bodyMarker}. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /UNIQUE_BODY_MARKER_XYZ/, 'report shows the added body content');
  });

  it('lists DesignTree resolved nodes as an omission-check aid', () => {
    const { rfcPath, sessionDir } = setupProject();
    capture(rfcPath);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'DesignTree.json'), JSON.stringify({
      version: 1,
      updatedAt: '2026-08-20T00:00:00.000Z',
      nodes: [{ id: 'Q1', title: 'Resolved Decision Alpha', status: 'resolved', children: [], questions: [] }],
    }));
    fs.appendFileSync(rfcPath, `\n## 62. New evolution section\n\nContent. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Resolved Decision Alpha/, 'report shows the resolved node title');
  });

  it('contradiction candidates include the matched existing node context', () => {
    const { rfcPath, sessionDir } = setupProject();
    const cwd = setupContradictionCwd();
    capture(rfcPath);
    fs.appendFileSync(rfcPath, `\n## 65. Purpose of the new module\n\nAdds a purpose. ${IO_BOUNDARY_HINT}\n`);
    const res = verify(rfcPath, cwd);
    assert.equal(res.status, 0, res.stderr);
    const delta = JSON.parse(fs.readFileSync(path.join(sessionDir, 'delta.json'), 'utf8'));
    const purpose = delta.contradictionCandidates.find((c) => c.matchedBy.includes('purpose'));
    assert.ok(purpose, 'purpose candidate found');
    assert.ok(purpose.context && purpose.context.length > 0, 'candidate includes matched context');
  });
});

describe('rfc-evolution.js clean', () => {
  it('removes baseline.json', () => {
    const { rfcPath, sessionDir } = setupProject();
    capture(rfcPath);
    const baselinePath = path.join(sessionDir, 'baseline.json');
    assert.ok(fs.existsSync(baselinePath));
    const res = spawnSync(process.execPath, [SCRIPT, 'clean', rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.ok(!fs.existsSync(baselinePath), 'baseline removed');
  });
});
