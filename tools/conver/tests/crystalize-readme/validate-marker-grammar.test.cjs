/**
 * validate-marker-grammar.test.cjs — Tests for validate-marker-grammar.js (PX-156, C001/C002/C003)
 *
 * The 4-marker grammar: usage sections carry <::TEMPLATE-README::> (work unit)
 * or <::README-RESIDUE::> (residue); the examples section carries
 * <::TEMPLATE-EXAMPLES::> or <::EXAMPLES-RESIDUE::>. Cross-contamination and
 * dual markers are structure violations.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
  splitSections,
  validateMarkerGrammar,
} = require(SCRIPT);

const EXAMPLES_HEADING = '## Examples (implementation samples) spec and design';

function readmeWith(...sectionTexts) {
  return ['# siprs README', '', '> 対象 RFC: /path/RFC-ROOT.md', '> 生成グラフ: /path/RFC-ROOT-GRAPH.json', '', ...sectionTexts].join('\n');
}

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-vmg-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('marker constants — C001/C003', () => {
  it('exposes the four distinct marker strings', () => {
    const set = new Set([
      MARKER_TEMPLATE_README,
      MARKER_README_RESIDUE,
      MARKER_TEMPLATE_EXAMPLES,
      MARKER_EXAMPLES_RESIDUE,
    ]);
    assert.equal(set.size, 4);
  });
});

describe('splitSections', () => {
  it('splits a README into sections by heading lines', () => {
    const text = `# Top\n\n## A\n\ntextA\n\n## B\n\ntextB`;
    const sections = splitSections(text);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].headingText, 'Top');
    assert.equal(sections[1].headingText, 'A');
    assert.equal(sections[2].headingText, 'B');
  });

  it('records heading levels from the markdown hashes', () => {
    const text = `# Top\n## Mid\n### Leaf`;
    const sections = splitSections(text);
    assert.deepEqual(sections.map((s) => s.headingLevel), [1, 2, 3]);
  });

  it('captures the body lines after each heading', () => {
    const text = `# Top\n\n${MARKER_TEMPLATE_README}`;
    const sections = splitSections(text);
    assert.ok(sections[0].body.join('\n').includes(MARKER_TEMPLATE_README));
  });
});

describe('validateMarkerGrammar — C001', () => {
  it('accepts a fully-written README with zero markers (complete sections)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample code.`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, true);
    assert.equal(result.templateCount, 0);
  });

  it('accepts a pending usage section carrying TEMPLATE-README (work unit)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, true);
    assert.equal(result.templateCount, 2);
  });

  it('accepts a residue usage section carrying README-RESIDUE (C001-Post)', () => {
    const text = readmeWith(`## A\n\n${MARKER_README_RESIDUE} evidence`, `${EXAMPLES_HEADING}\n\nSample.`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, true);
    assert.equal(result.templateCount, 0);
  });

  it('accepts an examples section carrying EXAMPLES-RESIDUE (C003-Post)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_EXAMPLES_RESIDUE} examples/ missing`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, true);
  });

  it('rejects a usage section carrying an EXAMPLES marker (cross-contamination)', () => {
    const text = readmeWith(`## A\n\n${MARKER_EXAMPLES_RESIDUE}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /cross-contamination/i.test(e)));
  });

  it('rejects an examples section carrying a README marker (cross-contamination)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_README_RESIDUE} evidence`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /cross-contamination/i.test(e)));
  });

  it('rejects a section carrying both a work-unit and a residue marker (C001-Inv)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}\n\n${MARKER_README_RESIDUE}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /both/i.test(e)));
  });

  it('rejects a section carrying more than one marker of the same kind', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, false);
  });

  it('rejects a marker appearing before the first heading', () => {
    const text = `${MARKER_TEMPLATE_README}\n\n# siprs README`;
    const result = validateMarkerGrammar(text);
    assert.equal(result.ok, false);
  });
});

describe('CLI', () => {
  it('exits 0 for a grammar-valid README file', () => {
    const filePath = path.join(tmpDir, 'README.md');
    fs.writeFileSync(filePath, readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample.`), 'utf8');
    const result = spawnSync('node', [SCRIPT, `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ok, true);
  });

  it('exits 1 for a grammar-invalid README file', () => {
    const filePath = path.join(tmpDir, 'bad-README.md');
    fs.writeFileSync(filePath, readmeWith(`## A\n\n${MARKER_EXAMPLES_RESIDUE}`, `${EXAMPLES_HEADING}\n\nSample.`), 'utf8');
    const result = spawnSync('node', [SCRIPT, `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
  });
});
