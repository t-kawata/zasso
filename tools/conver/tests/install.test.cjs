/**
 * install.test.cjs — Integration test for install.js (copy + --no-install-deps)
 *
 * Hermetic: no network, no real npm install. Verifies that:
 *  - install.js accepts --no-install-deps
 *  - the source .claude tree is copied to the target
 *  - the dependency manifest (package.json) and lockfile are part of the copy
 *  - dependency resolution is skipped, so the target has no node_modules
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INSTALL_SCRIPT = path.resolve(__dirname, '../install.js');

describe('install.js --no-install-deps', () => {
  it('copies the .claude tree (manifest + lockfile) and skips dependency resolution', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-'));
    const target = path.join(root, '.claude');

    const result = spawnSync('node', [INSTALL_SCRIPT, '-y', '--no-install-deps', '-t', target], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(fs.existsSync(path.join(target, 'package.json')), true, 'manifest must be copied');
    assert.equal(fs.existsSync(path.join(target, 'package-lock.json')), true, 'lockfile must be copied');
    assert.equal(
      fs.existsSync(path.join(target, 'node_modules')),
      false,
      'dependency resolution must be skipped with --no-install-deps',
    );
    assert.equal(
      fs.existsSync(path.join(target, 'scripts', 'crystalize-readme', 'loop-drive-readme.js')),
      true,
      'scripts must be copied',
    );

    fs.rmSync(root, { recursive: true, force: true });
  });
});

const { decideFileAction, INSTALL_STATE_FILE_NAME } = require('../install-deps.cjs');

describe('decideFileAction — updating and preserving, decided rather than asked', () => {
  const SOURCE = 'a'.repeat(64);
  const NEWER = 'b'.repeat(64);
  const USER_EDIT = 'c'.repeat(64);

  it('selects the correct action for every combination of the three inputs', () => {
    assert.equal(decideFileAction({ targetExists: false }), 'install');
    assert.equal(decideFileAction({ targetExists: true, targetDigest: SOURCE, sourceDigest: SOURCE, previousSourceDigest: SOURCE }), 'unchanged');
    assert.equal(decideFileAction({ targetExists: true, targetDigest: SOURCE, sourceDigest: NEWER, previousSourceDigest: SOURCE }), 'update');
    assert.equal(decideFileAction({ targetExists: true, targetDigest: USER_EDIT, sourceDigest: NEWER, previousSourceDigest: SOURCE }), 'preserve');
  });

  it('resolves unknown provenance toward safety', () => {
    assert.equal(
      decideFileAction({ targetExists: true, targetDigest: USER_EDIT, sourceDigest: NEWER, previousSourceDigest: null }),
      'preserve',
      'with no record of what was installed, an existing file is never overwritten',
    );
  });
});

describe('install.js without -t resolves the target from the current directory', () => {
  it('installs into ./.claude and completes with stdin closed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-cwd-'));

    const result = spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `a closed stdin must not block the entry point: ${result.stderr}`);
    assert.equal(fs.existsSync(path.join(root, '.claude', 'package.json')), true, 'the target resolves from the current directory');
    assert.equal(result.stdout.includes('?'), false, 'the installer must never prompt');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('records what it installed so a later run can tell a user edit from conver moving on', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-state-'));
    spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

    const statePath = path.join(root, '.claude', INSTALL_STATE_FILE_NAME);
    assert.equal(fs.existsSync(statePath), true, 'the previous installation record must be written');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.ok(Object.keys(state.files).length > 0, 'the record must list the files it installed');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('preserves a file the user modified, names it, and still resolves everything else', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-preserve-'));
    spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

    const userEdited = path.join(root, '.claude', 'scripts', 'crystalize-readme', 'loop-drive-readme.js');
    const userText = '// locally edited by the user\n';
    fs.writeFileSync(userEdited, userText);

    const result = spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

    assert.equal(result.status, 0, `resolving everything else must still succeed: ${result.stderr}`);
    assert.equal(fs.readFileSync(userEdited, 'utf8'), userText, 'the user edit must survive byte-for-byte');
    assert.match(result.stdout, /preserved/i, 'the report must state that a file was preserved');
    assert.match(result.stdout, /loop-drive-readme\.js/, 'the preserved file must be named in the report');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('changes nothing on a second run and says so', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-idem-'));
    spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

    const snapshot = (dir, into = {}) => {
      for (const name of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        if (name === 'node_modules' || name === INSTALL_STATE_FILE_NAME) continue;
        if (fs.statSync(full).isDirectory()) snapshot(full, into);
        else into[full] = fs.readFileSync(full, 'utf8');
      }
      return into;
    };
    const before = snapshot(path.join(root, '.claude'));

    const second = spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(snapshot(path.join(root, '.claude')), before, 'the second run must change nothing');
    assert.match(second.stdout, /0 (new|updated)|nothing changed|no changes/i, 'the second run must say that nothing changed');

    fs.rmSync(root, { recursive: true, force: true });
  });
});
