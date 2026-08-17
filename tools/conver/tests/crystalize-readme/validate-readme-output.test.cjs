/**
 * validate-readme-output.test.cjs — Tests for validate-readme-output.js (Contract C005)
 *
 * C005-Pre: README content is a non-empty string.
 * C005-Post: ok=true iff the last section heading is the examples section.
 * C005-Inv: the trailing examples section is required, matched case-insensitively.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-readme-output.js');
const { validateReadmeOutput } = require(SCRIPT);

const VALID_README = [
  '# siprs README',
  '',
  '> 対象 RFC: /path/RFC-ROOT.md',
  '> 生成グラフ: /path/RFC-ROOT-GRAPH.json',
  '',
  '## Overview',
  '',
  '## Usage',
  '',
  '## Examples (implementation samples) spec and design',
  '',
].join('\n');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-vro-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('validateReadmeOutput — C005', () => {
  it('passes when the last section is the examples section and headers are present (C005-Post)', () => {
    const result = validateReadmeOutput(VALID_README);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('fails when the last section is not the examples section', () => {
    const readme = VALID_README.replace('## Examples (implementation samples) spec and design', '## Missing');
    const result = validateReadmeOutput(readme);
    assert.equal(result.ok, false);
  });

  it('fails when the README is empty', () => {
    const result = validateReadmeOutput('');
    assert.equal(result.ok, false);
  });

  it('matches the trailing heading case-insensitively (C005-Inv)', () => {
    const upper = VALID_README.toUpperCase();
    const result = validateReadmeOutput(upper);
    assert.equal(result.ok, true);
  });

  it('fails when a required header field is missing (no target RFC line)', () => {
    const readme = VALID_README.replace('> 対象 RFC: /path/RFC-ROOT.md', '');
    const result = validateReadmeOutput(readme);
    assert.equal(result.ok, false);
  });

  it('fails when a required header field is missing (no graph line)', () => {
    const readme = VALID_README.replace('> 生成グラフ: /path/RFC-ROOT-GRAPH.json', '');
    const result = validateReadmeOutput(readme);
    assert.equal(result.ok, false);
  });

  it('fails when there is no H1 title', () => {
    const readme = VALID_README.replace('# siprs README', 'siprs README');
    const result = validateReadmeOutput(readme);
    assert.equal(result.ok, false);
  });
});

describe('CLI', () => {
  it('exits 0 for a valid README file', () => {
    const filePath = path.join(tmpDir, 'README.md');
    fs.writeFileSync(filePath,VALID_README, 'utf8');
    const result = spawnSync('node', [SCRIPT, `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ok, true);
  });

  it('exits 1 for an invalid README file', () => {
    const filePath = path.join(tmpDir, 'bad-README.md');
    fs.writeFileSync(filePath,'# Only title\n', 'utf8');
    const result = spawnSync('node', [SCRIPT, `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  });

  it('reads README content from stdin', () => {
    const result = spawnSync('node', [SCRIPT], { input: VALID_README, encoding: 'utf8' });
    assert.equal(result.status, 0);
  });
});
