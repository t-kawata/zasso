// @verifies C009
// @verifies C013
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDocumentMap } from '../../../.claude/scripts/amend-rfc-up/revision/document.mjs';
import { inferRevisionContext, validateRevisionContext } from '../../../.claude/scripts/amend-rfc-up/revision/context.mjs';
import { assertLedger } from '../../../.claude/scripts/amend-rfc-up/revision/ledger.mjs';
import { applyOkfRevision } from '../../../.claude/scripts/amend-rfc-up/okf-revision/apply.mjs';

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// [::TICKET::] PX-445 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-445 --for-spec --no-implementation-order`.
function makeBaseline(root) {
  mkdirSync(join(root, 'source'), { recursive: true });
  writeJson(join(root, 'source/concept-inventory.json'), {
    schema: 'okf-concept-inventory/v1',
    entries: [{ id: 'pages/reference/old', path: 'pages/reference/old.md', source: 'sources/OLD.md' }],
  });
  writeJson(join(root, 'atoms.lock.json'), { schema: 'okf-atoms/v2', concepts: [] });
  writeJson(join(root, 'source/coverage.json'), { schema: 'okf-source-coverage/v1', counts: { unmappedHeadings: 0, unmappedPreamble: 0, unmappedLines: 0 } });
  writeJson(join(root, 'source/okf-log.json'), { schema: 'okf-log/v1', entries: [] });
  writeJson(join(root, 'package.json'), { name: 'mini-okf', version: '0.1.0' });
}

test('the OKF adapter ingests a reference article without law rule semantics', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'okf-adapter-'));
  try {
    const baselineSkill = join(workspace, 'baseline-okf');
    const outDir = join(workspace, 'staged-okf');
    makeBaseline(baselineSkill);
    const sourceText = '# Reference\n\n## Authentication\n\nTokens expire after 15 minutes.\n';
    const sourceAlias = 'sources/reference.md';
    const map = buildDocumentMap({ text: sourceText, alias: sourceAlias });
    const plan = {
      schema: 'revision-plan/v1',
      skill: 'mini-okf',
      role: 'okf-reference',
      adapter: 'okf',
      revision: { sha256: map.sha256 },
      operations: [
        {
          op: 'add-source',
          source_alias: sourceAlias,
          concept_prefix: 'pages',
          evidence: { line: 5, line_sha256: map.lineHashes[4] },
        },
      ],
      interpretations: [],
      coherence: {
        required: ['body', 'source', 'graph', 'index', 'log', 'freshness', 'trust', 'asset'],
        dispositions: Object.fromEntries(
          ['body', 'source', 'graph', 'index', 'log', 'freshness', 'trust', 'asset']
            .map((name) => [name, { unchanged: 'reference article adds a concept; no law artifact' }]),
        ),
      },
    };
    const context = inferRevisionContext({
      skillName: 'mini-okf',
      adapter: 'okf',
      documentMap: map,
      baseline: { version: '0.1.0', digest: 'baseline-digest' },
      plan,
      ticket: { date: '2026-11-18' },
      env: {},
    });
    assert.equal(context.role, 'okf-reference');
    validateRevisionContext(context);
    const result = await applyOkfRevision({
      baselineSkill,
      role: context.role,
      plan,
      documentMap: map,
      context,
      outDir,
      sourceText,
      sourceAlias,
    });
    assert.equal(result.coverage.counts.unmapped, 0);
    assert.equal(result.coherence.gaps.length, 0);
    assert.doesNotThrow(() => assertLedger(result.ledger));
    assert.equal(existsSync(join(outDir, 'pages/reference/authentication.md')), true);
    const inventory = JSON.parse(readFileSync(join(outDir, 'source/concept-inventory.json'), 'utf8'));
    assert.equal(inventory.entries.some((entry) => entry.id === 'pages/reference/authentication'), true);
    assert.equal(inventory.entries.some((entry) => entry.id === 'pages/reference/old'), true);
    const log = JSON.parse(readFileSync(join(outDir, 'source/revision/revision-log.json'), 'utf8'));
    assert.equal(log.deterministic, true);
    assert.equal(log.status, 'installed');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
