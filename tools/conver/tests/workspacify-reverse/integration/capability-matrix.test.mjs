// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The derived capability matrix through a published run.
 *
 * The unit suite pins the derivation in memory. This one pins that it survives a
 * run: that `CAPABILITY-MATRIX.json` is published, that the language the run
 * actually read has `partial` cells while the languages it did not are
 * `not_attempted`, that the document equals the value derived independently from
 * the same run's own attempt ledger, and that the report renders it.
 *
 * The equality is the assertion that matters most. The matrix is built and never
 * served today, and a served matrix that could disagree with its own ledger
 * would be worse than one that was never shown.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAPABILITY_DECISIONS,
  deriveCapabilityMatrix,
  explainCell,
} from '../../../.claude/scripts/workspacify-reverse/lib/capability-matrix.mjs';
import {
  EXTRACTION_ITEMS,
  LANGUAGES_WITH_EXTRACTORS,
  TARGET_LANGUAGES,
} from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import { REPRESENTATIVE_ROOTS } from '../../../.claude/scripts/workspacify-reverse/lib/language-representatives.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The last stage that reads and writes without executing the subject. */
const THROUGH_R2 = 'r2';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P24-7, P24-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P24-7|P24-8) --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-7-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test('IT: a run publishes the matrix its own ledger derives, and the report renders it', async () => {
  for (const language of TARGET_LANGUAGES) {
    const fixture = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS[language]);
    const out = scratchOutput();

    await analyzeProject({ root: fixture, out: out.root, through: THROUGH_R2 });

    const ledger = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-ATTEMPTS.json'), 'utf8'));
    assert.equal(ledger.rows.length > 0, true, `${language}: the run produced a ledger to derive from`);

    const published = JSON.parse(readFileSync(join(out.root, 'CAPABILITY-MATRIX.json'), 'utf8'));
    const expected = deriveCapabilityMatrix({
      ledger,
      families: LANGUAGES_WITH_EXTRACTORS,
      decisions: CAPABILITY_DECISIONS,
    });

    assert.deepEqual(published.matrix, expected.matrix, `${language}: the document equals its own ledger's derivation`);
    assert.notEqual(
      published.matrix[language].E1,
      'not_attempted',
      `${language} was attempted by this run, so the cell is not a silence`,
    );
    // `partial` is the value a run earns when nothing it tried failed. A
    // representative that carries a file the grammar had to recover on reads
    // `failed` instead, with the contradiction named — the instrument does not
    // claim a family works while part of it did not.
    if (published.matrix[language].E1 === 'failed') {
      assert.equal(published.sources[`${language}/E1`].contradictory, true, `${language}: both rows are named`);
      assert.ok(published.sources[`${language}/E1`].rows.some((row) => row.status === 'failed'));
      assert.ok(published.sources[`${language}/E1`].rows.some((row) => row.status === 'success'));
    } else {
      assert.equal(published.matrix[language].E1, 'partial');
    }

    for (const other of TARGET_LANGUAGES.filter((name) => name !== language)) {
      assert.equal(published.matrix[other].E1, 'not_attempted', `${other} was not in this population`);
    }
    assert.equal(published.matrix[language].E13, 'unsupported_in_principle', 'the decided cell is carried in every run');
    assert.equal(published.sources[`${language}/E1`].derivedFrom, 'ledger');
    assert.equal(published.sources[`${language}/E13`].derivedFrom, 'decision');
    assert.equal(Array.isArray(published.unattributable), true);
    assert.deepEqual(published.unattributable, [], `${language}: every row of this run names its language`);

    const report = readFileSync(join(out.root, 'R0-R2-REPORT.md'), 'utf8');
    assert.match(report, /\| E1 \|/, `${language}: the report renders the matrix rather than leaving it unserved`);
    assert.match(report, /limitation of the instrument/i);

    out.dispose();
  }
});

test('IT: the matrix is served, never consulted — a shallow run and a deeper one publish different matrices from different ledgers', async () => {
  const fixture = join(PROJECT_ROOT, REPRESENTATIVE_ROOTS.rust);

  const shallow = scratchOutput();
  await analyzeProject({ root: fixture, out: shallow.root, through: THROUGH_R2 });
  const shallowMatrix = JSON.parse(readFileSync(join(shallow.root, 'CAPABILITY-MATRIX.json'), 'utf8'));

  const deeper = scratchOutput();
  await analyzeProject({ root: fixture, out: deeper.root, through: 'r3' });
  const deeperMatrix = JSON.parse(readFileSync(join(deeper.root, 'CAPABILITY-MATRIX.json'), 'utf8'));

  assert.equal(shallowMatrix.matrix.rust.E7, 'not_attempted', 'R3 did not run, so its family has no attempt');
  assert.equal(deeperMatrix.matrix.rust.E7, 'partial', 'R3 ran, so its family has one');
  assert.notDeepEqual(shallowMatrix.matrix, deeperMatrix.matrix, 'the matrix follows the run rather than a constant');

  const explanation = explainCell({ language: 'rust', item: 'E7', ledger: { rows: [] } });
  assert.equal(explanation.rows.length, 0);
  assert.equal(EXTRACTION_ITEMS.includes('E7'), true);

  for (const out of [shallow, deeper]) {
    assert.equal(typeof out.root, 'string');
    out.dispose();
  }
});
