// Every split-step script now accepts the artifact that anchors its stage and derives
// the rest. These tests pin the single-argument forms; the legacy multi-argument forms
// stay covered by the scripts' existing suites.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const phasify = require('../../.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js');
const showAllNodes = require('../../.claude/scripts/rfc-graph/show-all-nodes-title-summary.js');
const showPhaseNodes = require('../../.claude/scripts/rfc-graph/show-phase-nodes.js');
const showGraphSummary = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');
const showDirsFilesTree = require('../../.claude/scripts/rfc-graph/show-dirs-files-tree.js');
const addTickets = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const mergeContracts = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const verifyClosure = require('../../.claude/scripts/tickets/verify-ticket-closure.js');
const consolidate = require('../../.claude/scripts/tickets/consolidate-phase-tickets.js');

function makePackage() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'split-derivation-'));
  const docPath = path.join(directory, 'RFC-ROOT.md');
  fs.writeFileSync(docPath, '# RFC\n');
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-GRAPH.json'), JSON.stringify({
    sourceFile: 'RFC-ROOT.md', mainLanguage: 'rust', nodes: [], edges: [],
  }));
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-Dirs-Tree.json'), JSON.stringify({ sourceFile: 'RFC-ROOT.md', trees: {} }));
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-SPLIT-Status.json'), JSON.stringify({ steps: {} }));
  fs.writeFileSync(path.join(directory, 'Tickets.json'), JSON.stringify({ phases: [] }));
  return {
    directory,
    docPath,
    graphPath: path.join(directory, 'RFC-ROOT-GRAPH.json'),
    dirsTreePath: path.join(directory, 'RFC-ROOT-Dirs-Tree.json'),
    statusPath: path.join(directory, 'RFC-ROOT-SPLIT-Status.json'),
    ticketsPath: path.join(directory, 'Tickets.json'),
  };
}

test('phasify accepts the RFC and derives the graph and Dirs-Tree', () => {
  const fixture = makePackage();
  const options = phasify.parseArguments([fixture.docPath]);
  assert.equal(options.graphPath, fixture.graphPath);
  assert.equal(options.dirsTreePath, fixture.dirsTreePath);
});

test('phasify accepts the graph and derives the Dirs-Tree', () => {
  const fixture = makePackage();
  const options = phasify.parseArguments([fixture.graphPath]);
  assert.equal(options.graphPath, fixture.graphPath);
  assert.equal(options.dirsTreePath, fixture.dirsTreePath);
});

test('show-all-nodes-title-summary derives the graph from Tickets.json', () => {
  const fixture = makePackage();
  const parsed = showAllNodes.parseArguments([
    '--tickets=' + fixture.ticketsPath,
    '--phase=P0',
  ]);
  assert.equal(parsed.graph, fixture.graphPath);
});

test('show-phase-nodes derives the graph and Dirs-Tree from Tickets.json', () => {
  const fixture = makePackage();
  const parsed = showPhaseNodes.parseCliArguments([
    '--tickets=' + fixture.ticketsPath,
    '--phase=P0',
  ]);
  assert.equal(parsed.graphPath, fixture.graphPath);
  assert.equal(parsed.dirsTreePath, fixture.dirsTreePath);
});

test('show-graph-summary derives the graph from the RFC source', () => {
  const fixture = makePackage();
  const parsed = showGraphSummary.parseArguments([
    'node', 'script.js', '--source=' + fixture.docPath,
  ]);
  assert.equal(parsed.graphPath, fixture.graphPath);
  assert.equal(parsed.sourcePath, fixture.docPath);
});

test('show-dirs-files-tree accepts the RFC and derives the Dirs-Tree', () => {
  const fixture = makePackage();
  assert.equal(showDirsFilesTree.resolveDirsTreePath(['--doc=' + fixture.docPath]), fixture.dirsTreePath);
});

test('add-tickets-for-phase accepts Tickets.json and the phase only', () => {
  const fixture = makePackage();
  const parsed = addTickets.parseCliArguments([
    'node', 'script.js', fixture.ticketsPath, 'P0',
  ]);
  assert.equal(parsed.dirsTreePath, fixture.dirsTreePath);
  assert.equal(parsed.graphPath, fixture.graphPath);
  assert.equal(parsed.phaseArg, 'P0');
  assert.equal(parsed.error, null);
});

test('merge-contracts-to-tickets derives the graph from Tickets.json', () => {
  const fixture = makePackage();
  const parsed = mergeContracts.parseArgs([fixture.ticketsPath]);
  assert.equal(parsed.graphPath, fixture.graphPath);
});

test('verify-ticket-closure derives the graph from Tickets.json', () => {
  const fixture = makePackage();
  const parsed = verifyClosure.parseArgs(['--tickets=' + fixture.ticketsPath]);
  assert.equal(parsed.graphPath, fixture.graphPath);
});

test('consolidate-phase-tickets derives the status file from Tickets.json', () => {
  const fixture = makePackage();
  const parsed = consolidate.parseCliArgs([fixture.ticketsPath]);
  assert.equal(parsed.statusPath, fixture.statusPath);
  assert.equal(parsed.error, null);
});

test('the allocate manifest is found from Tickets.json without a registry argument', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'split-workspace-'));
  const fixture = makePackage();
  const packageDirectory = path.join(workspaceRoot, 'crates', 'siprs');
  fs.mkdirSync(path.join(packageDirectory, '..'), { recursive: true });
  fs.cpSync(fixture.directory, packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), '{}');
  fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}');
  const parsed = verifyClosure.parseArgs(['--tickets=' + path.join(packageDirectory, 'Tickets.json')]);
  assert.equal(parsed.registryPath, path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'));
});
