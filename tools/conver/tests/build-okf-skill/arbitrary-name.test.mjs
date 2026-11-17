import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeAssetTree, removeAssetTree } from './lib/asset-fixtures.mjs';
import { measureAsset } from '../../.claude/scripts/amend-rfc-up/okf-asset/measure.mjs';
import { renderAssetConcept } from '../../.claude/scripts/amend-rfc-up/okf-asset/render.mjs';
import { assetTreeDigest } from '../../.claude/scripts/amend-rfc-up/okf-asset/ledger.mjs';

const TEXT = '#!/usr/bin/env python3\nprint("probe")\n';

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function conceptFor(root, rootName) {
  const measured = measureAsset({
    absolutePath: join(root, rootName, 'probe.py'),
    relativePath: `${rootName}/probe.py`,
    root,
  });
  return renderAssetConcept({
    measurement: measured,
    meta: {
      type: 'Procedure',
      description: 'Endpoint probe',
      requires: ['pages/pre-okf-original/15-minimum-path-acceptance'],
    },
  });
}

test('renaming the asset root preserves concept identity and content hash', () => {
  const first = makeAssetTree({ 'EXEC_ASSETS/probe.py': TEXT });
  const second = makeAssetTree({ 'infra-kit/probe.py': TEXT });
  try {
    const execAssetsConcept = conceptFor(first, 'EXEC_ASSETS');
    const renamedRootConcept = conceptFor(second, 'infra-kit');
    assert.equal(execAssetsConcept.id, 'pages/assets/probe-py');
    assert.equal(execAssetsConcept.id, renamedRootConcept.id);
    assert.equal(execAssetsConcept.frontmatter['x-asset-sha256'], renamedRootConcept.frontmatter['x-asset-sha256']);
    assert.ok(execAssetsConcept.body.includes(TEXT.trimEnd()));
    assert.ok(renamedRootConcept.body.includes(TEXT.trimEnd()));
  } finally {
    removeAssetTree(first);
    removeAssetTree(second);
  }
});

test('the asset-tree digest is independent of the root name', () => {
  const first = assetTreeDigest([
    { path: 'EXEC_ASSETS/probe.py', root: 'EXEC_ASSETS', sha256: 'abc' },
  ]);
  const second = assetTreeDigest([
    { path: 'infra-kit/probe.py', root: 'infra-kit', sha256: 'abc' },
  ]);
  assert.equal(first, second);
});
