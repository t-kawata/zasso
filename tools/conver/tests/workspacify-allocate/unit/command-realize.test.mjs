// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
// PX-191 @verifies C004
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ALLOCATE_DOC = fileURLToPath(new URL('../../../.claude/commands/workspacify-allocate.md', import.meta.url));
const TREE_DOC = fileURLToPath(new URL('../../../.claude/commands/workspacify-tree.md', import.meta.url));

test('C004 command document references workspacify-tree.md and lists all subcommands', () => {
  const doc = readFileSync(ALLOCATE_DOC, 'utf8');
  assert.ok(doc.includes('workspacify-tree.md'));
  for (const subcommand of ['validate', 'plan', 'packet', 'gate', 'finalize']) {
    assert.ok(doc.includes(subcommand), `missing subcommand ${subcommand}`);
  }
});

test('C004 command document carries the AI semantic approval and two-sided success definition', () => {
  const doc = readFileSync(ALLOCATE_DOC, 'utf8');
  assert.ok(doc.includes('semantic_review.status === "APPROVED"'));
  assert.ok(doc.includes('成功の定義'));
});

test('C004 command document density is at least the stage-1 command density', () => {
  const allocate = readFileSync(ALLOCATE_DOC, 'utf8');
  const tree = readFileSync(TREE_DOC, 'utf8');
  assert.ok(allocate.length >= tree.length, 'allocate doc must be at least as long as the tree doc');
  const allocateHeadings = (allocate.match(/^#{2,3} /gm) ?? []).length;
  const treeHeadings = (tree.match(/^#{2,3} /gm) ?? []).length;
  assert.ok(allocateHeadings >= treeHeadings, 'allocate doc must have at least the tree heading depth');
});

test('C004 command document does not name an allocate manifest or WIC/WIG as a goal', () => {
  const doc = readFileSync(ALLOCATE_DOC, 'utf8');
  assert.ok(!doc.includes('WORKSPACIFY-ALLOCATE-MANIFEST.json を作成することが目的'));
  assert.ok(!doc.includes('Workspace Integration Contract') || doc.includes('実装しない'));
  assert.ok(doc.includes('実装しない'));
});
