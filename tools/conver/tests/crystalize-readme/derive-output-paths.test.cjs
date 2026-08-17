/**
 * derive-output-paths.test.cjs — Tests for derive-output-paths.js (Contract C001)
 *
 * C001-Pre: sourceFile is a non-empty string, possibly ~/-relative.
 * C001-Post: prints {rfcDir, examplesDir, residuesDir, readmePath, residuePath}.
 * C001-Inv: examplesDir and residuesDir always live under rfcDir.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/derive-output-paths.js');
const { parseArguments, deriveOutputPaths } = require(SCRIPT);

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
  it('derives all 5 paths from an absolute sourceFile (C001-Post)', () => {
    const sourceFile = path.join(tmpDir, 'nested', 'RFC-ROOT.md');
    const paths = deriveOutputPaths({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] });
    assert.equal(paths.rfcDir, path.dirname(sourceFile));
    assert.equal(paths.examplesDir, path.join(paths.rfcDir, 'examples'));
    assert.equal(paths.residuesDir, path.join(paths.rfcDir, 'residues'));
    assert.equal(paths.readmePath, path.join(paths.rfcDir, 'README.md'));
    assert.equal(paths.residuePath, path.join(paths.residuesDir, 'RESIDUE-<YYYYMMDDhhmmss>.md'));
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
