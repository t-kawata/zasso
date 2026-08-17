/**
 * validate-residue-output.test.cjs — Tests for validate-residue-output.js
 *
 * A RESIDUE document requires the 4 header fields (対象 RFC / 生成グラフ /
 * 生成日時 / 判定理由) and a non-empty 未解決インベントリ section where each
 * entry carries id / 要求事項 / 現状 / 証拠 / ステータス.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-residue-output.js');
const { validateResidueOutput } = require(SCRIPT);

const VALID_RESIDUE = [
  '# RESIDUE-20260817120000',
  '',
  '> 対象 RFC: /path/RFC-ROOT.md',
  '> 生成グラフ: /path/RFC-ROOT-GRAPH.json',
  '> 生成日時: 2026-08-17 12:00:00',
  '> 判定理由: unresolvedOmissions, missingExamples',
  '',
  '## 未解決インベントリ',
  '',
  '### R-001 未実装機能',
  '- 要求事項: 機能が要件を満たしていない',
  '- 現状: 【OMISSION】',
  '- 証拠: グラフノード N0001 / sourceRanges RFC-ROOT.md:1-10',
  '- ステータス: open',
  '',
].join('\n');

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-vrso-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('validateResidueOutput', () => {
  it('passes when all 4 header fields and a complete inventory entry are present', () => {
    const result = validateResidueOutput(VALID_RESIDUE);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('fails when a required header field is missing (判定理由)', () => {
    const text = VALID_RESIDUE.replace('> 判定理由: unresolvedOmissions, missingExamples', '');
    const result = validateResidueOutput(text);
    assert.equal(result.ok, false);
  });

  it('fails when the inventory section is missing', () => {
    const text = VALID_RESIDUE.replace('## 未解決インベントリ', '');
    const result = validateResidueOutput(text);
    assert.equal(result.ok, false);
  });

  it('fails when an inventory entry is missing a required field (証拠)', () => {
    const text = VALID_RESIDUE.replace('- 証拠: グラフノード N0001 / sourceRanges RFC-ROOT.md:1-10', '');
    const result = validateResidueOutput(text);
    assert.equal(result.ok, false);
  });
});

describe('CLI', () => {
  it('exits 0 for a valid RESIDUE file', () => {
    const filePath = path.join(tmpDir, 'RESIDUE-20260817120000.md');
    fs.writeFileSync(filePath,VALID_RESIDUE, 'utf8');
    const result = spawnSync('node', [SCRIPT, `--residue=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
  });

  it('exits 1 for an invalid RESIDUE file', () => {
    const filePath = path.join(tmpDir, 'bad-residue.md');
    fs.writeFileSync(filePath,'# only title\n', 'utf8');
    const result = spawnSync('node', [SCRIPT, `--residue=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  });
});
