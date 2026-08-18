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
