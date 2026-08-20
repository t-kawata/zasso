/**
 * session-init.test.cjs — Tests for session-init.js (PX-157 Phase 4)
 *
 * Covers the C002 contract (session-init -> session):
 *   - Precondition: RFC path exists on disk.
 *   - Postcondition: $SESSION_DIR is created with Status.json/DesignTree.json/
 *     CheckList.md (new or resumed).
 *   - Invariant: no file outside $SESSION_DIR is written.
 *
 * RED at make time: session-init.js does not exist yet — every spawnSync fails
 * with MODULE_NOT_FOUND — until Phase 4 lands (GREEN).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/session-init.js');

const SESSION_FILES = ['Status.json', 'DesignTree.json', 'CheckList.md'];

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'session-init-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRfc(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const rfcPath = path.join(dir, 'RFC-ROOT.md');
  fs.writeFileSync(rfcPath, '# RFC-ROOT\n\ncontent\n');
  return { dir, rfcPath, sessionDir: path.join(dir, 'drills') };
}

describe('session-init.js', () => {
  it('creates $SESSION_DIR with Status.json/DesignTree.json/CheckList.md on a new session', () => {
    const { rfcPath, sessionDir } = makeRfc(path.join(tmpRoot, 'new'));
    const res = spawnSync(process.execPath, [SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    for (const f of SESSION_FILES) {
      assert.ok(fs.existsSync(path.join(sessionDir, f)), `${f} created under ${sessionDir}`);
    }
    const status = JSON.parse(fs.readFileSync(path.join(sessionDir, 'Status.json'), 'utf8'));
    assert.equal(status.state, 'GRILLING');
    assert.equal(status.rfcPath, rfcPath);
  });

  it('resumes (no overwrite) when all session files already exist', () => {
    const { dir, rfcPath, sessionDir } = makeRfc(path.join(tmpRoot, 'resume'));
    fs.mkdirSync(sessionDir, { recursive: true });
    const iso = '2026-08-20T00:00:00.000Z';
    fs.writeFileSync(path.join(sessionDir, 'Status.json'), JSON.stringify({
      state: 'REVIEWING', researchPath: rfcPath, rfcPath, rfcDir: dir,
      reviewLoopCount: 2, createdAt: iso, updatedAt: iso, marker: 'sentinel',
    }));
    fs.writeFileSync(path.join(sessionDir, 'DesignTree.json'), JSON.stringify({ version: 1, updatedAt: iso, nodes: [] }));
    fs.writeFileSync(path.join(sessionDir, 'CheckList.md'), '# RFC 要件チェックリスト\n\n<!-- GENERATED -->\n');
    const res = spawnSync(process.execPath, [SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.session, 'continued');
    const status = JSON.parse(fs.readFileSync(path.join(sessionDir, 'Status.json'), 'utf8'));
    assert.equal(status.marker, 'sentinel', 'existing Status.json not overwritten');
    assert.equal(status.reviewLoopCount, 2, 'existing session state preserved');
  });

  it('exits 1 with a clear message when the RFC path does not exist', () => {
    const missing = path.join(tmpRoot, 'nope.md');
    const res = spawnSync(process.execPath, [SCRIPT, missing], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /not found|does not exist/i);
  });

  it('invariant: writes only under $SESSION_DIR — pre-existing files in the RFC dir are untouched', () => {
    const { dir, rfcPath, sessionDir } = makeRfc(path.join(tmpRoot, 'inv'));
    const originalStatus = path.join(dir, 'Status.json');
    fs.writeFileSync(originalStatus, '{"state":"DONE","sentinel":"original"}');
    const beforeListing = fs.readdirSync(dir).sort();
    const res = spawnSync(process.execPath, [SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    // The only new entry in the RFC dir is the drills/ subdirectory itself.
    const afterListing = fs.readdirSync(dir).sort();
    assert.deepEqual(afterListing, [...beforeListing, 'drills'].sort(), 'only drills/ added');
    // The pre-existing Status.json in the RFC dir is byte-identical.
    assert.equal(fs.readFileSync(originalStatus, 'utf8'), '{"state":"DONE","sentinel":"original"}');
    // DesignTree.json and CheckList.md (which did not pre-exist) must not be
    // created directly in the RFC dir — only the drills/ subdirectory holds them.
    for (const f of ['DesignTree.json', 'CheckList.md']) {
      assert.ok(!fs.existsSync(path.join(dir, f)), `${f} not created in RFC dir`);
    }
    // The session files live in drills/.
    for (const f of SESSION_FILES) {
      assert.ok(fs.existsSync(path.join(sessionDir, f)), `${f} created under drills/`);
    }
  });
});
