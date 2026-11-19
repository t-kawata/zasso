/**
 * discover-boundary.test.cjs — general workspace/package discovery.
 * @verifies C005
 * @verifies C005/precondition
 * @verifies C005/postcondition
 * @verifies C005/invariant
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discoverBoundary,
  findWorkspaceRoot,
  findPackageRoot,
} = require('../../.claude/scripts/crystalize-readme/discover-boundary.js');

let root;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'px451-discover-'));
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, 'utf8');
}

describe('C005 — boundary discovery', () => {
  it('finds the workspace root by .git and the package root by workspace-map', () => {
    const workspace = path.join(root, 'ws-map');
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    write(path.join(workspace, 'workspace-map.auto.toml'), [
      '[[unit]]',
      'id = "pkg-a"',
      'paths = ["crates/core/a"]',
      'role = "core"',
      'interfaces = ["cli"]',
    ].join('\n'));
    const rfcDir = path.join(workspace, 'crates/core/a');
    write(path.join(rfcDir, 'RFC.md'), '# RFC\n');

    assert.equal(findWorkspaceRoot(rfcDir), workspace);
    assert.equal(findPackageRoot(rfcDir, workspace), rfcDir);

    const boundary = discoverBoundary({ rfcDir, workspaceRoot: workspace });
    assert.equal(boundary.unitId, 'pkg-a');
    assert.equal(boundary.role, 'core');
    assert.deepEqual(boundary.interfaces, ['cli']);
  });

  it('falls back to the nearest language manifest when the map is absent', () => {
    const workspace = path.join(root, 'ws-manifest');
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    const packageDir = path.join(workspace, 'packages/b');
    write(path.join(packageDir, 'Cargo.toml'), '[package]\nname = "b"\n');
    const rfcDir = path.join(packageDir, 'docs');
    write(path.join(rfcDir, 'RFC.md'), '# RFC\n');

    assert.equal(findPackageRoot(rfcDir, workspace), packageDir);
    const boundary = discoverBoundary({ rfcDir, workspaceRoot: workspace });
    assert.equal(boundary.packageRoot, packageDir);
    assert.equal(boundary.unitId, 'packages__b');
  });

  it('handles a root-covering unit', () => {
    const workspace = path.join(root, 'ws-root');
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    write(path.join(workspace, 'workspace-map.auto.toml'), [
      '[[unit]]',
      'id = "root"',
      'paths = ["/**"]',
      'role = "cli"',
    ].join('\n'));
    write(path.join(workspace, 'RFC.md'), '# RFC\n');

    const boundary = discoverBoundary({ rfcDir: workspace, workspaceRoot: workspace });
    assert.equal(boundary.packageRoot, workspace);
    assert.equal(boundary.unitId, 'root');
    assert.equal(boundary.workspaceReadmePath, path.join(workspace, 'README.md'));
  });
});

describe('C003 — field output for the command', () => {
  it('prints packageRoot, workspaceReadmePath, interfaces, and sourceLanguage', () => {
    const { spawnSync } = require('node:child_process');
    const workspace = path.join(root, 'ws-field');
    fs.mkdirSync(path.join(workspace, '.git'), { recursive: true });
    write(path.join(workspace, 'workspace-map.auto.toml'), [
      '[[unit]]',
      'id = "pkg-field"',
      'paths = ["crates/field"]',
      'role = "core"',
      'interfaces = ["cli", "rest"]',
    ].join('\n'));
    const rfcDir = path.join(workspace, 'crates/field');
    write(path.join(rfcDir, 'Cargo.toml'), '[package]\nname = "field"\n');
    write(path.join(rfcDir, 'RFC.md'), '# RFC\n');
    const script = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/discover-boundary.js');

    for (const [field, expected] of [
      ['packageRoot', rfcDir],
      ['workspaceReadmePath', path.join(workspace, 'README.md')],
      ['interfaces', 'cli,rest'],
      ['sourceLanguage', 'rust'],
    ]) {
      const result = spawnSync('node', [script, rfcDir, `--field=${field}`], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected, field);
    }
  });
});
