import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  renderAssetConcept,
  renderAssetManual,
} from '../../.claude/scripts/amend-rfc-up/okf-asset/render.mjs';

const TEXT = '#!/usr/bin/env python3\nprint("probe")\n';
const SHA = createHash('sha256').update(TEXT, 'utf8').digest('hex');

// [::TICKET::] PX-438 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-438 --for-spec --no-implementation-order`.
function concept(root = 'infra-kit') {
  return renderAssetConcept({
    measurement: {
      path: `${root}/probe.py`,
      root,
      kind: 'text',
      text: TEXT,
      sha256: SHA,
      bytes: Buffer.byteLength(TEXT, 'utf8'),
      lines: 2,
      language: 'python',
    },
    meta: {
      type: 'Procedure',
      description: 'Endpoint probe',
      requires: ['pages/pre-okf-original/15-minimum-path-acceptance'],
    },
  });
}

test('an asset concept is path-addressed and independent of the root name', () => {
  const first = concept('infra-kit');
  const second = concept('EXEC_ASSETS');
  assert.equal(first.id, 'pages/assets/probe-py');
  assert.equal(first.id, second.id);
  assert.equal(first.frontmatter['x-asset-sha256'], SHA);
  assert.equal(first.frontmatter['x-source-span'], '1-2');
  assert.deepEqual(first.frontmatter['x-requires'], [
    'pages/pre-okf-original/15-minimum-path-acceptance',
  ]);
});

test('the asset body contains the exact file text and a footnote', () => {
  const page = concept();
  assert.ok(page.body.startsWith('## infra-kit/probe.py'));
  assert.ok(page.body.includes(TEXT.trimEnd()));
  assert.ok(page.body.includes('[^exec-asset-probe-py]'));
  assert.equal(
    page.contentSha256,
    createHash('sha256').update(page.body, 'utf8').digest('hex'),
  );
});

test('the manual states that a build has no assets', () => {
  const manual = renderAssetManual({ assets: [] });
  assert.match(manual, /## Execution Assets/);
  assert.match(manual, /No execution assets/);
});

test('the manual teaches lookup, hash verification, and copy', () => {
  const manual = renderAssetManual({ assets: [concept()] });
  assert.match(manual, /list --path pages\/assets/);
  assert.match(manual, /x-asset-sha256/);
  assert.match(manual, /copy/i);
});
