// [::TICKET::] PX-335 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-335 --for-spec --no-implementation-order`.
'use strict';

/**
 * markdown-headings.test.cjs — fence-aware Markdown heading extraction
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Target: findFencedBlocks(), isFencedLine(), extractHeadingsOutsideFences(),
 *         hasUnclosedFence()
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  findFencedBlocks,
  isFencedLine,
  extractHeadingsOutsideFences,
  hasUnclosedFence,
} = require('../../.claude/scripts/rfc-graph/lib/markdown-headings.js');

// @verifies C001
describe('markdown-headings — fence detection', () => {
  it('normal: a closed fence is returned as an inclusive range', () => {
    const sourceLines = ['# Doc', '```markdown', '# Fenced', '## Also fenced', '```', '## Real'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 1, end: 4, marker: '```', unclosed: false },
    ]);
    assert.equal(result.unclosed, false);
    assert.equal(hasUnclosedFence(sourceLines), false);
  });

  it('normal: a ~~~ fence is recognized', () => {
    const sourceLines = ['~~~', '# Fenced', '~~~', '## Real'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 0, end: 2, marker: '~~~', unclosed: false },
    ]);
  });

  it('boundary: a different marker does not close a block', () => {
    const sourceLines = ['~~~', '# Inside', '```', '## Still inside', '~~~', '## Real'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 0, end: 4, marker: '~~~', unclosed: false },
    ]);
  });

  it('boundary: an info string on the opening line does not change the marker', () => {
    const sourceLines = ['```js', '# Fenced', '```', '## Real'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 0, end: 2, marker: '```', unclosed: false },
    ]);
  });

  it('boundary: a fence at the first and last line is handled', () => {
    const sourceLines = ['```', '# Fenced', '```'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 0, end: 2, marker: '```', unclosed: false },
    ]);
  });

  it('boundary: CRLF line endings do not change the classification', () => {
    const sourceLines = ['```md\r', '# Fenced\r', '```\r', '## Real\r'];
    const result = findFencedBlocks(sourceLines);

    assert.deepEqual(result.blocks, [
      { start: 0, end: 2, marker: '```', unclosed: false },
    ]);
    assert.deepEqual(
      extractHeadingsOutsideFences(sourceLines).map((heading) => heading.text),
      ['Real'],
    );
  });

  it('error: an unclosed fence is reported and extends to EOF', () => {
    const sourceLines = ['## Before', '```md', '# Fenced', '## Still fenced'];
    const result = findFencedBlocks(sourceLines);

    assert.equal(result.unclosed, true);
    assert.deepEqual(result.blocks, [
      { start: 1, end: 3, marker: '```', unclosed: true },
    ]);
    assert.equal(hasUnclosedFence(sourceLines), true);
  });
});

// @verifies C001
describe('markdown-headings — heading extraction', () => {
  it('normal: returns only real headings in source order with 1-based lines', () => {
    const sourceLines = [
      '# Doc',
      '```markdown',
      '# Fenced H1',
      '## Fenced H2',
      '```',
      '## Real section',
      'body',
    ];
    const headings = extractHeadingsOutsideFences(sourceLines);

    assert.deepEqual(
      headings.map((heading) => [heading.line, heading.level, heading.text]),
      [
        [1, 1, 'Doc'],
        [6, 2, 'Real section'],
      ],
    );
  });

  it('invariant: no line inside a closed fence is returned', () => {
    const sourceLines = ['# Doc', '```', '# Fenced', '```', '## Real'];
    const { blocks } = findFencedBlocks(sourceLines);
    const headings = extractHeadingsOutsideFences(sourceLines, blocks);

    assert.equal(
      headings.some((heading) => isFencedLine(blocks, heading.line - 1)),
      false,
    );
  });

  it('boundary: an unclosed fence hides every heading after its opener', () => {
    const sourceLines = ['## Before', '```md', '## Fenced', '## Still fenced'];
    const headings = extractHeadingsOutsideFences(sourceLines);

    assert.deepEqual(headings.map((heading) => heading.text), ['Before']);
  });
});
