// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * validate-toc-structure.test.cjs — deterministic structure gate for the TOC.
 * @verifies C001
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateTocStructure } = require('../../.claude/scripts/crystalize-readme/validate-toc-structure.js');

const examples = { id: 'H9', heading: 'Examples (implementation samples) spec and design', level: 1 };

// [::TICKET::] PX-452, PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-452|PX-451) --for-spec --no-implementation-order`.
function requiredFamilyNodes() {
  return [
    'Purpose',
    'Quick start',
    'Capabilities',
    'Inputs, outputs, and effects',
    'Preconditions, postconditions, and invariants',
    'Errors and failure behavior',
    'Constraints and non-goals',
  ].map((heading, index) => ({ id: `H${index + 1}`, heading, level: 1 }));
}

describe('C001 — TOC structure', () => {
  it('accepts a valid tree ending with Examples', () => {
    const result = validateTocStructure({
      nodes: [...requiredFamilyNodes(), examples],
    });
    assert.equal(result.valid, true, result.errors.join('; '));
  });

  it('rejects a child before its parent', () => {
    const result = validateTocStructure({
      nodes: [{ id: 'H1-1', heading: 'Child', level: 2 }, examples],
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /parent/i);
  });

  it('rejects duplicate headings and a missing Examples-last section', () => {
    const duplicate = validateTocStructure({
      nodes: [
        { id: 'H1', heading: 'Purpose', level: 1 },
        { id: 'H2', heading: 'Purpose', level: 1 },
        examples,
      ],
    });
    assert.equal(duplicate.valid, false);

    const noExamples = validateTocStructure({
      nodes: [{ id: 'H1', heading: 'Purpose', level: 1 }],
    });
    assert.equal(noExamples.valid, false);
    assert.match(noExamples.errors.join(' '), /Examples/i);
  });

  it('requires evidence when a complete prior heading is retired', () => {
    const result = validateTocStructure({
      nodes: [{ id: 'H1', heading: 'Purpose', level: 1 }, examples],
      priorNodes: [{ id: 'H1', heading: 'Purpose', level: 1 }, { id: 'H2', heading: 'Old', level: 1 }],
      priorSections: [{ id: 'H2', state: 'complete' }],
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /retirement|retired/i);
  });

  it('records a waiver for a non-applicable family', () => {
    const result = validateTocStructure({
      nodes: [...requiredFamilyNodes(), examples],
      waivers: [{ family: 'interface', reason: 'No interface is exposed', evidence: 'workspace-map' }],
    });
    assert.equal(result.valid, true);
    assert.equal(result.waivers.length, 1);
  });
});

describe('C007 — required section families', () => {
  it('rejects each missing semantic family unless a reason-and-evidence waiver exists', () => {
    const withErrors = validateTocStructure({ nodes: [...requiredFamilyNodes(), examples] });
    assert.equal(withErrors.valid, true, withErrors.errors.join('; '));

    for (const family of requiredFamilyNodes()) {
      const without = [...requiredFamilyNodes().filter((node) => node.id !== family.id), examples];
      const verdict = validateTocStructure({ nodes: without });
      assert.equal(verdict.valid, false, family.heading);
      assert.match(verdict.errors.join(' '), /required family/i);
      const waived = validateTocStructure({
        nodes: without,
        waivers: [{ family: 'missing', reason: 'Not applicable', evidence: 'RFC.md#section' }],
      });
      assert.equal(waived.valid, false, 'a waiver must name the missing family');
    }
  });

  it('accepts a complete family set and rejects a waiver with no evidence', () => {
    const nodes = [...requiredFamilyNodes().filter((node) => !/Errors/.test(node.heading)), examples];
    assert.equal(validateTocStructure({ nodes }).valid, false);
    const waived = validateTocStructure({
      nodes,
      waivers: [{ family: 'errors', reason: 'No failure surface', evidence: 'src/lib.rs:1' }],
    });
    assert.equal(waived.valid, true, waived.errors.join('; '));
    const empty = validateTocStructure({
      nodes,
      waivers: [{ family: 'errors', reason: 'No failure surface', evidence: '' }],
    });
    assert.equal(empty.valid, false);
  });
});

describe('C014 — heading level agrees with id depth', () => {
  it('rejects H1-1 with level 3 and accepts level 2', () => {
    const base = requiredFamilyNodes();
    const mismatch = validateTocStructure({
      nodes: [...base, { id: 'H1-1', heading: 'Child', level: 3 }, examples],
    });
    assert.equal(mismatch.valid, false);
    assert.match(mismatch.errors.join(' '), /level mismatch/);
    const correct = validateTocStructure({
      nodes: [...base, { id: 'H1-1', heading: 'Child', level: 2 }, examples],
    });
    assert.equal(correct.valid, true, correct.errors.join('; '));
  });
});
