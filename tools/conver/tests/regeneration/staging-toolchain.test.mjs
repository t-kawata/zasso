import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openTransaction } from '../../.claude/scripts/regeneration/lib/transaction.mjs';
import { materializeChainWorkspace } from './helpers/chain-fixture.mjs';

const RAIL_SCRIPT = '.claude/scripts/educe-sequences/rail/checks.mjs';

test('staging carries the educe rail that ad-hoc checks import from the spec directory', () => {
  const workspace = materializeChainWorkspace();
  try {
    const railPath = join(workspace.root, RAIL_SCRIPT);
    mkdirSync(dirname(railPath), { recursive: true });
    writeFileSync(railPath, 'export const CHECKS = [];\n');

    const opened = openTransaction({
      root: workspace.root,
      candidateSpec: workspace.candidatePath,
      reason: 'carry the toolchain the ad-hoc checks import',
    });

    assert.equal(existsSync(join(opened.stagingRoot, RAIL_SCRIPT)), true);
  } finally {
    workspace.remove();
  }
});
