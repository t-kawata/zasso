/**
 * derive-output-paths.test.cjs — Tests for derive-output-paths.js (Contract C001)
 * @verifies C001
 *
 * C001-Pre: sourceFile is a non-empty string, possibly ~/-relative.
 * C001-Post: prints a Markdown report containing Mode (fresh/refine), a path
 *   table, and existence flags; exit 0. --field=sourceFile prints the expanded
 *   sourceFile path.
 * C001-Inv: mode detection is deterministic for a given file state; Markdown
 *   always contains sourceFile / rfcDir / examplesDir / readmePath.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/derive-output-paths.js');
const {
  parseArguments,
  deriveOutputPaths,
  assertSourceFileExists,
  detectMode,
  formatPreflightMarkdown,
} = require(SCRIPT);

const CRYSTALIZE_STATUS_FILENAME = 'CRYSTALIZE-Status.json';

const SAMPLE_PATHS = {
  sourceFile: '/rfc/RFC-ROOT.md',
  rfcDir: '/rfc',
  examplesDir: '/rfc/examples',
  readmePath: '/rfc/README.md',
};

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px155-dop-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeRfcDir(name) {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeGraph(dir, withReadme = false, withStatus = false) {
  const sourceFile = path.join(dir, 'RFC-ROOT.md');
  fs.writeFileSync(sourceFile, '# RFC\n', 'utf8');
  if (withReadme) fs.writeFileSync(path.join(dir, 'README.md'), '# README\n', 'utf8');
  if (withStatus) fs.writeFileSync(path.join(dir, CRYSTALIZE_STATUS_FILENAME), '{}', 'utf8');
  const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
  fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
  return { sourceFile, graphPath };
}

describe('parseArguments', () => {
  it('accepts --graph=<path>', () => {
    assert.deepEqual(parseArguments(['--graph=g.json']), { graphPath: 'g.json', field: undefined });
  });

  it('accepts --graph=<path> --field=sourceFile', () => {
    const parsed = parseArguments(['--graph=g.json', '--field=sourceFile']);
    assert.equal(parsed.field, 'sourceFile');
  });

  it('rejects empty arguments', () => {
    assert.throws(() => parseArguments([]));
  });

  it('rejects an unknown --field', () => {
    assert.throws(() => parseArguments(['--graph=g.json', '--field=bogus']));
  });
});

describe('deriveOutputPaths', () => {
  it('derives the 3 output paths from an absolute sourceFile (no residues dir, PX-156)', () => {
    const sourceFile = path.join(tmpDir, 'nested', 'RFC-ROOT.md');
    const paths = deriveOutputPaths({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] });
    assert.equal(paths.rfcDir, path.dirname(sourceFile));
    assert.equal(paths.examplesDir, path.join(paths.rfcDir, 'examples'));
    assert.equal(paths.readmePath, path.join(paths.rfcDir, 'README.md'));
    assert.ok(!('residuesDir' in paths));
  });

  it('fails on a missing or empty sourceFile', () => {
    assert.throws(() => deriveOutputPaths({ sourceFile: '', mainLanguage: 'rust', nodes: [], edges: [] }));
    assert.throws(() => deriveOutputPaths({ mainLanguage: 'rust', nodes: [], edges: [] }));
  });
});

describe('assertSourceFileExists', () => {
  it('returns the resolved sourceFile when it exists', () => {
    const sourceFile = path.join(tmpDir, 'preflight-exists', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC\n', 'utf8');
    assert.equal(assertSourceFileExists({ sourceFile }), sourceFile);
  });

  it('throws when the sourceFile does not exist', () => {
    const sourceFile = path.join(tmpDir, 'preflight-missing', 'RFC-ROOT.md');
    assert.throws(() => assertSourceFileExists({ sourceFile }), /sourceFile not found/);
  });
});

describe('detectMode — C001', () => {
  it('returns fresh when neither README.md nor CRYSTALIZE-Status.json exists', () => {
    assert.equal(detectMode({ readmeExists: false, statusExists: false }), 'fresh');
  });

  it('returns refine when README.md exists', () => {
    assert.equal(detectMode({ readmeExists: true, statusExists: false }), 'refine');
  });

  it('returns refine when CRYSTALIZE-Status.json exists', () => {
    assert.equal(detectMode({ readmeExists: false, statusExists: true }), 'refine');
  });

  it('returns refine when both exist', () => {
    assert.equal(detectMode({ readmeExists: true, statusExists: true }), 'refine');
  });
});

describe('formatPreflightMarkdown — C001', () => {
  it('prints the Mode line, path table, and existence flags for fresh', () => {
    const md = formatPreflightMarkdown(SAMPLE_PATHS, 'fresh', { readmeExists: false, statusExists: false });
    assert.match(md, /\*\*Mode: fresh\*\*/);
    assert.match(md, /No previous run was detected/);
    assert.ok(md.includes('| readmePath | /rfc/README.md |'));
    assert.ok(md.includes('README.md exists: no'));
    assert.ok(md.includes('CRYSTALIZE-Status.json exists: no'));
  });

  it('prints a refine message when previous artifacts exist', () => {
    const md = formatPreflightMarkdown(SAMPLE_PATHS, 'refine', { readmeExists: true, statusExists: false });
    assert.match(md, /\*\*Mode: refine\*\*/);
    assert.match(md, /A previous \/crystalize-readme run was detected/);
    assert.ok(md.includes('README.md exists: yes'));
  });

  it('always contains the four derived paths (C001-Inv, no residuesDir per PX-156)', () => {
    const md = formatPreflightMarkdown(SAMPLE_PATHS, 'fresh', { readmeExists: false, statusExists: false });
    for (const key of ['sourceFile', 'rfcDir', 'examplesDir', 'readmePath']) {
      assert.ok(md.includes(key), `missing ${key}`);
    }
    assert.ok(!md.includes('residuesDir'));
  });
});

describe('main — CLI', () => {
  it('prints fresh Markdown for a graph with no previous artifacts', () => {
    const dir = makeRfcDir('cli-fresh');
    const { graphPath } = writeGraph(dir);
    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\*\*Mode: fresh\*\*/);
  });

  it('prints refine Markdown when README.md exists', () => {
    const dir = makeRfcDir('cli-refine-readme');
    const { graphPath } = writeGraph(dir, true);
    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\*\*Mode: refine\*\*/);
  });

  it('prints refine Markdown when CRYSTALIZE-Status.json exists', () => {
    const dir = makeRfcDir('cli-refine-status');
    const { graphPath } = writeGraph(dir, false, true);
    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\*\*Mode: refine\*\*/);
  });

  it('--field=sourceFile still prints the expanded sourceFile path', () => {
    const dir = makeRfcDir('cli-field');
    const { sourceFile, graphPath } = writeGraph(dir);
    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`, '--field=sourceFile'], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), sourceFile);
  });

  it('exits 1 with an English error when the sourceFile does not exist', () => {
    const dir = makeRfcDir('cli-missing');
    const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile: path.join(dir, 'RFC-ROOT.md'), mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceFile not found/);
  });
});
