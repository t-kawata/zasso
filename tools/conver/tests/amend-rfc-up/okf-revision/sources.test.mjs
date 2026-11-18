// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
// @verifies C009
// @verifies C013
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applySourceOperations,
  extractConcepts,
} from '../../../.claude/scripts/amend-rfc-up/okf-revision/sources.mjs';

test('C013: a preamble and an H2 section become separate concepts', () => {
  const text = '# Reference\n\nPreamble knowledge.\n\n## Authentication\n\nTokens expire.\n';
  const concepts = extractConcepts({
    text,
    sourceAlias: 'sources/reference.md',
    date: '2026-11-18',
  });
  assert.equal(concepts.some((concept) => concept.id === 'pages/reference/preamble'), true);
  assert.equal(concepts.some((concept) => concept.id === 'pages/reference/authentication'), true);
});

test('C013: update-source retires a concept that disappeared from the source', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'okf-sources-'));
  try {
    const result = applySourceOperations({
      sourceText: '# Reference\n\n## Authentication\n\nTokens expire.\n',
      sourceAlias: 'sources/reference.md',
      operations: [{ op: 'update-source', source_alias: 'sources/reference.md', concept_prefix: 'pages' }],
      outDir: workspace,
      date: '2026-11-18',
      existingInventory: {
        entries: [
          { id: 'pages/reference/authentication', path: 'pages/reference/authentication.md', source: 'sources/reference.md' },
          { id: 'pages/reference/removed', path: 'pages/reference/removed.md', source: 'sources/reference.md' },
        ],
      },
    });
    assert.deepEqual(result.retired, ['pages/reference/removed']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('C013: reference-only adds a citation without writing a concept', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'okf-reference-'));
  try {
    const result = applySourceOperations({
      sourceText: '# Reference\n',
      sourceAlias: 'sources/reference.md',
      operations: [{ op: 'reference-only', source_alias: 'sources/reference.md', evidence: { line: 1 } }],
      outDir: workspace,
      date: '2026-11-18',
    });
    assert.equal(result.concepts.length, 0);
    assert.equal(result.citations.length, 1);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
