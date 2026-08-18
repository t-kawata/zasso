/**
 * loop-drive-readme.test.cjs — Tests for loop-drive-readme.js (PX-156, Step 2 loop driver)
 *
 * The independent loop-driving script scans README.md markers by heading, reports
 * unresolved sections, verifies the loop exit condition (zero TEMPLATE markers;
 * every section complete or residue), and applies per-section transitions.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/loop-drive-readme.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
} = require(path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js'));
const {
  parseArguments,
  scanMarkers,
  checkLoopReady,
  resolveSection,
  markResidue,
  deriveReadmePath,
  updateSectionState,
  scanExamplesState,
  markExamplesResidue,
  checkExamplesReady,
} = require(SCRIPT);

const EXAMPLES_HEADING = '## Examples (implementation samples) spec and design';

/** Natural-language English output is pure ASCII */
const ASCII = /^[\x00-\x7F]*$/;

function readmeWith(...sectionTexts) {
  return ['# siprs README', '', '> 対象 RFC: /path/RFC-ROOT.md', '> 生成グラフ: /path/RFC-ROOT-GRAPH.json', '', ...sectionTexts].join('\n');
}

/**
 * Materialize a graph + status + README in a subdirectory so the CLI can derive
 * the README path internally (rfcDir = dirname(status.sourceFile)).
 */
function materialize(dirName, readmeText, tocNodes = []) {
  const dir = path.join(tmpDir, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const sourceFile = path.join(dir, 'RFC-ROOT.md');
  fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'README.md'), readmeText, 'utf8');
  const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
  fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
  fs.writeFileSync(path.join(dir, 'CRYSTALIZE-Status.json'), JSON.stringify({
    sourceFile,
    graphFile: graphPath,
    currentStep: 2,
    steps: {},
    grill: { tocApproved: true, examplesApproved: false, toc: { nodes: tocNodes }, sections: [] },
  }), 'utf8');
  return { dir, sourceFile, graphPath, readmePath: path.join(dir, 'README.md') };
}

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-ldr-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('scanMarkers', () => {
  it('classifies pending / complete / residue sections and counts templates', () => {
    const text = readmeWith(
      `## A\n\n${MARKER_TEMPLATE_README}`,
      `## B\n\nComplete prose.`,
      `## C\n\n${MARKER_README_RESIDUE} evidence`,
      `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`
    );
    const scan = scanMarkers(text);
    assert.deepEqual(scan.pending, ['A']);
    assert.deepEqual(scan.complete, ['B']);
    assert.deepEqual(scan.residue, ['C']);
    assert.equal(scan.templateCount, 2);
  });
});

describe('checkLoopReady — C002', () => {
  it('is not ready while a TEMPLATE-README remains (C002-Pre)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const verdict = checkLoopReady(text);
    assert.equal(verdict.ready, false);
    assert.deepEqual(verdict.unresolved, ['A']);
  });

  it('is ready when zero TEMPLATE markers remain and only complete|residue sections exist (C002-Post)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_EXAMPLES_RESIDUE} examples/ missing`);
    const verdict = checkLoopReady(text);
    assert.equal(verdict.ready, true);
    assert.deepEqual(verdict.unresolved, []);
  });

  it('is not ready when a usage section carries an EXAMPLES marker (cross-contamination)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_EXAMPLES}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const verdict = checkLoopReady(text);
    assert.equal(verdict.ready, false);
    assert.deepEqual(verdict.unresolved, []);
    assert.ok(verdict.violations.some((v) => /cross-contamination/i.test(v)), 'reports the grammar violation');
  });
});

describe('resolveSection — C001 complete branch', () => {
  it('replaces the section body and removes the TEMPLATE-README marker', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const out = resolveSection(readme, 'A', `## A\n\nComplete usage prose.`);
    assert.ok(!out.includes(MARKER_TEMPLATE_README));
    assert.ok(out.includes('Complete usage prose.'));
  });

  it('leaves other sections untouched', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `## B\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = resolveSection(readme, 'A', `## A\n\nDone.`);
    assert.ok(out.includes(`## B\n\n${MARKER_TEMPLATE_README}`));
  });

  it('throws when the section heading does not exist', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    assert.throws(() => resolveSection(readme, 'Nope', '## Nope\n\nX.'), /not found/);
  });
});

