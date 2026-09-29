// PX-223 @verifies C003
//
// A seed path names one directory, and the whole point of the focused view is that the
// reader can trust which directory it is describing. Every shape that does not name exactly
// one package therefore fails rather than resolving to the nearest candidate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';
import { WorkspacifyOrderError } from '../../../.claude/scripts/workspacify-order/lib/errors.mjs';
import { focusPackage } from '../../../.claude/scripts/workspacify-order/lib/levels.mjs';

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function fixture(t) {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  t.after(() => workspace.remove());
  return workspace;
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function packagesOf(workspace) {
  return JSON.parse(readFileSync(workspace.treeManifestPath, 'utf8')).workspace.packages;
}

test('C003 precondition: a seed path inside the root resolves to the package whose path it is', (t) => {
  const workspace = fixture(t);

  const focused = focusPackage({
    root: workspace.root,
    seedPath: workspace.seedPathOf('pkg-0002'),
    packages: packagesOf(workspace),
  });

  assert.equal(focused.id, 'pkg-0002');
  assert.equal(focused.path, workspace.pathOf.get('pkg-0002'));
});

test('C003 precondition: a relative seed path is resolved against the given base before it is matched', (t) => {
  const workspace = fixture(t);
  const absolute = workspace.seedPathOf('pkg-0001');
  const relative = absolute.slice(workspace.root.length + 1);

  const focused = focusPackage({
    root: workspace.root,
    seedPath: relative,
    packages: packagesOf(workspace),
    baseDirectory: workspace.root,
  });

  assert.equal(focused.id, 'pkg-0001');
});

test('C003 invariant: a seed path outside the root fails', (t) => {
  const workspace = fixture(t);

  assert.throws(
    () => focusPackage({ root: workspace.root, seedPath: '/tmp/RFC-SEED.md', packages: packagesOf(workspace) }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('outside'),
  );
});

test('C003 invariant: a path whose basename is not a seed fails', (t) => {
  const workspace = fixture(t);

  assert.throws(
    () => focusPackage({
      root: workspace.root,
      seedPath: join(workspace.root, workspace.pathOf.get('pkg-0001'), 'README.md'),
      packages: packagesOf(workspace),
    }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('RFC-SEED.md'),
  );
});

test('C003 invariant: a seed no package owns fails instead of matching a prefix', (t) => {
  const workspace = fixture(t);
  const orphanDirectory = join(workspace.root, 'crates', 'protocol', 'package-1', 'nested');
  writeFileSync(join(workspace.root, 'crates', 'protocol', 'package-1', 'RFC-SEED.md'), '# RFC Seed: pkg-0001\n');

  assert.throws(
    () => focusPackage({
      root: workspace.root,
      seedPath: join(orphanDirectory, 'RFC-SEED.md'),
      packages: packagesOf(workspace),
    }),
    (error) => error instanceof WorkspacifyOrderError && error.message.includes('no package'),
  );
});
