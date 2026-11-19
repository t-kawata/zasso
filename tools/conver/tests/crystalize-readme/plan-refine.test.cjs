// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * plan-refine.test.cjs — evidence-based carry-forward.
 * @verifies C002
 * @verifies C002/precondition
 * @verifies C002/postcondition
 * @verifies C002/invariant
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { planRefine } = require('../../.claude/scripts/crystalize-readme/plan-refine.js');

describe('C002 — refine by evidence', () => {
  it('preserves an unchanged complete section', () => {
    const plan = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'complete', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 1 }],
      currentEvidence: { H1: 'a' },
    });
    assert.equal(plan.nodes[0].action, 'preserve');
  });

  it('reanalyzes a changed complete section', () => {
    const plan = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'complete', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 1 }],
      currentEvidence: { H1: 'b' },
    });
    assert.equal(plan.nodes[0].action, 'reanalyze');
  });

  it('never preserves a residue section', () => {
    const plan = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'residue', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 1 }],
      currentEvidence: { H1: 'a' },
    });
    assert.equal(plan.nodes[0].action, 'reanalyze');
  });

  it('marks a new section as new', () => {
    const plan = planRefine({
      priorSections: [],
      priorNodes: [],
      currentEvidence: {},
      currentNodes: [{ id: 'H2', heading: 'Errors', level: 1 }],
    });
    assert.equal(plan.nodes[0].action, 'new');
  });
});

describe('C010 — preserve carries the prior body', () => {
  const priorReadmeText = '# Title\n\n## Quick start\n\nRun the tool.\n\n## Errors\n\nOld text.\n';

  it('attaches the prior body byte-identically when evidence is unchanged', () => {
    const plan = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'complete', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 2 }],
      currentEvidence: { H1: 'a' },
      priorReadmeText,
    });
    assert.equal(plan.nodes[0].action, 'preserve');
    assert.equal(plan.nodes[0].body, 'Run the tool.');
  });

  it('never carries a body for changed evidence or a residue section', () => {
    const changed = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'complete', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 2 }],
      currentEvidence: { H1: 'b' },
      priorReadmeText,
    });
    assert.equal(changed.nodes[0].body, undefined);

    const residue = planRefine({
      priorSections: [{ id: 'H1', heading: 'Quick start', state: 'residue', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Quick start', level: 2 }],
      currentEvidence: { H1: 'a' },
      priorReadmeText,
    });
    assert.equal(residue.nodes[0].body, undefined);
  });

  it('downgrades a preserve with no prior body to reanalyze', () => {
    const plan = planRefine({
      priorSections: [{ id: 'H1', heading: 'Missing heading', state: 'complete', evidenceDigest: 'a' }],
      priorNodes: [{ id: 'H1', heading: 'Missing heading', level: 2 }],
      currentEvidence: { H1: 'a' },
      priorReadmeText,
    });
    assert.equal(plan.nodes[0].action, 'reanalyze');
  });
});

describe('C010 — CLI attaches the prior body from --readme', () => {
  it('reads the prior README file and returns a preserve node with its body', () => {
    const { spawnSync } = require('node:child_process');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-pr-cli-'));
    try {
      const readmePath = path.join(dir, 'README.md');
      fs.writeFileSync(readmePath, '# T\n\n## Quick start\n\nRun the tool.\n', 'utf8');
      const script = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/plan-refine.js');
      const input = JSON.stringify({
        priorSections: [{ id: 'H1', heading: 'Quick start', state: 'complete', evidenceDigest: 'a' }],
        priorNodes: [{ id: 'H1', heading: 'Quick start', level: 2 }],
        currentEvidence: { H1: 'a' },
      });
      const result = spawnSync('node', [script, `--readme=${readmePath}`], { input, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const plan = JSON.parse(result.stdout);
      assert.equal(plan.nodes[0].action, 'preserve');
      assert.equal(plan.nodes[0].body, 'Run the tool.');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