describe('markResidue — C001 residue branch', () => {
  it('replaces the TEMPLATE-README marker with README-RESIDUE plus evidence (C001-Post)', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = markResidue(readme, 'A', 'Evidence: spec missing; reinforcement: add API.');
    assert.ok(!out.includes(MARKER_TEMPLATE_README));
    assert.ok(out.includes(MARKER_README_RESIDUE));
    assert.ok(out.includes('Evidence: spec missing; reinforcement: add API.'));
  });

  it('keeps the original heading level in the residue section', () => {
    const readme = readmeWith(`### A-1\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = markResidue(readme, 'A-1', 'evidence');
    assert.ok(out.includes(`### A-1\n\n${MARKER_README_RESIDUE}`));
  });
});

describe('parseArguments', () => {
  it('parses --graph with --check', () => {
    const parsed = parseArguments([`--graph=${path.join(tmpDir, 'g.json')}`, '--check']);
    assert.equal(parsed.graphPath, path.join(tmpDir, 'g.json'));
    assert.equal(parsed.check, true);
    assert.equal(parsed.list, false);
  });

  it('parses --status with --list', () => {
    const parsed = parseArguments([`--status=${path.join(tmpDir, 'CRYSTALIZE-Status.json')}`, '--list']);
    assert.equal(parsed.statusPath, path.join(tmpDir, 'CRYSTALIZE-Status.json'));
    assert.equal(parsed.list, true);
  });

  it('rejects --readme (the README path is derived internally)', () => {
    assert.throws(() => parseArguments([`--readme=${tmpDir}/README.md`, '--check']), /Unknown argument/);
  });

  it('rejects neither --graph nor --status', () => {
    assert.throws(() => parseArguments(['--check']), /--graph=<path> or --status=<path>/);
  });

  it('parses a resolve-section subcommand', () => {
    const parsed = parseArguments([`--graph=${path.join(tmpDir, 'g.json')}`, 'resolve-section']);
    assert.equal(parsed.subcommand, 'resolve-section');
  });

  it('parses a mark-residue subcommand', () => {
    const parsed = parseArguments([`--status=${path.join(tmpDir, 'CRYSTALIZE-Status.json')}`, 'mark-residue']);
    assert.equal(parsed.subcommand, 'mark-residue');
  });

  it('parses --check-examples', () => {
    const parsed = parseArguments([`--graph=${path.join(tmpDir, 'g.json')}`, '--check-examples']);
    assert.equal(parsed.checkExamples, true);
    assert.equal(parsed.check, false);
  });

  it('parses a resolve-examples subcommand', () => {
    const parsed = parseArguments([`--graph=${path.join(tmpDir, 'g.json')}`, 'resolve-examples']);
    assert.equal(parsed.subcommand, 'resolve-examples');
  });

  it('parses a mark-examples-residue subcommand', () => {
    const parsed = parseArguments([`--status=${path.join(tmpDir, 'CRYSTALIZE-Status.json')}`, 'mark-examples-residue']);
    assert.equal(parsed.subcommand, 'mark-examples-residue');
  });

  it('rejects --check and --check-examples together', () => {
    assert.throws(() => parseArguments([`--graph=${path.join(tmpDir, 'g.json')}`, '--check', '--check-examples']), /not both/);
  });
});

