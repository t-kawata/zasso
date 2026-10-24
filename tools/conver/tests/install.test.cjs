/**
 * install.test.cjs — Integration test for install.js (rsync mirror + --no-install-deps)
 *
 * Hermetic: no network, no real npm install. Verifies that:
 *  - the source .claude tree is copied to the target
 *  - a file present in both is overwritten by the source
 *  - a file present only in the target is removed
 *  - project-owned files (settings.local.json, node_modules, .DS_Store) are never touched
 *  - no install-state record is written or kept
 *  - dependency resolution is skipped with --no-install-deps
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INSTALL_SCRIPT = path.resolve(__dirname, '../install.js');
const SOURCE_TREE = path.resolve(__dirname, '../.claude');
const SAMPLE_FILE = path.join('scripts', 'crystalize-readme', 'loop-drive-readme.js');
const INSTALL_STATE_FILE_NAME = '.conver-install-state.json';

function installInto(target, options = {}) {
  const args = [INSTALL_SCRIPT, '--no-install-deps', '-t', target, ...(options.extraArgs ?? [])];
  return spawnSync('node', args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: options.env,
  });
}

function withTemporaryRoot(prefix, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function snapshotTree(dir, into = {}) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) snapshotTree(full, into);
    else into[path.relative(dir, full)] = fs.readFileSync(full);
  }
  return into;
}

describe('install.js mirrors the .claude tree into the target', () => {
  it('copies the tree (manifest + lockfile) and skips dependency resolution', () => {
    withTemporaryRoot('install-', (root) => {
      const target = path.join(root, '.claude');

      const result = installInto(target);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(fs.existsSync(path.join(target, 'package.json')), true, 'manifest must be copied');
      assert.equal(fs.existsSync(path.join(target, 'package-lock.json')), true, 'lockfile must be copied');
      assert.equal(
        fs.existsSync(path.join(target, SAMPLE_FILE)),
        true,
        'scripts must be copied',
      );
      assert.equal(
        fs.existsSync(path.join(target, 'node_modules')),
        false,
        'dependency resolution must be skipped with --no-install-deps',
      );
    });
  });

  it('overwrites a target file that differs from the source', () => {
    withTemporaryRoot('install-overwrite-', (root) => {
      const target = path.join(root, '.claude');
      assert.equal(installInto(target).status, 0);

      const installedFile = path.join(target, SAMPLE_FILE);
      fs.writeFileSync(installedFile, '// locally edited yesterday\n');

      const second = installInto(target);

      assert.equal(second.status, 0, `stderr: ${second.stderr}`);
      assert.deepEqual(
        fs.readFileSync(installedFile),
        fs.readFileSync(path.join(SOURCE_TREE, SAMPLE_FILE)),
        'the source is the only authority after a mirror sync',
      );
    });
  });

  it('removes files and directories that exist only in the target', () => {
    withTemporaryRoot('install-mirror-', (root) => {
      const target = path.join(root, '.claude');
      assert.equal(installInto(target).status, 0);

      const obsoleteDirectory = path.join(target, 'scripts', 'obsolete');
      fs.mkdirSync(obsoleteDirectory, { recursive: true });
      fs.writeFileSync(path.join(obsoleteDirectory, 'removed.js'), '// no longer shipped\n');
      fs.writeFileSync(path.join(target, 'OBSOLETE.md'), '# no longer shipped\n');

      const second = installInto(target);

      assert.equal(second.status, 0, `stderr: ${second.stderr}`);
      assert.equal(fs.existsSync(obsoleteDirectory), false, 'a target-only directory must be deleted');
      assert.equal(fs.existsSync(path.join(target, 'OBSOLETE.md')), false, 'a target-only file must be deleted');
    });
  });

  it('never touches project-owned files: settings.local.json, node_modules, .DS_Store', () => {
    withTemporaryRoot('install-owned-', (root) => {
      const target = path.join(root, '.claude');
      const ownedSettings = '{"permissions":{"allow":["Bash(project-specific)"]}}\n';
      fs.mkdirSync(path.join(target, 'node_modules', 'sentinel'), { recursive: true });
      fs.writeFileSync(path.join(target, 'settings.local.json'), ownedSettings);
      fs.writeFileSync(path.join(target, 'node_modules', 'sentinel', 'package.json'), '{}\n');
      fs.writeFileSync(path.join(target, '.DS_Store'), 'finder metadata\n');

      const result = installInto(target);

      assert.equal(result.status, 0, `stderr: ${result.stderr}`);
      assert.equal(fs.readFileSync(path.join(target, 'settings.local.json'), 'utf8'), ownedSettings);
      assert.equal(fs.existsSync(path.join(target, 'node_modules', 'sentinel', 'package.json')), true);
      assert.equal(fs.readFileSync(path.join(target, '.DS_Store'), 'utf8'), 'finder metadata\n');
    });
  });

  it('writes no install-state record and removes a legacy one', () => {
    withTemporaryRoot('install-state-', (root) => {
      const target = path.join(root, '.claude');
      assert.equal(installInto(target).status, 0);

      const statePath = path.join(target, INSTALL_STATE_FILE_NAME);
      assert.equal(fs.existsSync(statePath), false, 'a mirror sync needs no record of what it installed');

      fs.writeFileSync(statePath, '{}\n');
      assert.equal(installInto(target).status, 0);
      assert.equal(fs.existsSync(statePath), false, 'a record from the old installer must not survive the mirror');
    });
  });

  it('changes nothing on a second run', () => {
    withTemporaryRoot('install-idem-', (root) => {
      const target = path.join(root, '.claude');
      assert.equal(installInto(target).status, 0);
      const before = snapshotTree(target);

      const second = installInto(target);

      assert.equal(second.status, 0, second.stderr);
      assert.deepEqual(snapshotTree(target), before, 'the second run must change nothing');
    });
  });

  it('fails with a named cause when rsync is not available', () => {
    withTemporaryRoot('install-no-rsync-', (root) => {
      const target = path.join(root, '.claude');

      const result = spawnSync(process.execPath, [INSTALL_SCRIPT, '--no-install-deps', '-t', target], {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: { ...process.env, PATH: path.join(root, 'no-tools-here') },
      });

      assert.equal(result.status, 1, 'a missing rsync must be a failure, not a silent partial install');
      assert.match(result.stderr, /rsync/, 'the report must name the missing tool');
    });
  });
});

describe('install.js without -t resolves the target from the current directory', () => {
  it('installs into ./.claude and completes with stdin closed', () => {
    withTemporaryRoot('install-cwd-', (root) => {
      const direct = spawnSync('node', [INSTALL_SCRIPT, '--no-install-deps'], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });

      assert.equal(direct.status, 0, `a closed stdin must not block the entry point: ${direct.stderr}`);
      assert.equal(fs.existsSync(path.join(root, '.claude', 'package.json')), true, 'the target resolves from the current directory');
      assert.equal(direct.stdout.includes('?'), false, 'the installer must never prompt');
    });
  });
});
