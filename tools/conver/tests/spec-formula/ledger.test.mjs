// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The RFC formula ledger and its sidecar.
 *
 * The ledger is the document a reader checks; the sidecar is the record a later stage
 * consumes. Both must carry the same specification and RFC digests, and every row must
 * name its theory, its implementation class, its implementation site and its tests, or a
 * silent omission would look like a complete transcription.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMULA_CLASSES,
  computeRfcDigest,
  digestFormula,
  normalizeFormula,
  readFormulaLedger,
  validateFormulaLedger,
  validateFormulaSidecar,
} from '../../.claude/scripts/spec-formula/index.mjs';

export const SPEC_DIGEST = 'a'.repeat(64);
export const RFC_BODY = '# Design\n\nThe symbol model uses `BIT_WIDTH`.\n';

const LEDGER_ROW = '| `fx-0123456789ab` ( M=2^b ) | spec.md:L10-L10 | §Design > Symbol model:L4-L4 | symbols: M = bit width; normative: M=2^b | structural | src/format.rs#BIT_WIDTH | A named constant carries the bit width. | tests/format.rs::bit_width_is_eight |';

export function renderLedger({ specDigest = SPEC_DIGEST, rfcDigest = computeRfcDigest(RFC_BODY), rows = [LEDGER_ROW] } = {}) {
  return [
    RFC_BODY,
    '## Formula ledger',
    '',
    `- specDigest: \`${specDigest}\``,
    `- rfcDigest: \`${rfcDigest}\``,
    '',
    '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

export function sidecarFor({ specDigest = SPEC_DIGEST, rfcDigest = computeRfcDigest(RFC_BODY) } = {}) {
  return {
    version: 1,
    specDigest,
    rfcDigest,
    specPath: 'spec.md',
    rfcPath: 'RFC.md',
    formulas: [
      {
        id: 'fx-0123456789ab',
        digest: digestFormula(normalizeFormula('M=2^b')),
        body: ' M=2^b ',
        display: true,
        normalized: 'M=2^b',
        specLocation: { path: 'spec.md', lineStart: 10, lineEnd: 10 },
        rfcLocation: { section: 'Design > Symbol model', lineStart: 4, lineEnd: 4 },
        theory: { symbols: [{ symbol: 'M', definition: 'bit width' }], normative: ['M=2^b'] },
        implementation: {
          class: 'structural',
          location: 'src/format.rs#BIT_WIDTH',
          symbols: ['src/format.rs#BIT_WIDTH'],
          design: 'A named constant carries the bit width.',
          verification: 'tests/format.rs::bit_width_is_eight',
        },
        tests: ['tests/format.rs::bit_width_is_eight'],
      },
    ],
  };
}

test('C001 postcondition: the ledger parses metadata and one structured row', () => {
  const ledger = readFormulaLedger(renderLedger());

  assert.equal(ledger.specDigest, SPEC_DIGEST);
  assert.equal(ledger.rfcDigest, computeRfcDigest(RFC_BODY));
  assert.equal(ledger.rows.length, 1);
  assert.equal(ledger.rows[0].id, 'fx-0123456789ab');
  assert.equal(ledger.rows[0].implementation.class, 'structural');
  assert.deepEqual(ledger.rows[0].theory.normative, ['M=2^b']);
  assert.deepEqual(ledger.rows[0].tests, ['tests/format.rs::bit_width_is_eight']);
});

test('C001 invariant: all four realization classes are accepted', () => {
  assert.deepEqual([...FORMULA_CLASSES], ['computational', 'structural', 'constraint', 'notation']);

  for (const formulaClass of FORMULA_CLASSES) {
    const row = LEDGER_ROW.replace('| structural |', `| ${formulaClass} |`);
    const findings = validateFormulaLedger(readFormulaLedger(renderLedger({ rows: [row] })));

    assert.equal(findings.length, 0, `${formulaClass} must be accepted: ${JSON.stringify(findings)}`);
  }
});

test('C001 error: a missing theory, design or test field fails by field name', () => {
  const cases = [
    { row: LEDGER_ROW.replace('symbols: M = bit width; normative: M=2^b', ''), field: 'theory' },
    { row: LEDGER_ROW.replace('A named constant carries the bit width.', ''), field: 'implementation.design' },
    { row: LEDGER_ROW.replace('tests/format.rs::bit_width_is_eight', ''), field: 'tests' },
    { row: LEDGER_ROW.replace('| structural |', '| prose |'), field: 'implementation.class' },
    { row: LEDGER_ROW.replace('src/format.rs#BIT_WIDTH', ''), field: 'implementation.symbols' },
  ];

  for (const { row, field } of cases) {
    const findings = validateFormulaLedger(readFormulaLedger(renderLedger({ rows: [row] })));

    assert.equal(findings.length > 0, true, `${field} must fail`);
    assert.equal(
      findings.some((finding) => finding.field === field),
      true,
      `${field} must be named: ${JSON.stringify(findings)}`,
    );
  }
});

test('C001 invariant: the sidecar and the ledger must carry matching digests and ids', () => {
  const ledger = readFormulaLedger(renderLedger());
  const matching = validateFormulaSidecar(sidecarFor(), ledger);
  assert.equal(matching.length, 0, JSON.stringify(matching));

  const movedSpec = validateFormulaSidecar(sidecarFor({ specDigest: 'b'.repeat(64) }), ledger);
  assert.equal(movedSpec.some((finding) => finding.code === 'SPEC_DIGEST_MISMATCH'), true);

  const movedRfc = validateFormulaSidecar(sidecarFor({ rfcDigest: 'c'.repeat(64) }), ledger);
  assert.equal(movedRfc.some((finding) => finding.code === 'RFC_DIGEST_MISMATCH'), true);
});

test('C001 invariant: the RFC digest ignores the ledger appendix it describes', () => {
  const withoutAppendix = `${RFC_BODY}\nThe body changed.\n`;

  assert.equal(computeRfcDigest(renderLedger()), computeRfcDigest(RFC_BODY));
  assert.notEqual(computeRfcDigest(withoutAppendix), computeRfcDigest(RFC_BODY));
});

test('C001 error: a ledger with no appendix or no metadata is refused', () => {
  assert.equal(readFormulaLedger('# Design\n\nNo ledger.'), null);

  const noMetadata = renderLedger().replace(/- specDigest: `[0-9a-f]+`\n/, '');
  const findings = validateFormulaLedger(readFormulaLedger(noMetadata));

  assert.equal(findings.some((finding) => finding.code === 'SPEC_DIGEST_MISSING'), true);
});
