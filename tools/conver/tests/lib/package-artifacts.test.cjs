// The pipeline fixes artifact names. This module holds that convention once so each
// script derives its inputs instead of asking the operator to spell them a second time.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deriveGraphPathFromDoc,
  deriveDirsTreePathFromDoc,
  deriveDirsTreePathFromGraph,
  deriveTicketsPathFromDoc,
  deriveStatusPathFromDoc,
  findSingleSiblingPath,
  deriveGraphPathFromTickets,
  deriveDirsTreePathFromTickets,
  deriveStatusPathFromTickets,
  findAllocateManifest,
} = require('../../.claude/scripts/lib/package-artifacts.js');

function makePackage() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifacts-'));
  const docPath = path.join(directory, 'RFC-ROOT.md');
  fs.writeFileSync(docPath, '# RFC\n');
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-Dirs-Tree.json'), '{}');
  fs.writeFileSync(path.join(directory, 'RFC-ROOT-SPLIT-Status.json'), '{}');
  fs.writeFileSync(path.join(directory, 'Tickets.json'), '{"phases":[]}');
  return { directory, docPath };
}

test('the RFC path determines the graph and the Dirs-Tree beside it', () => {
  const { directory, docPath } = makePackage();
  assert.equal(deriveGraphPathFromDoc(docPath), path.join(directory, 'RFC-ROOT-GRAPH.json'));
  assert.equal(deriveDirsTreePathFromDoc(docPath), path.join(directory, 'RFC-ROOT-Dirs-Tree.json'));
});

test('the graph path determines the Dirs-Tree by suffix replacement', () => {
  const graphPath = '/work/pkg/RFC-ROOT-GRAPH.json';
  assert.equal(deriveDirsTreePathFromGraph(graphPath), '/work/pkg/RFC-ROOT-Dirs-Tree.json');
});

test('the RFC path determines Tickets.json and the SPLIT status file', () => {
  const { directory, docPath } = makePackage();
  assert.equal(deriveTicketsPathFromDoc(docPath), path.join(directory, 'Tickets.json'));
  assert.equal(deriveStatusPathFromDoc(docPath), path.join(directory, 'RFC-ROOT-SPLIT-Status.json'));
});

test('the Tickets path determines its graph, Dirs-Tree and status siblings', () => {
  const { directory } = makePackage();
  const ticketsPath = path.join(directory, 'Tickets.json');
  assert.equal(deriveGraphPathFromTickets(ticketsPath), path.join(directory, 'RFC-ROOT-GRAPH.json'));
  assert.equal(deriveDirsTreePathFromTickets(ticketsPath), path.join(directory, 'RFC-ROOT-Dirs-Tree.json'));
  assert.equal(deriveStatusPathFromTickets(ticketsPath), path.join(directory, 'RFC-ROOT-SPLIT-Status.json'));
});

test('two candidates for one suffix are not guessed', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifacts-ambiguous-'));
  fs.writeFileSync(path.join(directory, 'A-GRAPH.json'), '{}');
  fs.writeFileSync(path.join(directory, 'B-GRAPH.json'), '{}');
  assert.equal(findSingleSiblingPath(directory, '-GRAPH.json'), null);
  assert.equal(deriveGraphPathFromTickets(path.join(directory, 'Tickets.json')), null);
});

test('the allocate manifest is found at the nearest ancestor holding both manifests', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifacts-workspace-'));
  const packageDirectory = path.join(workspaceRoot, 'crates', 'siprs');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-TREE-MANIFEST.json'), '{}');
  fs.writeFileSync(path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}');
  assert.equal(
    findAllocateManifest(packageDirectory),
    path.join(workspaceRoot, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'),
  );
});

test('an ancestor holding only one of the two manifests is not a workspace root', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'package-artifacts-partial-'));
  const child = path.join(parent, 'pkg');
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(parent, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), '{}');
  assert.equal(findAllocateManifest(child), null);
});