describe('updateSectionState — PX-156', () => {
  it('upserts a section state into grill.sections without duplicating an id', () => {
    const status = { grill: { sections: [] } };
    updateSectionState(status, 'H1', 'クイックスタート', 'complete');
    updateSectionState(status, 'H1', 'クイックスタート', 'complete');
    updateSectionState(status, 'H1-1', 'アカウントの追加', 'residue');
    assert.equal(status.grill.sections.length, 2);
    assert.equal(status.grill.sections.find((s) => s.id === 'H1').state, 'complete');
    assert.equal(status.grill.sections.find((s) => s.id === 'H1-1').state, 'residue');
  });

  it('copies confirmedContent from the matching toc node when creating a section record', () => {
    const status = { grill: { sections: [], toc: { nodes: [{ id: 'H1', confirmedContent: 'トランスポート設定コード' }] } } };
    updateSectionState(status, 'H1', 'クイックスタート', 'complete');
    assert.equal(status.grill.sections[0].confirmedContent, 'トランスポート設定コード');
    assert.equal(status.grill.sections[0].state, 'complete');
  });

  it('refreshes confirmedContent onto an existing section record when upserting', () => {
    const status = { grill: { sections: [{ id: 'H1', heading: '旧見出し', state: 'residue' }], toc: { nodes: [{ id: 'H1', confirmedContent: 'リード' }] } } };
    updateSectionState(status, 'H1', '新見出し', 'complete');
    assert.equal(status.grill.sections.length, 1);
    assert.equal(status.grill.sections[0].heading, '新見出し');
    assert.equal(status.grill.sections[0].state, 'complete');
    assert.equal(status.grill.sections[0].confirmedContent, 'リード');
  });

  it('sets confirmedContent to null when the matching toc node is missing', () => {
    const status = { grill: { sections: [], toc: { nodes: [] } } };
    updateSectionState(status, 'H1', 'クイックスタート', 'complete');
    assert.equal(status.grill.sections[0].confirmedContent, null);
  });

  it('sets confirmedContent to null when the node carries no confirmedContent', () => {
    const status = { grill: { sections: [], toc: { nodes: [{ id: 'H1', status: 'confirmed' }] } } };
    updateSectionState(status, 'H1', 'クイックスタート', 'residue');
    assert.equal(status.grill.sections[0].confirmedContent, null);
  });

  it('does not throw when the status has no grill.toc at all', () => {
    const status = { grill: { sections: [] } };
    updateSectionState(status, 'H1', 'クイックスタート', 'complete');
    assert.equal(status.grill.sections[0].confirmedContent, null);
  });
});

