'use strict';

/**
 * PX-419 — workspace inventory and interface surface coverage.
 */

const { test } = require('node:test');
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  assertSurfaceCoverage,
  discoverPackages,
  extractSurfaces,
  resolvePackage,
} = require('../../.claude/scripts/amend-rfc-up/workspace.js');
const { cleanup } = require('./helpers.cjs');

function makeRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'px419-workspace-'));
}

function makePackage(root, relativePath) {
  const directory = path.join(root, relativePath);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'RFC.md'), '# RFC\n');
  fs.writeFileSync(path.join(directory, 'Tickets.json'), JSON.stringify({ phases: [] }));
  fs.writeFileSync(path.join(directory, 'RFC-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));
  fs.writeFileSync(path.join(directory, 'RFC-Dirs-Tree.json'), JSON.stringify({ directories: [] }));
  return directory;
}

test('C006: manifest packages are enumerated with artifacts and canon state', () => {
  const repo = makeRepo();
  try {
    const packageDir = makePackage(repo, 'crates/a');
    fs.writeFileSync(path.join(repo, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-a', path: 'crates/a', kind: 'binary', layer: 'transports' }] },
    }));
    const inventory = discoverPackages({ repoRoot: repo });
    assert.equal(inventory.source, 'manifest');
    assert.equal(inventory.packages.length, 1);
    assert.equal(inventory.packages[0].id, 'pkg-a');
    assert.equal(inventory.packages[0].dir, packageDir);
    assert.equal(inventory.packages[0].hasArtifacts, true);
    assert.equal(inventory.packages[0].canonState, 'materialized-fresh');
  } finally {
    cleanup(repo);
  }
});

test('C006: a missing manifest falls back to a bounded scan and excludes internals', () => {
  const repo = makeRepo();
  try {
    makePackage(repo, 'crates/a');
    makePackage(repo, 'crates/b');
    makePackage(repo, 'node_modules/c');
    const inventory = discoverPackages({ repoRoot: repo });
    assert.equal(inventory.source, 'scan');
    assert.equal(inventory.packages.length, 2);
    assert.equal(inventory.packages.some((entry) => entry.dir.includes('node_modules')), false);
  } finally {
    cleanup(repo);
  }
});

test('C006: unknown package ids are rejected', () => {
  const packages = [{ id: 'pkg-a', dir: '/tmp/a' }];
  assert.equal(resolvePackage({ packages, idOrPath: 'pkg-a' }).id, 'pkg-a');
  assert.throws(
    () => resolvePackage({ packages, idOrPath: 'pkg-absent' }),
    (error) => error.code === 'PACKAGE_NOT_FOUND',
  );
});

test('C008: surfaces are extracted from an instruction list', () => {
  const surfaces = extractSurfaces({
    instructionText: 'Implement REST, WebSocket, CLI, gRPC, MCP, A2A interfaces.',
  });
  assert.deepEqual(surfaces, ['A2A', 'CLI', 'gRPC', 'MCP', 'REST', 'WebSocket']);
});

test('C008: only interface-adjacent lists and interface headings become surfaces', () => {
  const repo = makeRepo();
  const materialPath = path.join(repo, 'material.md');
  try {
    fs.writeFileSync(materialPath, [
      '# PART III.6 — REST Adapter',
      '# PART III.7 — WebSocket Adapter',
      '# PART III.8 — CLI Adapter',
      '# PART III.9 — gRPC Adapter',
      '# PART III.10 — MCP Adapter',
      '# PART III.11 — A2A Adapter',
      '# Neutral schema + catalog + bindings -> all interface references',
      'The adapter converts A2A messages to operation requests.',
    ].join('\n') + '\n');
    const surfaces = extractSurfaces({
      instructionText: [
        'REST/WebSocket/CLI/gRPC/MCP/A2A インターフェースを実装せよ。',
        'RFC,GRAPH,Dirs-Tree,Tickets を安全に改訂せよ。',
      ].join('\n'),
      materialPaths: [materialPath],
    });
    assert.deepEqual(surfaces, ['A2A', 'CLI', 'gRPC', 'MCP', 'REST', 'WebSocket']);
  } finally {
    cleanup(repo);
  }
});

test('C008: an artifact list on an interface line is not a surface', () => {
  const surfaces = extractSurfaces({
    instructionText: 'RFC,GRAPH,Dirs-Tree,Tickets を改訂し、REST/WebSocket/CLI/gRPC/MCP/A2A インターフェースを実装せよ。',
  });
  assert.deepEqual(surfaces, ['A2A', 'CLI', 'gRPC', 'MCP', 'REST', 'WebSocket']);
});

test('C008: unassigned surfaces are SURFACE_TARGET_MISSING', () => {
  const surfaces = ['REST', 'MCP'];
  const packages = [{ id: 'pkg-rest', dir: '/tmp/rest' }];
  assert.throws(
    () => assertSurfaceCoverage({
      surfaces,
      coverage: [{ surface: 'REST', status: 'covered', packageIds: ['pkg-rest'] }],
      packages,
    }),
    (error) => error.code === 'SURFACE_TARGET_MISSING' && error.surface === 'MCP',
  );
});

test('C008: a not_applicable surface needs a reason', () => {
  assert.throws(
    () => assertSurfaceCoverage({
      surfaces: ['MCP'],
      coverage: [{ surface: 'MCP', status: 'not_applicable', reason: '' }],
      packages: [],
    }),
    (error) => error.code === 'SURFACE_COVERAGE_INVALID',
  );
  assert.doesNotThrow(() => assertSurfaceCoverage({
    surfaces: ['MCP'],
    coverage: [{ surface: 'MCP', status: 'not_applicable', reason: 'no MCP package in this workspace' }],
    packages: [],
  }));
});

// @verifies C008
test('C008: the workspace surfaces CLI writes the extracted list', () => {
  const repo = makeRepo();
  const instructionPath = path.join(repo, 'instruction.md');
  const outPath = path.join(repo, 'surfaces.json');
  try {
    fs.writeFileSync(instructionPath, 'Implement REST, WebSocket, CLI, gRPC, MCP, A2A interfaces.\n');
    const result = spawnSync(process.execPath, [
      path.resolve(__dirname, '../../.claude/scripts/amend-rfc-up/workspace.js'),
      'surfaces',
      `--instruction=@${instructionPath}`,
      `--out=${outPath}`,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(outPath, 'utf8')), ['A2A', 'CLI', 'gRPC', 'MCP', 'REST', 'WebSocket']);
  } finally {
    cleanup(repo);
  }
});
