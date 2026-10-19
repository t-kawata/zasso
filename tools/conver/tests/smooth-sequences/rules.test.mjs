import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadRules, RULES_FILE_NAME, RULES_SCHEMA_VERSION } from '../../.claude/scripts/smooth-sequences/lib/rules.mjs';
import { materializeSmoothWorkspace } from './helpers/workspace-fixture.mjs';

// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.

// @verifies C001
test('loadRules returns the declared vocabulary', () => {
  const workspace = materializeSmoothWorkspace({
    rules: { schemaVersion: 1, terminalStatuses: ['closed'], requiredInterfaces: ['grpc'] },
  });
  try {
    const rules = loadRules(workspace.root);
    assert.equal(RULES_SCHEMA_VERSION, 1);
    assert.deepEqual(rules.terminalStatuses, ['closed']);
    assert.deepEqual(rules.requiredInterfaces, ['grpc']);
    assert.deepEqual(rules.withheld, []);
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('an absent rules file withholds both checks with a named reason', () => {
  const workspace = materializeSmoothWorkspace({ rules: null });
  try {
    const rules = loadRules(workspace.root);
    assert.equal(rules.terminalStatuses, null);
    assert.equal(rules.requiredInterfaces, null);
    assert.deepEqual(rules.withheld.map((entry) => entry.check), ['S3.terminal-status', 'S3.interface-mapping']);
    assert.ok(rules.withheld.every((entry) => entry.layer === 'rules' && entry.reason.length > 0));
  } finally {
    workspace.remove();
  }
});

// @verifies C001
test('a malformed rules file raises UNREADABLE_RULES with the path and a repair', () => {
  const workspace = materializeSmoothWorkspace({ rules: null });
  try {
    writeFileSync(join(workspace.root, RULES_FILE_NAME), '{not json');
    assert.throws(
      () => loadRules(workspace.root),
      (error) => error.code === 'UNREADABLE_RULES'
        && error.path.endsWith(RULES_FILE_NAME)
        && typeof error.repair === 'string'
        && error.repair.includes(RULES_FILE_NAME),
    );
  } finally {
    workspace.remove();
  }
});

test('a rules file with an unsupported schema version is refused', () => {
  const workspace = materializeSmoothWorkspace({ rules: { schemaVersion: 2, terminalStatuses: ['closed'] } });
  try {
    assert.throws(() => loadRules(workspace.root), (error) => error.code === 'UNREADABLE_RULES');
  } finally {
    workspace.remove();
  }
});

test('a rules list with a non-string member is refused', () => {
  const workspace = materializeSmoothWorkspace({ rules: { schemaVersion: 1, terminalStatuses: ['closed', 7] } });
  try {
    assert.throws(() => loadRules(workspace.root), (error) => error.code === 'UNREADABLE_RULES');
  } finally {
    workspace.remove();
  }
});

test('duplicate declarations are removed in first-seen order', () => {
  const workspace = materializeSmoothWorkspace({
    rules: { schemaVersion: 1, terminalStatuses: ['closed', 'aborted', 'closed'], requiredInterfaces: ['grpc', 'grpc'] },
  });
  try {
    const rules = loadRules(workspace.root);
    assert.deepEqual(rules.terminalStatuses, ['closed', 'aborted']);
    assert.deepEqual(rules.requiredInterfaces, ['grpc']);
  } finally {
    workspace.remove();
  }
});
