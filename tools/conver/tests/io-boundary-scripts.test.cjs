/**
 * io-boundary-scripts.test.cjs — Tests for the restored io-boundary scripts
 *
 * Covers the PX-157 contract for the two scripts restored from archive:
 *   - insert-io-boundary-template.js: appends the "graphify-rfc + boundify-graph
 *     reference info" template with [::IO-INFO-STUB::] markers on a fresh RFC,
 *     and skips (no duplicate) when the section already exists.
 *   - check-io-stubs.js: exits 0 when no [::IO-INFO-STUB::] markers remain,
 *     exits 1 listing remaining markers otherwise.
 *
 * RED at make time: these active paths do not exist yet, so every spawnSync
 * exits non-zero — the tests fail red until the archive copy lands (GREEN).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_DIR = path.resolve(__dirname, '../.claude/scripts/grill-me-for-rfc');
const INSERT_SCRIPT = path.join(SCRIPT_DIR, 'insert-io-boundary-template.js');
const CHECK_SCRIPT = path.join(SCRIPT_DIR, 'check-io-stubs.js');

const IO_STUB_MARKER = '[::IO-INFO-STUB::]';
const SECTION_PATTERN = 'graphify-rfc + boundify-graph のための参考情報';

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'io-boundary-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Write an RFC file and return its path. */
function writeRfc(name, content) {
  const rfcPath = path.join(tmpRoot, name);
  fs.writeFileSync(rfcPath, content, 'utf8');
  return rfcPath;
}

describe('insert-io-boundary-template.js', () => {
  it('inserts the template with IO-INFO-STUB markers on a fresh RFC', () => {
    const rfcPath = writeRfc('fresh.md', '# Fresh RFC\n\ncontent\n');
    const res = spawnSync(process.execPath, [INSERT_SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.ok(out.section);
    const content = fs.readFileSync(rfcPath, 'utf8');
    assert.ok(content.includes(SECTION_PATTERN), 'I/O boundary section heading present');
    assert.ok(content.includes(IO_STUB_MARKER), 'IO-INFO-STUB markers present');
    assert.equal((content.match(/\[::IO-INFO-STUB::\]/g) || []).length, 5);
  });

  it('skips when the I/O boundary section already exists (no duplicate)', () => {
    const rfcPath = writeRfc('existing.md', `# Existing\n\n## 5. ${SECTION_PATTERN}\n\nalready present\n`);
    const beforeContent = fs.readFileSync(rfcPath, 'utf8');
    const res = spawnSync(process.execPath, [INSERT_SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /already exists/);
    assert.equal(fs.readFileSync(rfcPath, 'utf8'), beforeContent, 'RFC unchanged');
  });

  it('exits 1 when the RFC file does not exist', () => {
    const res = spawnSync(process.execPath, [INSERT_SCRIPT, path.join(tmpRoot, 'nope.md')], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /not found/);
  });
});

describe('check-io-stubs.js', () => {
  it('exits 0 when no IO-INFO-STUB markers remain', () => {
    const rfcPath = writeRfc('clean.md', '# Clean\n\nno markers here\n');
    const res = spawnSync(process.execPath, [CHECK_SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const out = JSON.parse(res.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.count, 0);
  });

  it('exits 1 and lists markers when IO-INFO-STUB markers remain', () => {
    const rfcPath = writeRfc('dirty.md', `# Dirty\n\n${IO_STUB_MARKER} fill me\n`);
    const res = spawnSync(process.execPath, [CHECK_SCRIPT, rfcPath], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    const out = JSON.parse(res.stderr);
    assert.equal(out.ok, false);
    assert.equal(out.count, 1);
    assert.ok(out.stubs[0].line > 0);
  });

  it('exits 1 when the RFC file does not exist', () => {
    const res = spawnSync(process.execPath, [CHECK_SCRIPT, path.join(tmpRoot, 'nope.md')], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /not found/);
  });
});
