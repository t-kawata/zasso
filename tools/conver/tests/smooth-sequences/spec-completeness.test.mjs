// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
// PX-360 @verifies C001
// [::TICKET::] PX-360 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-360 --for-spec --no-implementation-order`.
/**
 * The workspace formula union is measured against the specification denominator.
 *
 * A union taken from the ledgers would make a formula missing from every package vanish;
 * every test below therefore states the specification set independently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  runSpecCompleteness,
} from '../../.claude/scripts/smooth-sequences/lib/checks-spec-completeness.mjs';
import { buildWorkspace, readJson } from './helpers/formula-workspace.mjs';

test('C001 postcondition: two package ledgers cover the specification set', () => {
  const workspace = buildWorkspace();
  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.summary.specFormulas, 2);
  assert.equal(result.summary.transcribed, 2);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.invented, 0);
});

test('C001 error: a formula missing from its owning package names package, id and line', () => {
  const workspace = buildWorkspace({ packageB: { formulas: [] } });
  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.ok, false);
  const missing = result.findings.find((finding) => finding.checkId === 'S8.formula-missing');
  assert.ok(missing, JSON.stringify(result.findings));
  assert.equal(missing.packageId, 'pkg-b');
  assert.equal(missing.formulaId, workspace.second.id);
  assert.equal(missing.specLine, 5);
  assert.equal(result.worklist.some((row) => row.package === 'pkg-b' && row.formulaId === workspace.second.id), true);
});

test('C001 error: a row absent from the specification is invented', () => {
  const workspace = buildWorkspace({ packageA: { rfcOptions: { invented: true } } });
  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.formula-invented'), true, JSON.stringify(result.findings));
});

test('C001 error: a row without theory fails by field name', () => {
  const workspace = buildWorkspace({ packageA: { rfcOptions: { empty: 'theory' } } });
  const result = runSpecCompleteness({ root: workspace.root });

  const missing = result.findings.find((finding) => finding.checkId === 'S8.theory-incomplete');
  assert.ok(missing, JSON.stringify(result.findings));
  assert.equal(missing.missingField, 'theory');
});

test('C001 error: a row without an implementation design fails by field name', () => {
  const workspace = buildWorkspace({ packageA: { rfcOptions: { empty: 'design' } } });
  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.implementation-design-missing' && finding.missingField === 'implementation.design'), true);
});

test('C001 error invariant: a specification hash mismatch stops before any comparison', () => {
  const workspace = buildWorkspace();
  const artifact = readJson(join(workspace.root, 'workspace-sequences.json'));
  artifact.spec.sha256 = '0'.repeat(64);
  writeFileSync(join(workspace.root, 'workspace-sequences.json'), JSON.stringify(artifact));

  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.spec-hash-mismatch'), true);
  assert.equal(result.summary.transcribed, 0, 'nothing is compared against an unproven denominator');
});

test('C001 error: a waiver that names a missing formula is refused', () => {
  const workspace = buildWorkspace({ packageB: { formulas: [] } });
  const first = runSpecCompleteness({ root: workspace.root });
  const missing = first.findings.find((finding) => finding.checkId === 'S8.formula-missing');
  const waiver = { waivers: [{ findingKey: `S8.formula-missing\u0000${missing.subject}`, ground: 'ignore it' }] };
  writeFileSync(join(workspace.root, 'SMOOTH-SEQUENCES-WAIVERS.json'), JSON.stringify(waiver));

  const refused = runSpecCompleteness({ root: workspace.root });

  assert.equal(refused.findings.some((finding) => finding.checkId === 'S8.waiver-refused'), true, JSON.stringify(refused.findings));
  assert.equal(refused.summary.missing, 1, 'the omission stays in the denominator');
});

test('C001 error: a formula owned by two packages needs a row on both sides', () => {
  const workspace = buildWorkspace();
  // Give pkg-a the union of both segment ranges, so both packages own both formulas.
  const seedPath = join(workspace.root, 'pkg-a', 'RFC-SEED.md');
  const seed = readFileSync(seedPath, 'utf8').replace('"seg-a"', '"seg-a", "seg-b"');
  writeFileSync(seedPath, seed);

  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.cross-package-row-missing'), true, JSON.stringify(result.findings));
  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.formula-missing' && finding.packageId === 'pkg-a'), true);
});

test('C001 error: a formula claimed by no package is unowned', () => {
  const workspace = buildWorkspace();
  const treePath = join(workspace.root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const tree = readJson(treePath);
  tree.structure.segments = tree.structure.segments.map((segment) => (
    segment.id === 'seg-b' ? { ...segment, line_start: 4, line_end: 4 } : segment
  ));
  writeFileSync(treePath, JSON.stringify(tree));

  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.formula-unowned'), true, JSON.stringify(result.findings));
});

test('C001 error: a ledger whose digest does not reproduce the body is stale', () => {
  const workspace = buildWorkspace();
  const rfcPath = join(workspace.root, 'pkg-a', 'RFC.md');
  const rfc = readFileSync(rfcPath, 'utf8').replace(/- rfcDigest: `[0-9a-f]+`/, `- rfcDigest: \`${'0'.repeat(64)}\``);
  writeFileSync(rfcPath, rfc);

  const result = runSpecCompleteness({ root: workspace.root });

  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.ledger-stale'), true, JSON.stringify(result.findings));
});

// PX-389 @verifies C001
// An unowned formula is a segment-ownership defect. The producer named on the finding
// must be a command that can actually change ownership, or the repair loop dead-ends.

// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
test('PX-389 C001: an unowned formula names tree-decision regeneration', () => {
  const workspace = buildWorkspace({ packageA: { segments: [] }, packageB: { segments: [] } });
  const result = runSpecCompleteness({ root: workspace.root });

  const unowned = result.findings.filter((finding) => finding.checkId === 'S8.formula-unowned');
  assert.equal(unowned.length > 0, true, JSON.stringify(result.findings));
  assert.equal(unowned.every((finding) => /--tree-decisions/.test(finding.producer)), true, unowned[0].producer);
  assert.equal(unowned.every((finding) => !/--allocate-decisions/.test(finding.producer)), true);
});

// PX-390 @verifies C001 C002
import { existsSync, rmSync } from 'node:fs';
import { repairFormulaHandoffs } from '../../.claude/scripts/smooth-sequences/lib/checks-spec-completeness.mjs';
import { readFormulaLedger, validateFormulaSidecar } from '../../.claude/scripts/spec-formula/index.mjs';

test('PX-390 C001 missing sidecar is created from the certified ledger', () => {
  const workspace = buildWorkspace();
  const sidecarPath = join(workspace.root, 'pkg-a', 'RFC-FORMULAS.json');
  const rfcText = readFileSync(join(workspace.root, 'pkg-a', 'RFC.md'), 'utf8');
  rmSync(sidecarPath);

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.repaired.some((entry) => entry.packageId === 'pkg-a'), true);
  const written = readJson(sidecarPath);
  assert.deepEqual(validateFormulaSidecar(written, readFormulaLedger(rfcText)), []);
});

test('PX-390 C001 a partial sidecar is refreshed to the full ledger', () => {
  const workspace = buildWorkspace();
  const sidecarPath = join(workspace.root, 'pkg-a', 'RFC-FORMULAS.json');
  const sidecar = readJson(sidecarPath);
  sidecar.formulas = [];
  writeFileSync(sidecarPath, JSON.stringify(sidecar));

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  const written = readJson(sidecarPath);
  assert.equal(written.formulas.length, 1);
  assert.equal(written.formulas[0].id, workspace.first.id);
});

test('PX-390 C002 a sidecar-only row is a judgment finding and the file is untouched', () => {
  const workspace = buildWorkspace();
  const sidecarPath = join(workspace.root, 'pkg-a', 'RFC-FORMULAS.json');
  const sidecar = readJson(sidecarPath);
  sidecar.formulas.push({ ...sidecar.formulas[0], id: 'fx-ffffffffffff' });
  writeFileSync(sidecarPath, JSON.stringify(sidecar));
  const before = readFileSync(sidecarPath, 'utf8');

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.formula-handoff' && finding.repairClass === 'judgment-required'), true, JSON.stringify(result.findings));
  assert.equal(readFileSync(sidecarPath, 'utf8'), before);
});

test('PX-390 C003 a package that owns no formula is left without a sidecar', () => {
  const workspace = buildWorkspace({ packageB: { segments: [], formulas: [], sidecar: false } });
  const sidecarPath = join(workspace.root, 'pkg-b', 'RFC-FORMULAS.json');

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.repaired.some((entry) => entry.packageId === 'pkg-b'), false);
  assert.equal(existsSync(sidecarPath), false);
});

// PX-390 review @verifies C001 C003
test('PX-390 review: a malformed seed is a finding, not a crash', () => {
  const workspace = buildWorkspace();
  const sidecarPath = join(workspace.root, 'pkg-a', 'RFC-FORMULAS.json');
  rmSync(sidecarPath);
  writeFileSync(join(workspace.root, 'pkg-a', 'RFC-SEED.md'), '# Seed without identity\n');

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.ok, false);
  assert.equal(result.repaired.length, 0);
  assert.equal(result.findings.some((finding) => finding.checkId === 'S8.formula-handoff'), true, JSON.stringify(result.findings));
  assert.equal(existsSync(sidecarPath), false);
});

test('PX-390 review: a specification hash mismatch writes no sidecar', () => {
  const workspace = buildWorkspace();
  const sidecarPath = join(workspace.root, 'pkg-a', 'RFC-FORMULAS.json');
  rmSync(sidecarPath);
  const artifact = readJson(join(workspace.root, 'workspace-sequences.json'));
  artifact.spec.sha256 = '0'.repeat(64);
  writeFileSync(join(workspace.root, 'workspace-sequences.json'), JSON.stringify(artifact));

  const result = repairFormulaHandoffs({ root: workspace.root });

  assert.equal(result.repaired.length, 0);
  assert.equal(existsSync(sidecarPath), false);
});
