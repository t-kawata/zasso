// @verifies C001
// @verifies C002
/**
 * PX-424 — source admission, measurement, and claim provenance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureSources, extractClaims } from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/atoms.mjs';
import {
  assertClaimBijection,
  buildClaimRegistry,
  promoteUnsourced,
  reviewClaims,
} from '../../../.claude/scripts/amend-rfc-up/okf-engine/scripts/lib/claims.mjs';

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function createSourceTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'okf-sources-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}

test('C001: measureSources admits English Markdown and rejects empty information', () => {
  const root = createSourceTree({
    'guide.md': '# Auth\n\nTokens expire after 15 minutes.\n',
    'empty.md': '# Empty\n',
  });
  try {
    const measured = measureSources({ root, paths: ['guide.md'] });
    assert.equal(measured.manifest[0].alias, 'sources/guide.md');
    assert.match(measured.manifest[0].sha256, /^[0-9a-f]{64}$/);
    assert.ok(measured.atoms.some((atom) => atom.type === 'Claim'));
    assert.throws(
      () => measureSources({ root, paths: ['empty.md'] }),
      (error) => error.code === 'INFORMATION_ZERO',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001: CRLF and LF hashes are equal and source bytes are unchanged', () => {
  const root = createSourceTree({
    'lf.md': '# Auth\n\nTokens expire after 15 minutes.\n',
    'crlf.md': '# Auth\r\n\r\nTokens expire after 15 minutes.\r\n',
  });
  try {
    const before = readFileSync(join(root, 'crlf.md'));
    const lf = measureSources({ root, paths: ['lf.md'] });
    const crlf = measureSources({ root, paths: ['crlf.md'] });
    assert.equal(crlf.manifest[0].sha256, lf.manifest[0].sha256);
    assert.deepEqual(readFileSync(join(root, 'crlf.md')), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002: claim registry is a bijection and unsourced claims are rejected', () => {
  const root = createSourceTree({ 'guide.md': '# Auth\n\nTokens expire after 15 minutes.\n' });
  try {
    const measured = measureSources({ root, paths: ['guide.md'] });
    const claims = extractClaims({ atoms: measured.atoms });
    const registry = buildClaimRegistry({ claims });
    for (const claim of claims) {
      assert.match(claim.source, /^sources\//);
      assert.ok(Number.isInteger(claim.span.start_line));
      assert.match(claim.content_sha256, /^[0-9a-f]{64}$/);
    }
    assert.equal(assertClaimBijection({ atoms: measured.atoms, registry }), true);
    assert.throws(
      () => assertClaimBijection({ atoms: measured.atoms, registry: registry.slice(1) }),
      (error) => error.code === 'CLAIM_REGISTRY_MISMATCH',
    );
    const unsourced = reviewClaims({ claims: [{ ...claims[0], source: '' }] });
    assert.equal(unsourced.unsourced.length, 1);
    assert.throws(() => promoteUnsourced(unsourced), /CLAIM_UNSOURCED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001: metadata labels and separators are not claims', () => {
  const root = createSourceTree({
    'meta.md': '# Doc\n\n**Status:** Normative\n\n---\n\nThe adapter must not authorize.\n',
  });
  try {
    const measured = measureSources({ root, paths: ['meta.md'] });
    assert.equal(measured.claims.length, 1);
    assert.equal(measured.claims[0].text, 'The adapter must not authorize.');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
