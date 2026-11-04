// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * The per-package gate: the formulas this package owns must reach the RFC ledger.
 *
 * The gate is checked against the specification and the tree manifest rather than
 * against a hand-written list, because a list would be the same omission written twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeRfcDigest,
  extractFormulas,
  uniqueFormulas,
} from '../../.claude/scripts/spec-formula/index.mjs';
import { buildWorkspace, specSha, SPEC_TEXT, SPEC_PATH } from '../spec-formula/helpers/workspace.mjs';

const CHECK = fileURLToPath(new URL('../../.claude/scripts/grill-me-for-rfc/check-formula-coverage.js', import.meta.url));

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function buildRfc(workspace, { omit = [], clearDesignFor = [], invented = false, specDigest = specSha() } = {}) {
  const formulas = uniqueFormulas(extractFormulas(SPEC_TEXT));
  const body = '# RFC\n\n## Design\n\nThe symbol model uses a named constant.\n';
  const rows = formulas
    .filter((formula) => !omit.includes(formula.body.trim()))
    .map((formula, index) => {
      const design = clearDesignFor.includes(formula.body.trim())
        ? ''
        : 'A named constant carries the value.';
      return `| \`${formula.id}\` ( ${formula.body.trim()} ) | ${SPEC_PATH}:L${formula.lineStart}-L${formula.lineEnd} | §Design:L${index + 3}-L${index + 3} | symbols: M = bit width; normative: ${formula.body.trim()} | ${index === 1 ? 'notation' : 'structural'} | src/format.rs#BIT_WIDTH | ${design} | tests/format.rs::bit_width_is_eight |`;
    });
  if (invented) {
    rows.push('| `fx-ffffffffffff` ( Z=1 ) | ' + SPEC_PATH + ':L9-L9 | §Design:L9-L9 | symbols: Z = invented; normative: Z=1 | structural | src/format.rs#Z | A constant. | tests/format.rs::z |');
  }
  const rfcText = [
    body,
    '## Formula ledger',
    '',
    `- specDigest: \`${specDigest}\``,
    `- rfcDigest: \`${computeRfcDigest(body)}\``,
    '',
    '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');

  writeFileSync(join(workspace.packageDirectory, 'RFC.md'), rfcText, 'utf8');
  writeFileSync(join(workspace.packageDirectory, 'RFC-FORMULAS.json'), JSON.stringify({
    version: 1,
    specDigest,
    rfcDigest: computeRfcDigest(body),
    specPath: SPEC_PATH,
    rfcPath: 'RFC.md',
    formulas: formulas.map((formula, index) => ({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      display: formula.display,
      normalized: formula.normalized,
      specLocation: { path: SPEC_PATH, lineStart: formula.lineStart, lineEnd: formula.lineEnd },
      rfcLocation: { section: 'Design', lineStart: index + 3, lineEnd: index + 3 },
      theory: { symbols: [{ symbol: 'M', definition: 'bit width' }], normative: [formula.body.trim()] },
      implementation: {
        class: index === 1 ? 'notation' : 'structural',
        location: 'src/format.rs#BIT_WIDTH',
        symbols: ['src/format.rs#BIT_WIDTH'],
        design: 'A named constant carries the value.',
        verification: 'tests/format.rs::bit_width_is_eight',
      },
      tests: ['tests/format.rs::bit_width_is_eight'],
    })),
  }, null, 2));
}

// [::TICKET::] PX-359, PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-359|PX-360|PX-361) --for-spec --no-implementation-order`.
function runCheck(workspace) {
  return spawnSync(process.execPath, [CHECK, workspace.packageDirectory, `--workspace=${workspace.root}`], {
    encoding: 'utf8',
  });
}

test('C001 postcondition: every owned formula in the RFC ledger passes the gate', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace);
  const result = runCheck(workspace);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.ownedFormulas, 2);
  assert.equal(output.ledgerRows, 2);
});

test('C001 error: a missing formula row names the formula id and its specification line', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace, { omit: ['N=K+1'] });
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  const missing = output.findings.find((finding) => finding.code === 'MISSING_LEDGER_ROW');
  assert.ok(missing, JSON.stringify(output.findings));
  assert.match(missing.formulaId, /^fx-[0-9a-f]{12}$/);
  assert.equal(missing.specLine, 5);
});

test('C001 error: an empty implementation design fails by field name', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace, { clearDesignFor: ['M=2^b'] });
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(
    output.findings.some((finding) => finding.field === 'implementation.design'),
    true,
    JSON.stringify(output.findings),
  );
});

test('C001 error: a formula absent from the specification is reported as invented', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace, { invented: true });
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'INVENTED_FORMULA'), true);
});

test('C001 error: a sidecar digest that disagrees with the ledger is refused', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace, { specDigest: '2'.repeat(64) });
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'SPEC_DIGEST_MISMATCH'), true);
});

test('C001 error: an unresolved source_segments id is refused before ownership is computed', () => {
  const workspace = buildWorkspace({ sourceSegments: ['seg-unknown'] });
  buildRfc(workspace);
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'SEGMENT_UNRESOLVED'), true);
});

test('C001 normal: a package with zero owned formulas passes without a ledger or sidecar', () => {
  const workspace = buildWorkspace({ sourceSegments: [] });
  const result = runCheck(workspace);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.ownedFormulas, 0);
});

test('C001 invariant: the sidecar is required beside a populated ledger', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace);
  writeFileSync(join(workspace.packageDirectory, 'RFC-FORMULAS.json'), '{}', 'utf8');
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'MISSING_SIDECAR_FORMULAS'), true);
});

test('C001 error: a sidecar specPath that resolves to another file is refused', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace);
  const sidecarPath = join(workspace.packageDirectory, 'RFC-FORMULAS.json');
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  sidecar.specPath = 'specs/Other.md';
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'SPEC_PATH_MISMATCH'), true);
});

test('C001 error: a sidecar specLocation that differs from the extracted line is refused', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace);
  const sidecarPath = join(workspace.packageDirectory, 'RFC-FORMULAS.json');
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  sidecar.formulas[0].specLocation.lineStart = 1;
  sidecar.formulas[0].specLocation.lineEnd = 1;
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'SPEC_LOCATION_MISMATCH'), true);
});

test('C001 error: a second Formula ledger heading is refused', () => {
  const workspace = buildWorkspace();
  buildRfc(workspace);
  const rfcPath = join(workspace.packageDirectory, 'RFC.md');
  writeFileSync(rfcPath, `${readFileSync(rfcPath, 'utf8')}\n## Formula ledger\n\n`, 'utf8');
  const result = runCheck(workspace);

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.findings.some((finding) => finding.code === 'DUPLICATE_LEDGER_HEADING'), true);
});
