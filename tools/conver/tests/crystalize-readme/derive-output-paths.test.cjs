/**
 * derive-output-paths.test.cjs — Tests for derive-output-paths.js (Contract C001)
 *
 * C001-Pre: sourceFile is a non-empty string, possibly ~/-relative.
 * C001-Post: deriveOutputPaths prints {rfcDir, examplesDir, residuesDir, readmePath}.
 * C001-Inv: examplesDir and residuesDir always live under rfcDir.
 *
 * Preflight contract (C001-preflight): the CLI (main) fails with exit 1 when the
 * graph's sourceFile RFC document does not exist on disk, and prints
 * {sourceFile, rfcDir, examplesDir, residuesDir, readmePath} when it does, so
 * Step 0 can read the RFC design documents from the verified sourceFile.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/derive-output-paths.js');
const { parseArguments, deriveOutputPaths, assertSourceFileExists } = require(SCRIPT);

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-dop-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

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

describe('deriveOutputPaths — C001', () => {
  it('derives the 4 output paths from an absolute sourceFile (C001-Post)', () => {
    const sourceFile = path.join(tmpDir, 'nested', 'RFC-ROOT.md');
    const paths = deriveOutputPaths({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] });
    assert.equal(paths.rfcDir, path.dirname(sourceFile));
    assert.equal(paths.examplesDir, path.join(paths.rfcDir, 'examples'));
    assert.equal(paths.residuesDir, path.join(paths.rfcDir, 'residues'));
    assert.equal(paths.readmePath, path.join(paths.rfcDir, 'README.md'));
  });

  it('expands a home-relative sourceFile via fromHomeRelative() BEFORE dirname (C001-Pre)', () => {
    const homeRel = '~/shyme/zasso/crates/siprs/RFC-ROOT.md';
    const paths = deriveOutputPaths({ sourceFile: homeRel, mainLanguage: 'rust', nodes: [], edges: [] });
    assert.equal(paths.rfcDir, path.dirname(path.resolve(os.homedir(), 'shyme/zasso/crates/siprs/RFC-ROOT.md')));
    assert.equal(paths.rfcDir, path.join(os.homedir(), 'shyme', 'zasso', 'crates', 'siprs'));
  });

  it('keeps examplesDir and residuesDir under rfcDir for a nested sourceFile (C001-Inv)', () => {
    const sourceFile = path.join(tmpDir, 'a', 'b', 'c', 'RFC-ROOT.md');
    const paths = deriveOutputPaths({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] });
    assert.equal(path.dirname(paths.examplesDir), paths.rfcDir);
    assert.equal(path.dirname(paths.residuesDir), paths.rfcDir);
  });

  it('fails on an empty sourceFile string', () => {
    assert.throws(() => deriveOutputPaths({ sourceFile: '', mainLanguage: 'rust', nodes: [], edges: [] }));
  });

  it('fails on a missing sourceFile', () => {
    assert.throws(() => deriveOutputPaths({ mainLanguage: 'rust', nodes: [], edges: [] }));
  });

  it('fails on a non-string sourceFile', () => {
    assert.throws(() => deriveOutputPaths({ sourceFile: 42, mainLanguage: 'rust', nodes: [], edges: [] }));
  });
});

describe('assertSourceFileExists — Preflight sourceFile check', () => {
  it('passes when the sourceFile RFC document exists on disk', () => {
    const sourceFile = path.join(tmpDir, 'preflight-exists', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC-ROOT\n', 'utf8');
    assert.doesNotThrow(() => assertSourceFileExists({ sourceFile }));
  });

  it('returns the resolved sourceFile path so Step 0 can read it', () => {
    const sourceFile = path.join(tmpDir, 'preflight-return', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC-ROOT\n', 'utf8');
    const resolved = assertSourceFileExists({ sourceFile });
    assert.equal(resolved, sourceFile);
  });

  it('fails when the sourceFile RFC document does not exist on disk', () => {
    const sourceFile = path.join(tmpDir, 'preflight-missing', 'RFC-ROOT.md');
    assert.throws(() => assertSourceFileExists({ sourceFile }), /sourceFile not found/);
  });

  it('fails on a missing sourceFile field', () => {
    assert.throws(() => assertSourceFileExists({ nodes: [], edges: [] }));
  });

  it('fails on a non-string sourceFile', () => {
    assert.throws(() => assertSourceFileExists({ sourceFile: 42 }));
  });
});

describe('main — CLI Preflight', () => {
  it('prints the derived paths and exits 0 when the graph and sourceFile exist', () => {
    const dir = path.join(tmpDir, 'cli-ok');
    fs.mkdirSync(dir, { recursive: true });
    const sourceFile = path.join(dir, 'RFC-ROOT.md');
    fs.writeFileSync(sourceFile, '# RFC-ROOT\n', 'utf8');
    const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');

    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const paths = JSON.parse(result.stdout.trim());
    assert.equal(paths.sourceFile, sourceFile);
    assert.equal(paths.rfcDir, dir);
    assert.equal(paths.readmePath, path.join(dir, 'README.md'));
  });

  it('exits 1 when the sourceFile does not exist', () => {
    const dir = path.join(tmpDir, 'cli-missing');
    fs.mkdirSync(dir, { recursive: true });
    const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(
      graphPath,
      JSON.stringify({ sourceFile: path.join(dir, 'RFC-ROOT.md'), mainLanguage: 'rust', nodes: [], edges: [] }),
      'utf8'
    );

    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceFile not found/);
  });
});
