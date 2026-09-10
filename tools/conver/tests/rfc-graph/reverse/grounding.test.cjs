// P22-14 @verifies C001
/**
 * GF1 — every node of a generated GRAPH resolves to a real file path (§6.6, §6.14.4).
 *
 * The gate exists because a graph can be internally consistent and connected to
 * nothing real: `node.schema.json` carries no file field, so nothing in the graph
 * itself forces a node to name anything that exists. Consistency properties 2 and
 * 3 hold only nominally without this check.
 *
 * A node the run never grounded is not the same claim as a node whose path is
 * missing. Both fail, and both are reported by identifier — a gate that fails
 * without naming the node it failed on cannot be acted on.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  GATE_STATUS,
  GF1_GATE_ID,
  GROUNDING_STAGE,
  assertGrounding,
  buildGroundingCandidate,
  extractGroundingTable,
  renderGroundingReport,
  resolveGroundingTable,
} = require('../../../.claude/scripts/rfc-graph/grounding-check.js');

const { validateAgainstSchema } = require('../../../.claude/scripts/rfc-graph/schema/validate.js');
const { buildNodeIdToPathMap } = require('../../../.claude/scripts/rfc-graph/dump-node-context-to-spec.js');

const SCHEMAS_DIR = path.resolve(__dirname, '../../../.claude/scripts/rfc-graph/schema');
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SUBJECT_ROOT = path.join(PROJECT_ROOT, 'siprs-for-reverse');
const ORACLE_ROOT = path.join(PROJECT_ROOT, 'siprs-with-4layers');
const CLI_PATH = path.join(PROJECT_ROOT, '.claude/scripts/rfc-graph/grounding-check.js');

/** Run the CLI against a temporary workspace and report what it said. */
function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A real temporary root holding the files a grounding table names. */
function withRoot(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'p22-14-grounding-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Write one file under a root, creating the directories it needs. */
function place(root, relativePath, contents = 'pub fn handle() {}\n') {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

/** A graph in the shape `node.schema.json` permits — no file field on a node. */
function graphWith(...nodes) {
  return { sourceFile: '~/RFC-ROOT.md', mainLanguage: 'rust', nodes, edges: [] };
}

const NODE_LIB = {
  id: 'N0001',
  title: '§1 Purpose',
  kind: 'architecture',
  summary: 's',
  slug: 'purpose',
  headingRefs: [{ refId: 'REF001', heading: 2, texts: ['1. 目的'] }],
};
const NODE_REQ = { ...NODE_LIB, id: 'N0007', slug: 'requirements', title: '§5 Requirements' };

describe('GF1 — extractGroundingTable', () => {
  it('carries each node identifier with the path declared for it', () => {
    const table = extractGroundingTable({ nodes: [NODE_LIB, NODE_REQ], declaredFiles: { N0001: 'src/lib.rs' } });

    assert.deepEqual(table, [
      { id: 'N0001', file: 'src/lib.rs' },
      { id: 'N0007', file: null },
    ]);
  });

  it('passes a node with no path through as null rather than dropping it', () => {
    const table = extractGroundingTable({ nodes: [NODE_REQ], declaredFiles: {} });

    assert.equal(table.length, 1, 'a node without a path is still a node the gate must judge');
    assert.equal(table[0].file, null);
  });

  it('refuses a node list that is not a list', () => {
    assert.throws(() => extractGroundingTable({ nodes: null }), /must be a list/);
    assert.throws(() => extractGroundingTable({}), /must be a list/);
  });

  it('is a pure function of its two inputs', () => {
    const nodes = [NODE_LIB];
    const frozen = JSON.parse(JSON.stringify(nodes));

    extractGroundingTable({ nodes, declaredFiles: { N0001: 'src/lib.rs' } });

    assert.deepEqual(nodes, frozen, 'reading a grounding table must not rewrite the graph');
  });
});

describe('GF1 — assertGrounding', () => {
  it('UT-1 passes when every node resolves to a file that exists', () => {
    withRoot((root) => {
      place(root, 'src/lib.rs');

      const record = resolveGroundingTable({
        nodes: extractGroundingTable({ nodes: [NODE_LIB], declaredFiles: { N0001: 'src/lib.rs' } }),
        root,
      });

      assert.equal(record.gateId, GF1_GATE_ID);
      assert.equal(record.status, GATE_STATUS.PASS);
      assert.deepEqual(record.counts, { nodes: 1, unresolvable: 0 });
      assert.match(record.reasons[0], /all 1 node\(s\) resolve to a file that exists on disk/);
    });
  });

  it('UT-4 reports an ungrounded node by its identifier and never passes it silently', () => {
    withRoot((root) => {
      place(root, 'src/lib.rs');

      const record = resolveGroundingTable({
        nodes: [
          { id: 'N0001', file: 'src/lib.rs' },
          { id: 'N0007', file: 'README.md' },
        ],
        root,
      });

      assert.equal(record.status, GATE_STATUS.FAIL);
      assert.deepEqual(record.unresolvable, ['N0007']);
      assert.ok(record.reasons.some((reason) => reason.includes('N0007')), 'the node is named by identifier');
    });
  });

  it('UT-6 reports an unresolvable path with both the node and the attempted path', () => {
    withRoot((root) => {
      const record = resolveGroundingTable({ nodes: [{ id: 'N0007', file: 'README.md' }], root });

      assert.equal(record.status, GATE_STATUS.FAIL);
      assert.ok(
        record.reasons.some((reason) => reason.includes('N0007') && reason.includes('README.md')),
        'a report naming only the node leaves the reader unable to see which path was tried',
      );
    });
  });

  it('names a node that declares no path at all rather than skipping it', () => {
    withRoot((root) => {
      const record = resolveGroundingTable({ nodes: [{ id: 'N0058', file: null }], root });

      assert.equal(record.status, GATE_STATUS.FAIL);
      assert.deepEqual(record.unresolvable, ['N0058']);
      assert.ok(record.reasons.some((reason) => reason.includes('N0058') && /no path was declared/.test(reason)));
    });
  });

  it('resolves through the caller-supplied resolver, so the measured root is not baked in', () => {
    const hits = [];
    const record = assertGrounding({
      nodes: [{ id: 'N0001', file: 'src/lib.rs' }],
      resolveFilePath: (file) => {
        hits.push(file);
        return path.join(PROJECT_ROOT, 'tests', 'fixtures', 'src');
      },
    });

    assert.deepEqual(hits, ['src/lib.rs'], 'the gate asks the resolver about the declared path, once');
    assert.equal(record.status, GATE_STATUS.PASS);
  });

  it('UT-8 fails on an omitted graph, because an omitted graph is not an empty one', () => {
    const record = resolveGroundingTable({ nodes: undefined, root: '.' });

    assert.equal(record.status, GATE_STATUS.FAIL);
    assert.match(record.reasons[0], /no graph node set was supplied/);
  });

  it('UT-8 passes on an empty graph with an explicit empty result rather than a vacuous pass', () => {
    const record = resolveGroundingTable({ nodes: [], root: '.' });

    assert.equal(record.status, GATE_STATUS.PASS);
    assert.deepEqual(record.counts, { nodes: 0, unresolvable: 0 });
    assert.match(record.reasons[0], /all 0 node\(s\) resolve to a file that exists on disk/);
  });

  it('UT-9 accepts a single-node graph', () => {
    withRoot((root) => {
      place(root, 'src/lib.rs');

      const record = resolveGroundingTable({ nodes: [{ id: 'N0001', file: 'src/lib.rs' }], root });

      assert.equal(record.status, GATE_STATUS.PASS);
      assert.deepEqual(record.counts, { nodes: 1, unresolvable: 0 });
    });
  });

  it('UT-12 leaves the node list it judged unchanged', () => {
    const nodes = [
      { id: 'N0001', file: 'src/lib.rs' },
      { id: 'N0007', file: 'README.md' },
    ];
    const frozen = JSON.parse(JSON.stringify(nodes));

    resolveGroundingTable({ nodes, root: PROJECT_ROOT });

    assert.deepEqual(nodes, frozen);
  });
});

describe('GF1 — buildGroundingCandidate', () => {
  it('builds the document `oracle compare --stage grounding` reads', () => {
    const graph = graphWith(NODE_LIB, NODE_REQ);
    const table = extractGroundingTable({ nodes: graph.nodes, declaredFiles: { N0001: 'src/lib.rs' } });

    const candidate = buildGroundingCandidate({ graph, table });

    assert.equal(candidate.stage, GROUNDING_STAGE);
    assert.deepEqual(candidate.corpus, { language: 'rust' });
    assert.deepEqual(candidate.entries, [
      { name: 'N0001', value: '§1 Purpose', grounded: true },
      { name: 'N0007', value: '§5 Requirements', grounded: false },
    ]);
    assert.deepEqual(candidate.unobserved, []);
  });

  it('records an unobserved region rather than letting it read as agreement', () => {
    const region = { region: 'the nodes below §40', stoppedAtPhase: 'GF1', reason: 'the run stopped at §40' };

    const candidate = buildGroundingCandidate({ graph: graphWith(NODE_LIB), table: [], unobserved: [region] });

    assert.deepEqual(candidate.unobserved, [region]);
  });

  it('carries no field that could hold a verdict', () => {
    const candidate = buildGroundingCandidate({ graph: graphWith(NODE_LIB), table: [] });

    assert.deepEqual(Object.keys(candidate).sort(), ['corpus', 'entries', 'stage', 'unobserved']);
  });

  it('says the language it does not know rather than guessing one', () => {
    const candidate = buildGroundingCandidate({ graph: { nodes: [NODE_LIB] }, table: [] });

    assert.deepEqual(candidate.corpus, { language: 'unknown' });
  });
});

describe('GF1 — renderGroundingReport', () => {
  it('names every unresolvable node in the Markdown a human reads', () => {
    withRoot((root) => {
      const record = resolveGroundingTable({ nodes: [{ id: 'N0007', file: 'README.md' }], root });
      const report = renderGroundingReport(record, { root });

      assert.match(report, /GF1/);
      assert.match(report, /FAIL/);
      assert.match(report, /N0007/);
      assert.match(report, /README\.md/);
    });
  });

  it('says plainly that every node resolved when none failed', () => {
    withRoot((root) => {
      place(root, 'src/lib.rs');
      const record = resolveGroundingTable({ nodes: [{ id: 'N0001', file: 'src/lib.rs' }], root });

      assert.match(renderGroundingReport(record, { root }), /PASS/);
    });
  });
});

describe('GF1 — the GRAPH schema is not changed (UT-3)', () => {
  it('keeps additionalProperties false on all three schemas', () => {
    for (const name of ['node.schema.json', 'edge.schema.json', 'graph.schema.json']) {
      const schema = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, name), 'utf8'));
      assert.equal(schema.additionalProperties, false, `${name} must still refuse unknown properties`);
    }
  });

  it('refuses a node carrying the file field this gate resolves elsewhere', () => {
    const withFile = { ...NODE_LIB, file: 'src/lib.rs' };

    assert.equal(validateAgainstSchema(withFile, 'node.schema.json', SCHEMAS_DIR).valid, false);
    assert.equal(validateAgainstSchema(NODE_LIB, 'node.schema.json', SCHEMAS_DIR).valid, true);
  });
});