describe('deriveReadmePath', () => {
  it('derives <rfcDir>/README.md from the status sourceFile', () => {
    const fx = materialize('derive', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample.`));
    assert.equal(deriveReadmePath({ sourceFile: fx.sourceFile }), fx.readmePath);
  });
});

describe('CLI — --check (readme path derived internally)', () => {
  it('exits 0 when the loop has converged', () => {
    const fx = materialize('converged', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, '--check', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, true);
  });

  it('exits 1 and lists unresolved sections when templates remain', () => {
    const fx = materialize('pending', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, '--check', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, false);
    assert.ok(out.unresolved.includes('A'));
  });

  it('derives the README path from the status, not from the cwd', () => {
    const fx = materialize('status-derived', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const statusPath = path.join(fx.dir, 'CRYSTALIZE-Status.json');
    const result = spawnSync('node', [SCRIPT, '--check', `--status=${statusPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.ok(out.unresolved.includes('A'));
  });

  it('exits 1 when a usage section carries an EXAMPLES marker (cross-contamination)', () => {
    const fx = materialize('check-xcontam', readmeWith(`## A\n\n${MARKER_TEMPLATE_EXAMPLES}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const result = spawnSync('node', [SCRIPT, '--check', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, false);
    assert.match(result.stderr, /cross-contamination/i);
  });
});

describe('CLI — resolve-section / mark-residue (combined README + status transition)', () => {
  function statusOf(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'CRYSTALIZE-Status.json'), 'utf8'));
  }

  it('resolve-section replaces the section body and marks the section complete in the status', () => {
    const fx = materialize('resolve-cli', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const input = JSON.stringify({ id: 'H1', heading: 'A', content: 'Complete usage prose.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(!readme.includes(MARKER_TEMPLATE_README));
    assert.ok(readme.includes('## A\n\nComplete usage prose.'));
    assert.ok(readme.includes('Complete usage prose.\n\n## Examples'), 'a blank line separates the resolved section from the next heading');
    assert.deepEqual(statusOf(fx.dir).grill.sections, [{ id: 'H1', heading: 'A', state: 'complete', confirmedContent: null }]);
  });

  it('mark-residue replaces the marker with README-RESIDUE + evidence and marks the section residue', () => {
    const fx = materialize('residue-cli', readmeWith(`## B\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const input = JSON.stringify({ id: 'H1-1', heading: 'B', content: 'Evidence: register() missing; reinforcement: implement it.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-residue'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(!readme.includes(MARKER_TEMPLATE_README));
    assert.ok(readme.includes(MARKER_README_RESIDUE));
    assert.ok(readme.includes('Evidence: register() missing; reinforcement: implement it.'));
    assert.deepEqual(statusOf(fx.dir).grill.sections, [{ id: 'H1-1', heading: 'B', state: 'residue', confirmedContent: null }]);
  });

  it('preserves the heading level when resolving a nested section', () => {
    const fx = materialize('resolve-nested', readmeWith(`### A-1\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const input = JSON.stringify({ id: 'H1-1', heading: 'A-1', content: 'Nested prose.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(readme.includes('### A-1\n\nNested prose.'));
  });

  it('exits 1 and leaves files unchanged when the section heading is not found', () => {
    const fx = materialize('resolve-missing', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const readmeBefore = fs.readFileSync(fx.readmePath, 'utf8');
    const statusBefore = fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8');
    const input = JSON.stringify({ id: 'H1', heading: 'Nope', content: 'x' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(fx.readmePath, 'utf8'), readmeBefore);
    assert.equal(fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8'), statusBefore);
  });

  it('exits 1 when the stdin JSON is missing required fields', () => {
    const fx = materialize('resolve-invalid', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-residue'], { input: '{"id":"H1","heading":"A"}', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /content is required/);
    assert.equal(fs.readFileSync(fx.readmePath, 'utf8').includes(MARKER_TEMPLATE_README), true, 'README must be untouched on invalid input');
  });

  it('resolve-section renders confirmedContent as the section lead and copies it into the status', () => {
    const fx = materialize('resolve-confirmed', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`), [
      { id: 'H1', heading: 'A', level: 2, confirmedContent: 'Confirmed lead.', status: 'confirmed' },
    ]);
    const input = JSON.stringify({ id: 'H1', heading: 'A', content: 'Complete usage prose.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(readme.includes('## A\n\nConfirmed lead.\n\nComplete usage prose.'), 'lead sits between heading and content');
    const section = statusOf(fx.dir).grill.sections.find((s) => s.id === 'H1');
    assert.equal(section.confirmedContent, 'Confirmed lead.');
  });

  it('mark-residue renders confirmedContent between the heading and README-RESIDUE and copies it into the status', () => {
    const fx = materialize('residue-confirmed', readmeWith(`## B\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`), [
      { id: 'H1-1', heading: 'B', level: 2, confirmedContent: 'Confirmed lead.', status: 'confirmed' },
    ]);
    const input = JSON.stringify({ id: 'H1-1', heading: 'B', content: 'Evidence: register() missing; reinforcement: implement it.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-residue'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(readme.includes(`## B\n\nConfirmed lead.\n\n${MARKER_README_RESIDUE}\nEvidence: register() missing; reinforcement: implement it.`), 'lead sits between heading and marker');
    const section = statusOf(fx.dir).grill.sections.find((s) => s.id === 'H1-1');
    assert.equal(section.confirmedContent, 'Confirmed lead.');
  });

  it('keeps the current body unchanged when the matching node has no confirmedContent', () => {
    const fx = materialize('resolve-no-confirmed', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`), [
      { id: 'H1', heading: 'A', level: 2, status: 'confirmed' },
    ]);
    const input = JSON.stringify({ id: 'H1', heading: 'A', content: 'Plain prose.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(readme.includes('## A\n\nPlain prose.'));
    assert.ok(!readme.includes('confirmedContent'));
    const section = statusOf(fx.dir).grill.sections.find((s) => s.id === 'H1');
    assert.equal(section.confirmedContent, null);
  });
});

describe('Output language — polite English guidance (PX-156)', () => {
  it('resolve-section prints a polite English confirmation on stdout', () => {
    const fx = materialize('lang-resolve', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const input = JSON.stringify({ id: 'H1', heading: 'A', content: 'Complete prose.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-section'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Section resolved: H1'), 'confirmation names the section');
    assert.match(result.stdout, /complete/);
    assert.ok(ASCII.test(result.stdout), 'confirmation is natural-language English (ASCII)');
  });

  it('mark-residue prints a polite English confirmation on stdout', () => {
    const fx = materialize('lang-residue', readmeWith(`## B\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const input = JSON.stringify({ id: 'H1-1', heading: 'B', content: 'Evidence: register() missing.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-residue'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('Section marked as residue: H1-1'), 'confirmation names the section');
    assert.match(result.stdout, /residue/);
    assert.ok(ASCII.test(result.stdout), 'confirmation is natural-language English (ASCII)');
  });

  it('--check prints English guidance on stderr when the loop has not converged', () => {
    const fx = materialize('lang-check-pending', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, '--check', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Loop not converged/);
    assert.match(result.stderr, /resolve-section/);
    assert.ok(ASCII.test(result.stderr), 'guidance is natural-language English (ASCII)');
  });

  it('--check prints English guidance on stderr when the loop has converged', () => {
    const fx = materialize('lang-check-done', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, '--check', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /Loop converged/);
    assert.ok(ASCII.test(result.stderr));
  });

  it('--list prints an English section-scan summary on stderr', () => {
    const fx = materialize('lang-list', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `## B\n\nComplete.`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, '--list', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /Section scan/);
    assert.match(result.stderr, /1 pending, 1 complete, 0 residue/);
    assert.ok(ASCII.test(result.stderr));
  });

  it('errors follow the 3-part English format [ERROR] / Cause: / Action:', () => {
    const fx = materialize('lang-error', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`));
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-residue'], { input: '{"id":"H1","heading":"A"}', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[ERROR\]/);
    assert.match(result.stderr, /Cause:/);
    assert.match(result.stderr, /Action:/);
    assert.match(result.stderr, /content is required/);
    assert.ok(ASCII.test(result.stderr));
  });
});

describe('scanExamplesState — PX-156 examples step', () => {
  it('reports template when the examples section carries TEMPLATE-EXAMPLES', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const state = scanExamplesState(text);
    assert.deepEqual(state, { present: true, template: true, residue: false, complete: false });
  });

  it('reports residue when the examples section carries EXAMPLES-RESIDUE', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_EXAMPLES_RESIDUE} evidence`);
    const state = scanExamplesState(text);
    assert.deepEqual(state, { present: true, template: false, residue: true, complete: false });
  });

  it('reports complete when the examples section carries neither marker', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nComplete examples design.`);
    const state = scanExamplesState(text);
    assert.deepEqual(state, { present: true, template: false, residue: false, complete: true });
  });

  it('reports present:false when the trailing examples section is missing', () => {
    const text = readmeWith(`## A\n\nComplete prose.`);
    const state = scanExamplesState(text);
    assert.equal(state.present, false);
  });
});

describe('markExamplesResidue — C003 examples residue branch', () => {
  it('replaces TEMPLATE-EXAMPLES with EXAMPLES-RESIDUE plus evidence', () => {
    const readme = readmeWith(`${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const out = markExamplesResidue(readme, 'Examples (implementation samples) spec and design', 'Evidence: examples/ missing; reinforcement: add crate examples.');
    assert.ok(!out.includes(MARKER_TEMPLATE_EXAMPLES));
    assert.ok(out.includes(MARKER_EXAMPLES_RESIDUE));
    assert.ok(out.includes('Evidence: examples/ missing; reinforcement: add crate examples.'));
  });

  it('keeps the original heading level in the residue section', () => {
    const readme = readmeWith(`${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const out = markExamplesResidue(readme, 'Examples (implementation samples) spec and design', 'evidence');
    assert.ok(out.includes(`## Examples (implementation samples) spec and design\n\n${MARKER_EXAMPLES_RESIDUE}`));
  });

  it('throws when the section heading does not exist', () => {
    const readme = readmeWith(`## A\n\nComplete prose.`);
    assert.throws(() => markExamplesResidue(readme, 'Nope', 'x'), /not found/);
  });
});

describe('checkExamplesReady — C003 examples step completion', () => {
  it('is not ready while TEMPLATE-EXAMPLES remains even when the loop converged (C003-Pre)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const verdict = checkExamplesReady(text);
    assert.equal(verdict.ready, false);
    assert.equal(verdict.examples.template, true);
  });

  it('is ready when the loop converged and the examples section is complete (C003-Post)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nComplete examples design.`);
    const verdict = checkExamplesReady(text);
    assert.equal(verdict.ready, true);
  });

  it('is ready when the loop converged and the examples section is residue (C003-Post)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_EXAMPLES_RESIDUE} evidence`);
    const verdict = checkExamplesReady(text);
    assert.equal(verdict.ready, true);
  });

  it('is not ready while the loop has not converged (TEMPLATE-README remains)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nComplete examples design.`);
    const verdict = checkExamplesReady(text);
    assert.equal(verdict.ready, false);
    assert.deepEqual(verdict.unresolved, ['A']);
  });

  it('is not ready when the trailing examples section is missing', () => {
    const text = readmeWith(`## A\n\nComplete prose.`);
    const verdict = checkExamplesReady(text);
    assert.equal(verdict.ready, false);
    assert.equal(verdict.examples.present, false);
  });
});

describe('CLI — resolve-examples / mark-examples-residue (examples dedicated step)', () => {
  function statusOf(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, 'CRYSTALIZE-Status.json'), 'utf8'));
  }

  it('resolve-examples replaces the examples section, removes TEMPLATE-EXAMPLES, and marks it complete', () => {
    const fx = materialize('resolve-examples-cli', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const input = JSON.stringify({ content: '```rust\n// sample\n```' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-examples'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(!readme.includes(MARKER_TEMPLATE_EXAMPLES));
    assert.ok(readme.includes('```rust'));
    const status = statusOf(fx.dir);
    assert.equal(status.grill.examplesApproved, true);
    assert.deepEqual(status.grill.sections, [{ id: 'EXAMPLES', heading: 'Examples (implementation samples) spec and design', state: 'complete', confirmedContent: null }]);
  });

  it('mark-examples-residue replaces TEMPLATE-EXAMPLES with EXAMPLES-RESIDUE and marks residue', () => {
    const fx = materialize('mark-examples-residue-cli', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const input = JSON.stringify({ content: 'Evidence: examples/ missing; reinforcement: add crate examples.' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-examples-residue'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(fx.readmePath, 'utf8');
    assert.ok(!readme.includes(MARKER_TEMPLATE_EXAMPLES));
    assert.ok(readme.includes(MARKER_EXAMPLES_RESIDUE));
    assert.ok(readme.includes('Evidence: examples/ missing; reinforcement: add crate examples.'));
    const status = statusOf(fx.dir);
    assert.equal(status.grill.examplesApproved, false);
    assert.deepEqual(status.grill.sections, [{ id: 'EXAMPLES', heading: 'Examples (implementation samples) spec and design', state: 'residue', confirmedContent: null }]);
  });

  it('examples transitions never carry confirmedContent (EXAMPLES has no toc node)', () => {
    const fx = materialize('examples-no-confirmed', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`), [
      { id: 'H1', heading: 'A', level: 2, confirmedContent: 'lead', status: 'confirmed' },
    ]);
    const input = JSON.stringify({ content: '```rust\n// sample\n```' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-examples'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    const status = statusOf(fx.dir);
    const examples = status.grill.sections.find((s) => s.id === 'EXAMPLES');
    assert.equal(examples.state, 'complete');
    assert.equal(examples.confirmedContent, null);
  });

  it('refuses to run when the Step 2 loop has not converged (C003-Pre), leaving files unchanged', () => {
    const fx = materialize('resolve-examples-locked', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const readmeBefore = fs.readFileSync(fx.readmePath, 'utf8');
    const statusBefore = fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8');
    const input = JSON.stringify({ content: 'x' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-examples'], { input, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /loop has not converged/);
    assert.equal(fs.readFileSync(fx.readmePath, 'utf8'), readmeBefore);
    assert.equal(fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8'), statusBefore);
  });

  it('refuses when the examples section is already resolved (no TEMPLATE-EXAMPLES), leaving files unchanged', () => {
    const fx = materialize('resolve-examples-done', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nComplete design.`));
    const readmeBefore = fs.readFileSync(fx.readmePath, 'utf8');
    const statusBefore = fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8');
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-examples'], { input: '{"content":"x"}', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no longer carries/);
    assert.equal(fs.readFileSync(fx.readmePath, 'utf8'), readmeBefore);
    assert.equal(fs.readFileSync(path.join(fx.dir, 'CRYSTALIZE-Status.json'), 'utf8'), statusBefore);
  });

  it('exits 1 when the stdin content is missing', () => {
    const fx = materialize('resolve-examples-invalid', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-examples-residue'], { input: '{}', encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /content is required/);
    assert.equal(fs.readFileSync(fx.readmePath, 'utf8').includes(MARKER_TEMPLATE_EXAMPLES), true, 'README must be untouched on invalid input');
  });

  it('resolve-examples prints a polite English confirmation on stdout', () => {
    const fx = materialize('lang-resolve-examples', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const input = JSON.stringify({ content: 'design' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'resolve-examples'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Examples section resolved/);
    assert.ok(ASCII.test(result.stdout));
  });

  it('mark-examples-residue prints a polite English confirmation on stdout', () => {
    const fx = materialize('lang-mark-examples-residue', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const input = JSON.stringify({ content: 'evidence' });
    const result = spawnSync('node', [SCRIPT, `--graph=${fx.graphPath}`, 'mark-examples-residue'], { input, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Examples section marked as residue/);
    assert.ok(ASCII.test(result.stdout));
  });
});

describe('CLI — --check-examples (examples step completion)', () => {
  it('exits 0 and reports Examples resolved when the examples step is done', () => {
    const fx = materialize('check-examples-done', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nComplete design.`));
    const result = spawnSync('node', [SCRIPT, '--check-examples', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, true);
    assert.match(result.stderr, /Examples resolved/);
    assert.ok(ASCII.test(result.stderr));
  });

  it('exits 1 and reports Examples not resolved while TEMPLATE-EXAMPLES remains', () => {
    const fx = materialize('check-examples-pending', readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
    const result = spawnSync('node', [SCRIPT, '--check-examples', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, false);
    assert.equal(out.examples.template, true);
    assert.match(result.stderr, /Examples not resolved/);
    assert.ok(ASCII.test(result.stderr));
  });

  it('exits 1 and lists unresolved usage sections when the loop has not converged', () => {
    const fx = materialize('check-examples-loop', readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nComplete design.`));
    const result = spawnSync('node', [SCRIPT, '--check-examples', `--graph=${fx.graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, false);
    assert.ok(out.unresolved.includes('A'));
    assert.match(result.stderr, /resolve-section/, 'fix guidance points to the Step 2 loop when usage sections are unresolved');
  });
});
