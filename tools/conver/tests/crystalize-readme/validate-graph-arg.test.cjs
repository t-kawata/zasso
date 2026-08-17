/**
 * validate-graph-arg.test.cjs — Tests for validate-graph-arg.js
 *
 * Covers argument parsing, path resolution, graph reading, and schema
 * validation (graph.schema.json). Exit-code contract:
 *   argument syntax errors -> exit 2, input data errors -> exit 1.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-graph-arg.js');
const {
  parseArguments,
  resolveGraphPath,
  readGraphFile,
  validateGraphSchema,
  validateGraphArgument,
  EXIT_ARG_ERROR,
  EXIT_DATA_ERROR,
} = require(SCRIPT);

let tmpDir;
let validGraphPath;
let malformedPath;
let missingPath;
const validGraph = {
  sourceFile: '/tmp/rfc/RFC-ROOT.md',
  mainLanguage: 'rust',
  nodes: [],
  edges: [],
};

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-vga-'));
  validGraphPath = path.join(tmpDir, 'valid-graph.json');
  malformedPath = path.join(tmpDir, 'malformed.json');
  missingPath = path.join(tmpDir, 'missing.json');
  fs.writeFileSync(validGraphPath, JSON.stringify(validGraph), 'utf8');
  fs.writeFileSync(malformedPath, '{ not valid json', 'utf8');
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('parseArguments', () => {
  it('accepts --graph=<path>', () => {
    assert.deepEqual(parseArguments(['--graph=foo.json']), { graphPath: 'foo.json' });
  });

  it('rejects empty argument list', () => {
    assert.throws(() => parseArguments([]));
  });

  it('rejects a non --graph flag', () => {
    assert.throws(() => parseArguments(['--source=foo']));
  });

  it('rejects an empty --graph value', () => {
    assert.throws(() => parseArguments(['--graph=']));
  });

  it('rejects excess arguments', () => {
    assert.throws(() => parseArguments(['--graph=a', '--graph=b']));
  });
});

describe('resolveGraphPath', () => {
  it('resolves a relative path against process.cwd()', () => {
    const resolved = resolveGraphPath('relative/graph.json');
    assert.equal(resolved, path.resolve(process.cwd(), 'relative/graph.json'));
  });

  it('passes an absolute path through unchanged', () => {
    const abs = '/abs/graph.json';
    assert.equal(resolveGraphPath(abs), abs);
  });
});

describe('readGraphFile', () => {
  it('parses a valid graph JSON file', () => {
    const graph = readGraphFile(validGraphPath);
    assert.equal(graph.sourceFile, validGraph.sourceFile);
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.edges));
  });

  it('throws on a non-existent path', () => {
    assert.throws(() => readGraphFile(missingPath));
  });

  it('throws on malformed JSON', () => {
    assert.throws(() => readGraphFile(malformedPath));
  });
});

describe('validateGraphSchema', () => {
  it('accepts a schema-valid graph', () => {
    const result = validateGraphSchema(validGraph);
    assert.equal(result.valid, true);
  });

  it('rejects a graph missing required sourceFile', () => {
    const { sourceFile, ...rest } = validGraph;
    const result = validateGraphSchema(rest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('sourceFile')));
  });

  it('rejects a graph missing nodes', () => {
    const { nodes, ...rest } = validGraph;
    const result = validateGraphSchema(rest);
    assert.equal(result.valid, false);
  });

  it('rejects a graph missing edges', () => {
    const { edges, ...rest } = validGraph;
    const result = validateGraphSchema(rest);
    assert.equal(result.valid, false);
  });

  it('rejects a node with an invalid id pattern', () => {
    const bad = {
      ...validGraph,
      nodes: [{ id: 'N01', title: 't', kind: 'requirement', summary: 's', headingRefs: [], slug: 'n01' }],
    };
    const result = validateGraphSchema(bad);
    assert.equal(result.valid, false);
  });

  it('accepts an empty nodes array (empty graph is a valid input)', () => {
    const result = validateGraphSchema(validGraph);
    assert.equal(result.valid, true);
  });
});

describe('validateGraphArgument', () => {
  it('returns {ok:true, graph} for a valid graph file', () => {
    const result = validateGraphArgument(validGraphPath);
    assert.equal(result.ok, true);
    assert.equal(result.graph.sourceFile, validGraph.sourceFile);
  });

  it('throws on a non-existent graph file', () => {
    assert.throws(() => validateGraphArgument(missingPath));
  });

  it('throws on malformed JSON', () => {
    assert.throws(() => validateGraphArgument(malformedPath));
  });

  it('throws on a schema violation (missing sourceFile)', () => {
    const bad = { mainLanguage: 'rust', nodes: [], edges: [] };
    const badPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify(bad), 'utf8');
    assert.throws(() => validateGraphArgument(badPath));
  });
});

describe('CLI exit-code contract', () => {
  it('exits 0 and prints {ok:true, graph} for a valid graph', () => {
    const result = spawnSync('node', [SCRIPT, `--graph=${validGraphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.graph.sourceFile, validGraph.sourceFile);
  });

  it('exits 2 on an argument syntax error (missing --graph)', () => {
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    assert.equal(result.status, EXIT_ARG_ERROR);
    assert.equal(result.status, 2);
  });

  it('exits 1 on a data error (non-existent file)', () => {
    const result = spawnSync('node', [SCRIPT, `--graph=${missingPath}`], { encoding: 'utf8' });
    assert.equal(result.status, EXIT_DATA_ERROR);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(missingPath));
  });

  it('exits 1 on malformed JSON', () => {
    const result = spawnSync('node', [SCRIPT, `--graph=${malformedPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  });

  it('exits 1 on a schema violation', () => {
    const bad = { mainLanguage: 'rust', nodes: [], edges: [] };
    const badPath = path.join(tmpDir, 'bad-cli.json');
    fs.writeFileSync(badPath, JSON.stringify(bad), 'utf8');
    const result = spawnSync('node', [SCRIPT, `--graph=${badPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  });
});
