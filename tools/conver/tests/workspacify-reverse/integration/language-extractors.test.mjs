// @verifies C001
// @verifies C002
/**
 * The six-language extraction through the published artefacts.
 *
 * The unit suite proves the records' shape and honesty in memory; this one
 * proves the same facts survive a run — that `analyze --through=r1` completes
 * for every representative, that the published `STRUCTURE.json` carries the
 * same E1-E4 the measurement produced, and that the ledger names every
 * language's tool rather than leaving a language absent from the record.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SIX = Object.freeze([...TARGET_LANGUAGES]);

/** Where this suite's analyses stop: R1 is the structure measurement. */
const THROUGH_R1 = 'r1';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P24-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-2 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-2-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('IT: a full R1 run over each representative publishes STRUCTURE.json carrying E1-E4 for that language', async () => {
  for (const language of SIX) {
    const out = scratchOutput();
    const outcome = await analyzeProject({
      root: join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]),
      out: out.root,
      through: THROUGH_R1,
    });

    assert.ok(outcome.structure.packages.length > 0, `${language} E1 must reach the run`);
    assert.ok(outcome.structure.publicItems.length > 0, `${language} E2 must reach the run`);

    const published = JSON.parse(readFileSync(join(out.root, 'STRUCTURE.json'), 'utf8'));
    for (const item of ['packages', 'publicItems', 'types', 'errorTypes']) {
      assert.deepEqual(
        published[item],
        outcome.structure[item],
        `${language}: STRUCTURE.json must carry the ${item} the measurement produced`,
      );
    }
    out.dispose();
  }
});

test('IT: the attempt ledger names all six languages\' tools, so a language is visible rather than absent', async () => {
  for (const language of SIX) {
    const out = scratchOutput();
    await analyzeProject({
      root: join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]),
      out: out.root,
      through: THROUGH_R1,
    });

    const attempts = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-ATTEMPTS.json'), 'utf8'));
    assert.ok(
      attempts.rows.some((row) => row.tool === `tree-sitter-${language}`),
      `${language} must appear in the ledger`,
    );
    assert.equal(
      attempts.rows.some((row) => row.reason === 'no_extractor_for_language'),
      false,
      `${language} must no longer be skipped for want of an extractor`,
    );
    out.dispose();
  }
});
