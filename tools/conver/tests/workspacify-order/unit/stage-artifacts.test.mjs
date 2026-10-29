// PX-309 @verifies C005
// The downstream stages are shown by the artifact each command writes. Existence is the
// whole rule, and a stem that names more than one artifact is not guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  artifactStem,
  holdsBoundifyArtifact,
  holdsGraphArtifact,
  holdsSplitArtifact,
} from '../../../.claude/scripts/workspacify-order/lib/workspace.mjs';
import { materializeOrderWorkspace } from '../helpers/order-workspace.mjs';

// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
function packageOf(t, options = {}) {
  const workspace = materializeOrderWorkspace({ packages: ['pkg-0001'], ...options });
  t.after(() => workspace.remove());
  return {
    root: workspace.root,
    packagePath: workspace.pathOf.get('pkg-0001'),
    directory: workspace.directoryOf('pkg-0001'),
  };
}

test('C005 a missing artifact set carries no mark', (t) => {
  const pkg = packageOf(t);
  assert.equal(holdsGraphArtifact(pkg), false);
  assert.equal(holdsBoundifyArtifact(pkg), false);
  assert.equal(holdsSplitArtifact(pkg), false);
  assert.equal(artifactStem(pkg), null);
});

test('C005 each artifact marks its own stage', (t) => {
  const pkg = packageOf(t);
  writeFileSync(join(pkg.directory, 'RFC-GRAPH.json'), '{}');
  assert.equal(holdsGraphArtifact(pkg), true);
  assert.equal(holdsBoundifyArtifact(pkg), false);

  writeFileSync(join(pkg.directory, 'RFC-Dirs-Tree.json'), '{}');
  assert.equal(holdsBoundifyArtifact(pkg), true);

  writeFileSync(join(pkg.directory, 'Tickets.json'), '{}');
  assert.equal(holdsSplitArtifact(pkg), true);
});

test('C005 a single non-RFC stem is accepted as the artifact stem', (t) => {
  const pkg = packageOf(t);
  writeFileSync(join(pkg.directory, 'DESIGN-GRAPH.json'), '{}');
  assert.equal(artifactStem(pkg), 'DESIGN');
  assert.equal(holdsGraphArtifact(pkg), true);
});

test('C005 two candidate stems are ambiguous and carry no mark', (t) => {
  const pkg = packageOf(t);
  writeFileSync(join(pkg.directory, 'ONE-GRAPH.json'), '{}');
  writeFileSync(join(pkg.directory, 'TWO-GRAPH.json'), '{}');
  assert.equal(artifactStem(pkg), null);
  assert.equal(holdsGraphArtifact(pkg), false);
});
