// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-297 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The production roots that ship the closure path.
 *
 * The grill and slice tools are project-specific by design and outside this
 * boundary; their couplings are recorded as Boy Scout work rather than hidden
 * inside this scan.
 */
const PRODUCTION_ROOTS = Object.freeze([
  'scripts',
  '.claude/scripts/shared-obligations',
  '.claude/scripts/smooth-sequences',
  '.claude/scripts/educe-sequences',
]);

/** A live workspace path or a workspace root name. */
const FORBIDDEN = /\/Users\/|GAIA_ROOT|GaiaSekkeiShiyousho|shyme\/gaia/;

/** Every production source file under the closure roots. */
// [::TICKET::] PX-297 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-297) --for-spec --no-implementation-order`.
function productionSourceFiles() {
  const files = [];
  for (const root of PRODUCTION_ROOTS) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root, { recursive: true })) {
      if (!/\.(mjs|js|cjs)$/.test(name)) continue;
      files.push(join(root, name));
    }
  }
  return files;
}

test('C007 the closure production tree carries no live workspace coupling', () => {
  const files = productionSourceFiles();
  assert.ok(files.length > 0, 'the scan found no production source files');
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), FORBIDDEN, file);
  }
});

test('C007 the gaia-specific generator and its test are removed from conver', () => {
  assert.equal(existsSync('scripts/gaia-reevidence/generate.mjs'), false);
  assert.equal(existsSync('tests/gaia-reevidence/contracts.test.mjs'), false);
});
