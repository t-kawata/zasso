import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { materializeSmoothWorkspace } from '../smooth-sequences/helpers/workspace-fixture.mjs';

const GATES = [
  '.claude/scripts/grill-me-for-rfc/check-obligation-coverage.js',
  '.claude/scripts/grill-me-for-rfc/check-distribution-completeness.js',
  '.claude/scripts/grill-me-for-rfc/check-ledger-discharge.js',
  '.claude/scripts/grill-me-for-rfc/check-contribution-completeness.js',
];

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
test('the workspace gates exit 0 on the fixture workspace', () => {
  const workspace = materializeSmoothWorkspace();
  try {
    for (const script of GATES) {
      const result = spawnSync(process.execPath, [script, workspace.root], { encoding: 'utf8' });
      assert.equal(result.status, 0, `${script}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    }
    const defect = spawnSync(process.execPath, ['.claude/scripts/grill-me-for-rfc/defect-report.js', workspace.root, '--gate'], { encoding: 'utf8' });
    assert.equal(defect.status, 0, defect.stderr);
  } finally {
    workspace.remove();
  }
});