describe('GF1 — the graph of the subject tree (IT-1, IT-4)', () => {
  const oracleGraphPath = path.join(ORACLE_ROOT, 'RFC-ROOT-GRAPH.json');
  const oracleDirsTreePath = path.join(ORACLE_ROOT, 'RFC-ROOT-Dirs-Tree.json');

  it('IT-1 never reports a node whose declared path exists, and names every one it cannot resolve', () => {
    const graph = JSON.parse(readFileSync(oracleGraphPath, 'utf8'));
    const dirsTree = JSON.parse(readFileSync(oracleDirsTreePath, 'utf8'));
    const declaredFiles = buildNodeIdToPathMap(dirsTree);

    const table = extractGroundingTable({ nodes: graph.nodes, declaredFiles });
    const record = resolveGroundingTable({ nodes: table, root: SUBJECT_ROOT });

    assert.equal(record.counts.nodes, 113, 'the answer key is the frozen 113-node graph');

    // The mapping is asserted to be a real one before anything is concluded from
    // it. A Dirs-Tree read with the wrong `mappedNodeIds` shape yields a map with
    // a single unusable key, and every node then reports "no path declared" —
    // which looks like a finding and is in fact a broken reader.
    assert.ok(Object.keys(declaredFiles).length > 0, 'the Dirs-Tree must map at least one node to a path');
    assert.ok(
      Object.keys(declaredFiles).every((key) => /^N\d{4}$/.test(key)),
      'the map is keyed by node identifier; keys that are not identifiers mean the entries were read wrong',
    );

    // An independent derivation: the gate's verdict is checked against the graph,
    // the Dirs-Tree and the filesystem rather than against the gate's own output.
    const expectedUnresolvable = graph.nodes
      .filter((node) => {
        const declared = declaredFiles[node.id];
        return typeof declared !== 'string' || !existsSync(path.join(SUBJECT_ROOT, declared));
      })
      .map((node) => node.id);

    assert.ok(expectedUnresolvable.length < graph.nodes.length, 'some node must actually ground, or nothing was measured');
    assert.deepEqual(record.unresolvable, expectedUnresolvable);
    assert.ok(
      record.reasons.every((reason) => typeof reason === 'string' && reason.length > 0),
      'an ungrounded node is reported with a reason a reader can act on',
    );
  });

  it('IT-4 compares the grounded node set through P22-2 and reports no verdict', () => {
    const graph = JSON.parse(readFileSync(oracleGraphPath, 'utf8'));
    const table = extractGroundingTable({ nodes: graph.nodes, declaredFiles: {} });

    const candidate = buildGroundingCandidate({ graph, table });

    assert.equal(candidate.entries.length, 113);
    assert.equal('score' in candidate, false);
    assert.equal('passed' in candidate, false);
    assert.equal('verdict' in candidate, false);
  });

  it('IT-4 runs `oracle compare --stage grounding` and lists disagreements rather than a score', () => {
    const graph = JSON.parse(readFileSync(oracleGraphPath, 'utf8'));
    const dirsTree = JSON.parse(readFileSync(oracleDirsTreePath, 'utf8'));
    const table = extractGroundingTable({ nodes: graph.nodes, declaredFiles: buildNodeIdToPathMap(dirsTree) });

    const dir = mkdtempSync(path.join(tmpdir(), 'p22-14-gf1-oracle-'));
    try {
      const candidatePath = path.join(dir, 'grounding.candidate.json');
      writeFileSync(candidatePath, `${JSON.stringify(buildGroundingCandidate({ graph, table }))}\n`);

      const result = require('../../../.claude/scripts/workspacify-reverse/lib/reconcile.mjs').reconcile({
        stage: 'grounding',
        projectRoot: PROJECT_ROOT,
        candidatePath,
      });

      assert.equal(result.stage, 'grounding');
      assert.equal('score' in result, false, 'a comparison yields disagreements, never a score');
      assert.equal('passed' in result, false);
      assert.ok(
        result.disagreements.every((entry) => [
          'missing_from_analysis', 'extra_in_analysis', 'divergent', 'unobserved',
        ].includes(entry.kind)),
        'every disagreement names one of the four kinds, and the fourth is not a disagreement',
      );
      assert.equal(result.disagreements.length, 0, 'the candidate is the answer key itself, so nothing disagrees');
      assert.match(
        result.findings.map((finding) => finding.message).join(' '),
        /contamination signal|scrutinise/i,
        'a zero-disagreement result is reported as a signal to examine, not as accuracy',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('GF1 — the CLI', () => {
  /** A workspace holding a graph, a grounding table and the files the table names. */
  function buildWorkspace({ declaredFiles, placeFiles }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'p22-14-gf1-cli-'));
    const root = path.join(dir, 'tree');
    mkdirSync(root, { recursive: true });
    for (const relativePath of placeFiles) {
      place(root, relativePath);
    }

    const graphPath = path.join(dir, 'GRAPH.json');
    const tablePath = path.join(dir, 'GROUNDING.json');
    writeFileSync(graphPath, `${JSON.stringify(graphWith(NODE_LIB, NODE_REQ))}\n`);
    writeFileSync(tablePath, `${JSON.stringify(declaredFiles)}\n`);

    return { dir, root, graphPath, tablePath, outPath: path.join(dir, 'candidate.json') };
  }

  it('exits 0, prints PASS, and writes the candidate document', () => {
    // Both nodes are grounded, so the run has nothing to report and the
    // candidate document is what proves it still judged the whole graph.
    const workspace = buildWorkspace({
      declaredFiles: { N0001: 'src/lib.rs', N0007: 'src/requirements.rs' },
      placeFiles: ['src/lib.rs', 'src/requirements.rs'],
    });
    try {
      const result = runCli([
        `--graph=${workspace.graphPath}`,
        `--grounding=${workspace.tablePath}`,
        `--root=${workspace.root}`,
        `--out=${workspace.outPath}`,
      ]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS/);
      const candidate = JSON.parse(readFileSync(workspace.outPath, 'utf8'));
      assert.equal(candidate.stage, 'grounding');
      assert.deepEqual(candidate.entries.map((entry) => entry.name), ['N0001', 'N0007']);
    } finally {
      rmSync(workspace.dir, { recursive: true, force: true });
    }
  });

  it('exits 1 and names the node when one cannot be grounded', () => {
    const workspace = buildWorkspace({ declaredFiles: { N0001: 'src/lib.rs', N0007: 'README.md' }, placeFiles: ['src/lib.rs'] });
    try {
      const result = runCli([`--graph=${workspace.graphPath}`, `--grounding=${workspace.tablePath}`, `--root=${workspace.root}`]);

      assert.equal(result.status, 1, 'an ungrounded node is not a passing run');
      assert.match(result.stdout, /N0007/);
      assert.match(result.stdout, /README\.md/);
    } finally {
      rmSync(workspace.dir, { recursive: true, force: true });
    }
  });

  it('exits 2 on usage, and 1 with the 3-line template when the graph is unreadable', () => {
    assert.equal(runCli([]).status, 2);

    const missing = runCli([`--graph=${path.join(tmpdir(), 'p22-14-absent.json')}`, `--root=${PROJECT_ROOT}`]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /^\[ERROR\] /);
    assert.match(missing.stderr, /\nCause: /);
    assert.match(missing.stderr, /\nAction: /);
  });

  it('reads the grounding table from a Dirs-Tree when one is supplied instead', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p22-14-gf1-dirs-'));
    try {
      const root = path.join(dir, 'tree');
      place(root, 'src/lib.rs');
      const graphPath = path.join(dir, 'GRAPH.json');
      const dirsTreePath = path.join(dir, 'Dirs-Tree.json');
      writeFileSync(graphPath, `${JSON.stringify(graphWith(NODE_LIB))}\n`);
      writeFileSync(dirsTreePath, `${JSON.stringify({
        trees: { rust: { name: 'src', type: 'directory', children: [
          { name: 'lib.rs', type: 'file', mappedNodeIds: [{ nodeId: 'N0001', title: '§1 Purpose' }] },
        ] } },
      })}\n`);

      const result = runCli([`--graph=${graphPath}`, `--dirs-tree=${dirsTreePath}`, `--root=${root}`]);

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
