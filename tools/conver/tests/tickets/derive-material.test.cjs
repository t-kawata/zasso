// PX-307 @verifies C003
// The split runs at the package top, so the graph, Dirs-Tree, RFC and view are fixed
// names beside Tickets.json. These tests pin the derivation that keeps the command line
// free of those arguments.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  derivePackagePaths,
  readUnitMaterial,
} = require('../../.claude/scripts/tickets/verify-all-ticket-coverage.js');

function fixturePackage() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'px307-derive-'));
  const ticketsPath = path.join(directory, 'Tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify({ phases: [] }));
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-GRAPH.json'), JSON.stringify({
    sourceFile: 'RFC-ROOT.md',
    mainLanguage: 'rust',
    nodes: [],
    edges: [],
  }));
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-Dirs-Tree.json'), JSON.stringify({ trees: {} }));
  fs.writeFileSync(path.join(directory, 'RFC-ROOT.md'), [
    '# RFC',
    '',
    '### 1.1 Design',
    '',
    'body',
    '',
    '```json distribution-map',
    JSON.stringify({
      schemaVersion: 1,
      packageId: 'pkg-1',
      sourceViewDigest: 'a'.repeat(64),
      units: [{ unitId: 'op-X', kind: 'operation', sections: ['1.1 Design'], ground: 'design' }],
      residuals: [],
      digest: 'b'.repeat(64),
    }, null, 2),
    '```',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'SEQUENCES.json'), JSON.stringify({
    packageId: 'pkg-1',
    ownedOperationUnits: [{ unitId: 'op-X', operationId: 'X' }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  }));
  return { directory, ticketsPath };
}

test('C003 the package paths are derived from the Tickets.json directory', () => {
  const { directory, ticketsPath } = fixturePackage();
  const paths = derivePackagePaths(ticketsPath);
  assert.equal(paths.graphPath, path.join(directory, 'RFC-ROOT-GRAPH.json'));
  assert.equal(paths.dirsTreePath, path.join(directory, 'RFC-ROOT-Dirs-Tree.json'));
  assert.equal(paths.rfcPath, path.join(directory, 'RFC-ROOT.md'));
  assert.equal(paths.viewPath, path.join(directory, 'SEQUENCES.json'));
});

test('C003 readUnitMaterial needs no arguments beyond the Tickets.json path', () => {
  const { ticketsPath } = fixturePackage();
  const material = readUnitMaterial([ticketsPath]);
  assert.deepEqual(material.graph.nodes, []);
  assert.deepEqual(material.dirs.trees, {});
  assert.equal(material.view.packageId, 'pkg-1');
  assert.deepEqual(material.viewUnitIds, ['op-X']);
  assert.equal(material.map.units[0].unitId, 'op-X');
  assert.ok(Array.isArray(material.ledgerUnitIds));
});

test('C003 the RFC falls back to the markdown carrying a distribution ledger', () => {
  const { directory, ticketsPath } = fixturePackage();
  const graphPath = path.join(directory, 'RFC-ROOT-GRAPH.json');
  fs.writeFileSync(graphPath, JSON.stringify({ nodes: [], edges: [] }));
  fs.writeFileSync(path.join(directory, 'RFC-FALLBACK.md'), '# RFC\n\n## Distribution ledger\n\ncanonical\n');
  assert.equal(derivePackagePaths(ticketsPath).rfcPath, path.join(directory, 'RFC-FALLBACK.md'));
});
