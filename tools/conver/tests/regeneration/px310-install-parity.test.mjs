// PX-310 @verifies C009
// Program fixes live in tools/conver. Gaia is an installed copy. An install
// that leaves the target different from the source must be refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertInstallParity } from '../../.claude/scripts/regeneration/lib/install-parity.mjs';

// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function populate(root, content) {
  mkdirSync(join(root, '.claude/scripts/regeneration/lib'), { recursive: true });
  writeFileSync(join(root, '.claude/scripts/regeneration/lib/transaction.mjs'), content);
}

test('C009 installed bytes equal source bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-install-'));
  try {
    populate(join(root, 'source'), 'export const x = 1;\n');
    populate(join(root, 'target'), 'export const x = 1;\n');
    assert.doesNotThrow(() => assertInstallParity({
      sourceRoot: join(root, 'source'),
      targetRoot: join(root, 'target'),
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C009 a target byte difference is INSTALL_PARITY_MISMATCH', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-install-drift-'));
  try {
    populate(join(root, 'source'), 'export const x = 1;\n');
    populate(join(root, 'target'), 'export const x = 2;\n');
    assert.throws(
      () => assertInstallParity({ sourceRoot: join(root, 'source'), targetRoot: join(root, 'target') }),
      /INSTALL_PARITY_MISMATCH/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C009 a missing target script is INSTALL_PARITY_MISMATCH', () => {
  const root = mkdtempSync(join(tmpdir(), 'px310-install-missing-'));
  try {
    populate(join(root, 'source'), 'export const x = 1;\n');
    mkdirSync(join(root, 'target/.claude/scripts'), { recursive: true });
    assert.throws(
      () => assertInstallParity({ sourceRoot: join(root, 'source'), targetRoot: join(root, 'target') }),
      /INSTALL_PARITY_MISMATCH/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
