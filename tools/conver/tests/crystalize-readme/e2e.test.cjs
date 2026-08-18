/**
 * e2e.test.cjs — End-to-end tests for the /crystalize-readme marker pipeline (PX-156)
 *
 * Full flow: Step 1 end emits the README.md skeleton with <::TEMPLATE-README::>
 * / <::TEMPLATE-EXAMPLES::> markers -> Step 2 loop resolves each usage section to
 * complete or <::README-RESIDUE::> -> post-loop examples step resolves the
 * examples section -> the final README.md has zero TEMPLATE markers and passes
 * the marker grammar (validateMarkerGrammar).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { deriveOutputPaths } = require('../../.claude/scripts/crystalize-readme/derive-output-paths.js');
const { emitSkeletonToFile } = require('../../.claude/scripts/crystalize-readme/emit-readme-skeleton.js');
const { checkLoopReady, resolveSection, markResidue, markExamplesResidue } = require('../../.claude/scripts/crystalize-readme/loop-drive-readme.js');
const { MARKER_TEMPLATE_README, TRAILING_SECTION_TITLE, validateMarkerGrammar } = require('../../.claude/scripts/crystalize-readme/validate-marker-grammar.js');

const {
  buildValidGraph,
  materializeFixture,
  rmrf,
} = require('./fixtures/helpers.cjs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-e2e-'));

after(() => rmrf(tmpRoot));

describe('End-to-end marker pipeline — PX-156', () => {
  it('emits the skeleton, resolves every section, and produces a validating README', () => {
    const dir = path.join(tmpRoot, 'e2e-marker');
    const fx = materializeFixture(dir, buildValidGraph(path.join(dir, 'RFC-ROOT.md')), { omitGrill: true });

    const paths = deriveOutputPaths({ sourceFile: fx.sourceFile });
    assert.equal(paths.rfcDir, dir);

    // Confirmed TOC (Step 1 output) + empty per-section state (Step 2 input)
    const status = {
      sourceFile: fx.sourceFile,
      graphFile: fx.graphPath,
      currentStep: 2,
      steps: { 0: 'done', 1: 'done', 2: 'running', 3: 'pending', 4: 'pending' },
      grill: {
        tocApproved: true,
        examplesApproved: false,
        toc: {
          nodes: [
            { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: 'x', status: 'confirmed' },
            { id: 'H1-1', heading: 'アカウントの追加', level: 2, confirmedContent: 'y', status: 'confirmed' },
          ],
        },
        sections: [],
      },
    };

    // Step 1 end: mechanically emit the skeleton (path derived internally)
    emitSkeletonToFile(status);
    let text = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.equal(checkLoopReady(text).ready, false, 'loop must not exit while templates remain');

    // Step 2 loop: resolve each usage section (writable -> complete, one -> residue)
    text = resolveSection(text, 'クイックスタート', '# クイックスタート\n\nComplete usage prose.');
    text = markResidue(text, 'アカウントの追加', 'Evidence: register() missing; reinforcement: implement it.');
    assert.equal(checkLoopReady(text).ready, true, 'loop exits once every TEMPLATE-README is resolved');

    // Post-loop examples step: examples directory exists -> scripted complete transition
    text = resolveSection(text, TRAILING_SECTION_TITLE, `## ${TRAILING_SECTION_TITLE}\n\n\`\`\`rust\n// sample\n\`\`\``);

    // Final validation passes (zero TEMPLATE markers of both kinds)
    const grammar = validateMarkerGrammar(text);
    assert.equal(grammar.ok, true, grammar.errors.join('; '));
    assert.equal(grammar.templateCount, 0, 'no TEMPLATE markers remain after the examples step');
  });

  it('keeps a residue section in the final README while the loop still exits', () => {
    const dir = path.join(tmpRoot, 'e2e-residue');
    const fx = materializeFixture(dir, buildValidGraph(path.join(dir, 'RFC-ROOT.md')), { omitGrill: true });
    const status = {
      sourceFile: fx.sourceFile,
      graphFile: fx.graphPath,
      currentStep: 2,
      steps: {},
      grill: {
        tocApproved: true,
        examplesApproved: false,
        toc: {
          nodes: [
            { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: 'x', status: 'confirmed' },
          ],
        },
        sections: [],
      },
    };
    emitSkeletonToFile(status);
    let text = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');

    // Every usage section unwritable -> all become README-RESIDUE; examples unresolvable -> EXAMPLES-RESIDUE
    text = markResidue(text, 'クイックスタート', 'Evidence: no implementation; reinforcement: add crate API.');
    assert.ok(!text.includes(MARKER_TEMPLATE_README));
    assert.equal(checkLoopReady(text).ready, true, 'loop exits once every TEMPLATE-README is resolved');
    text = markExamplesResidue(text, TRAILING_SECTION_TITLE, 'examples/ missing');

    assert.equal(checkLoopReady(text).ready, true, 'loop exits with residue-only README');
    const grammar = validateMarkerGrammar(text);
    assert.equal(grammar.ok, true, grammar.errors.join('; '));
    assert.equal(grammar.templateCount, 0, 'no TEMPLATE markers remain after the examples step');
  });

  it('refine mode re-emits the skeleton and re-analyzes every section from scratch', () => {
    const dir = path.join(tmpRoot, 'e2e-refine');
    const fx = materializeFixture(dir, buildValidGraph(path.join(dir, 'RFC-ROOT.md')), { omitGrill: true });

    // Previous run's README (refine input): a fully completed usage section
    fs.writeFileSync(path.join(dir, 'README.md'), '# 旧タイトル\n\nComplete prose from the previous run.\n', 'utf8');

    const status = {
      sourceFile: fx.sourceFile,
      graphFile: fx.graphPath,
      currentStep: 2,
      steps: { 0: 'done', 1: 'done', 2: 'running', 3: 'pending', 4: 'pending' },
      grill: {
        tocApproved: true,
        examplesApproved: false,
        toc: {
          nodes: [
            { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: 'x', status: 'confirmed' },
            { id: 'H1-1', heading: 'アカウントの追加', level: 2, confirmedContent: 'y', status: 'confirmed' },
          ],
        },
        sections: [],
      },
    };

    // Step 1 end (refine): re-emit the skeleton, overwriting the previous README
    emitSkeletonToFile(status);
    let text = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.ok(!text.includes('旧タイトル'), 'the previous README is replaced by the new skeleton');
    assert.equal(checkLoopReady(text).ready, false, 'every section is re-marked TEMPLATE-README for full re-analysis');

    // Step 2: re-analyze every section from scratch
    text = resolveSection(text, 'クイックスタート', '# クイックスタート\n\nComplete usage prose.');
    text = markResidue(text, 'アカウントの追加', 'Evidence: register() missing; reinforcement: implement it.');
    assert.equal(checkLoopReady(text).ready, true, 'loop exits once every TEMPLATE-README is resolved');

    // Post-loop examples step: scripted complete transition
    text = resolveSection(text, TRAILING_SECTION_TITLE, `## ${TRAILING_SECTION_TITLE}\n\n\`\`\`rust\n// sample\n\`\`\``);

    const grammar = validateMarkerGrammar(text);
    assert.equal(grammar.ok, true, grammar.errors.join('; '));
    assert.equal(grammar.templateCount, 0, 'no TEMPLATE markers remain after the examples step');
  });
});
