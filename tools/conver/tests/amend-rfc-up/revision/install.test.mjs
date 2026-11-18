// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C003
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { installWithRollback } from '../../../.claude/scripts/amend-rfc-up/revision/install.mjs';

test('C003: a failed post-check restores the baseline and leaves no partial install', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'revision-install-'));
  try {
    const staging = join(workspace, 'staging');
    const target = join(workspace, 'target');
    const backupRoot = join(workspace, 'backup');
    mkdirSync(staging, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(staging, 'new.txt'), 'new\n');
    writeFileSync(join(target, 'baseline.txt'), 'baseline\n');
    assert.throws(
      () => installWithRollback({ staging, target, backupRoot, postCheck: () => false }),
      (error) => error.code === 'REVISION_INSTALL_BLOCKED',
    );
    assert.equal(readFileSync(join(target, 'baseline.txt'), 'utf8'), 'baseline\n');
    assert.equal(existsSync(join(target, 'new.txt')), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('C003: a passing post-check installs the staging tree', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'revision-install-ok-'));
  try {
    const staging = join(workspace, 'staging');
    const target = join(workspace, 'target');
    const backupRoot = join(workspace, 'backup');
    mkdirSync(staging, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(staging, 'new.txt'), 'new\n');
    writeFileSync(join(target, 'baseline.txt'), 'baseline\n');
    const result = installWithRollback({ staging, target, backupRoot, postCheck: () => true });
    assert.equal(result.installed, true);
    assert.equal(readFileSync(join(target, 'new.txt'), 'utf8'), 'new\n');
    assert.equal(existsSync(join(target, 'baseline.txt')), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
