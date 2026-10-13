// PX-256 @verifies C005
// The guard is default-deny, so an unlisted new name is already refused and nothing can be
// written by accident. What was wrong is the stated reason: the view was refused as an
// unknown path, which tells the operator to extend the allow-list, when the truth is that
// the file is a frozen input the grill must not rewrite. A refusal that names the wrong
// reason is a refusal somebody will argue with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  CANON_STATE,
  VIEW_JSON_NAME,
  VIEW_MARKDOWN_NAME,
  guardVerdict,
  withScratch,
} from './fixtures/session-tree.mjs';

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 the guard refuses both view names as frozen inputs rather than as unknown paths', () => {
  for (const name of [VIEW_MARKDOWN_NAME, VIEW_JSON_NAME]) {
    const { status, verdict } = guardVerdict(`/workspace/crates/pkg/${name}`);
    assert.equal(status, 1, name);
    assert.equal(verdict.allowed, false, name);
    assert.equal(verdict.rule, 'frozen', name);
    assert.equal(verdict.basename, name);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 the refusal reason is the frozen one and not the extend-the-allow-list one', () => {
  const result = spawnSync(process.execPath, ['.claude/scripts/grill-me-for-rfc/guard-edit-surface.js', '/workspace/crates/pkg/' + VIEW_MARKDOWN_NAME], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes('extend the allow-list deliberately'), false);
  assert.match(result.stderr, /refused: SEQUENCES\.md/);
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 the names the command generates are still allowed, so the guard was not widened', () => {
  for (const name of ['RFC.md', 'DesignTree.json', 'CheckList.md', 'Status.json']) {
    const { status, verdict } = guardVerdict(`/workspace/crates/pkg/${name}`);
    assert.equal(status, 0, name);
    assert.equal(verdict.allowed, true, name);
  }
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 a name that would match a derived suffix is still unknown, so the two rules stay distinct', () => {
  const { verdict } = guardVerdict('/workspace/crates/pkg/SEQUENCES-GRAPH.json');
  assert.equal(verdict.rule, 'unknown');
  assert.equal(guardVerdict('/workspace/crates/pkg/OTHER-sequences.json').verdict.rule, 'unknown');
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 canon-state still stands alone with both view names present, so it needs no change', () => {
  withScratch('px256-canon-', (root) => {
    fs.writeFileSync(path.join(root, 'RFC.md'), '# rfc\n');
    fs.writeFileSync(path.join(root, VIEW_MARKDOWN_NAME), '# sequences\n');
    fs.writeFileSync(path.join(root, VIEW_JSON_NAME), '{}\n');
    const result = spawnSync(process.execPath, [CANON_STATE, root], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /canon stands alone/);
  });
});

// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
test('C005 canon-state still reports materialised canon, so the view did not blunt it', () => {
  withScratch('px256-canon-', (root) => {
    fs.writeFileSync(path.join(root, 'RFC.md'), '# rfc\n');
    fs.writeFileSync(path.join(root, VIEW_MARKDOWN_NAME), '# sequences\n');
    fs.writeFileSync(path.join(root, 'RFC-GRAPH.json'), '{}\n');
    const result = spawnSync(process.execPath, [CANON_STATE, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /GRAPH/);
  });
});
