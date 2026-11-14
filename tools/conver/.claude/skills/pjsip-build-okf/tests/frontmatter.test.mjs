import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../okf-core/parsing/frontmatter.mjs';
import { renderFrontmatter } from '../okf-core/authoring/write.mjs';

test('parses a type and body', () => {
  const parsed = parseFrontmatter('---\ntype: Page\ntitle: "A"\n---\nBody\n');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.type, 'Page');
});

test('reports a missing frontmatter block', () => {
  const parsed = parseFrontmatter('# Just a body\n');
  assert.equal(parsed.errors[0].code, 'FRONTMATTER_MISSING');
});

test('reports an empty type', () => {
  const parsed = parseFrontmatter('---\ntype: ""\n---\nBody\n');
  assert.equal(parsed.errors[0].code, 'TYPE_EMPTY');
});

test('reports a duplicate key instead of silently keeping the last value', () => {
  const parsed = parseFrontmatter('---\ntype: Page\ntype: Page\n---\nBody\n');
  assert.equal(parsed.errors[0].code, 'FRONTMATTER_INVALID');
  assert.match(parsed.errors[0].message, /duplicate key/);
});

test('renders known keys first and preserves unknown and extension keys', () => {
  const rendered = renderFrontmatter({
    type: 'Page',
    'x-topic': 'topic',
    zeta: 'last',
    description: 'A page.',
  });
  const lines = rendered.split('\n');
  assert.equal(lines[0], 'type: "Page"');
  assert.equal(lines[1], 'description: "A page."');
  assert.equal(lines[2], 'x-topic: "topic"');
  assert.equal(lines[3], 'zeta: "last"');
});
