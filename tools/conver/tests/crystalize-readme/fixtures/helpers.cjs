/**
 * helpers.cjs — Fixture builders and materializers for crystalize-readme tests
 *
 * Builds schema-valid graph JSON objects (graph.schema.json) and materializes
 * them into a temporary RFC directory with RFC-ROOT.md, examples/, omissions/
 * and CRYSTALIZE-Status.json so the 4 branch conditions of
 * check-readme-writable.js are independently controllable.
 */

const fs = require('fs');
const path = require('path');

const HEADINGS = [
  '## Overview',
  '## Usage',
  '## Examples (implementation samples) spec and design',
];

/** Build a schema-valid node. slug is derived from id (Nxxxx -> nxxxx). */
function makeNode(id, title, kind, headingText) {
  return {
    id,
    title,
    kind,
    summary: `Summary of ${title}`,
    headingRefs: headingText
      ? [{ refId: 'REF' + String(Number(id.slice(1))).padStart(3, '0'), heading: 2, texts: [headingText] }]
      : [],
    slug: id.toLowerCase(),
  };
}

/** Build a schema-valid edge. */
function makeEdge(from, to, type = 'references') {
  return {
    from,
    to,
    type,
    attributes: { strength: 'soft', bidirectional: false, note: '' },
    contracts: [],
  };
}

/** Valid graph: 3 nodes covering the 3 level-2 headings, all connected. */
function buildValidGraph(sourceFile) {
  return {
    sourceFile,
    mainLanguage: 'rust',
    nodes: [
      makeNode('N0001', 'Overview', 'requirement', 'Overview'),
      makeNode('N0002', 'Usage', 'api_contract', 'Usage'),
      makeNode('N0003', 'Examples (implementation samples) spec and design', 'glossary', 'Examples (implementation samples) spec and design'),
    ],
    edges: [makeEdge('N0001', 'N0002'), makeEdge('N0002', 'N0003')],
  };
}

/** Empty graph: no nodes, no edges. RFC-ROOT.md carries no level-2 headings. */
function buildEmptyGraph(sourceFile) {
  return { sourceFile, mainLanguage: 'rust', nodes: [], edges: [] };
}

/** Broken verification graph: valid graph plus an isolated node with no edges. */
function buildBrokenVerificationGraph(sourceFile) {
  const graph = buildValidGraph(sourceFile);
  graph.nodes.push(makeNode('N0004', 'Orphan Node', 'rationale', null));
  return graph;
}

/**
 * Materialize a graph into a fresh temp directory under baseDir.
 *
 * @param {string} baseDir — Parent temp directory (created by the test)
 * @param {object} graph — Graph object whose sourceFile must be <baseDir>/RFC-ROOT.md
 * @param {object} [opts] — { withExamples, withOmissions, grillApproved, omitGrill }
 * @returns {{ dir, sourceFile, graphPath, rfcDir, examplesDir, residuesDir, statusPath }}
 */
function materializeFixture(baseDir, graph, opts = {}) {
  const {
    withExamples = true,
    withOmissions = false,
    grillApproved = true,
    omitGrill = false,
  } = opts;

  fs.mkdirSync(baseDir, { recursive: true });
  const sourceFile = path.join(baseDir, 'RFC-ROOT.md');
  const graphPath = path.join(baseDir, 'RFC-ROOT-GRAPH.json');

  // RFC-ROOT.md — level-2 headings only for the valid graph; empty otherwise
  const hasHeadings = graph.nodes.length > 0;
  const mdLines = ['# RFC Root', ''];
  if (hasHeadings) mdLines.push(...HEADINGS);
  fs.writeFileSync(sourceFile, mdLines.join('\n') + '\n', 'utf8');

  // graph JSON with sourceFile pointing into the fixture dir
  const fixtureGraph = { ...graph, sourceFile };
  fs.writeFileSync(graphPath, JSON.stringify(fixtureGraph, null, 2), 'utf8');

  // examples/
  const examplesDir = path.join(baseDir, 'examples');
  if (withExamples) {
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.writeFileSync(path.join(examplesDir, 'sample.rs'), '// sample implementation\n', 'utf8');
  }

  // omissions/
  if (withOmissions) {
    const omissionsDir = path.join(baseDir, 'omissions');
    fs.mkdirSync(omissionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(omissionsDir, 'OMISSIONS-20260817120000.json'),
      JSON.stringify({
        parentRfcPath: sourceFile,
        generatedAt: '2026-08-17',
        omissions: [
          {
            id: 'O-001',
            type: 'missing_implementation',
            severity: 'high',
            description: 'A required feature is missing',
          },
        ],
      }, null, 2),
      'utf8'
    );
  }

  // CRYSTALIZE-Status.json
  if (!omitGrill) {
    const status = {
      sourceFile,
      graphFile: graphPath,
      currentStep: 4,
      steps: { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done' },
      grill: { tocApproved: grillApproved, examplesApproved: grillApproved },
    };
    fs.writeFileSync(path.join(baseDir, 'CRYSTALIZE-Status.json'), JSON.stringify(status, null, 2), 'utf8');
  }

  return {
    dir: baseDir,
    sourceFile,
    graphPath,
    rfcDir: baseDir,
    examplesDir,
    residuesDir: path.join(baseDir, 'residues'),
    statusPath: path.join(baseDir, 'CRYSTALIZE-Status.json'),
  };
}

/** Remove a materialized fixture directory recursively. */
function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  HEADINGS,
  makeNode,
  makeEdge,
  buildValidGraph,
  buildEmptyGraph,
  buildBrokenVerificationGraph,
  materializeFixture,
  rmrf,
};
