// PX-390 @verifies C001 C002 C003
/**
 * The formula handoff: the ledger smooth certifies, the sidecar graphify consumes,
 * and the boundary between mechanical repair and AI judgment.
 *
 * Every fixture states the ledger and the sidecar independently, so a class can only
 * come from the comparison under test. The applier writes only in the mechanical
 * classes; a judgment class must leave the target byte-identical.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeRfcDigest,
  extractFormulas,
  readFormulaLedger,
  uniqueFormulas,
  validateFormulaSidecar,
} from '../../.claude/scripts/spec-formula/index.mjs';
import { sha256Hex } from '../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import {
  HANDOFF_CLASS,
  applyFormulaHandoff,
  inspectFormulaHandoff,
  sectionMatchesHeading,
} from '../../.claude/scripts/spec-formula/handoff.mjs';
import { ownedFormulasForPackage } from '../../.claude/scripts/spec-formula/ownership.mjs';

const SPEC_TEXT = [
  '# Specification',
  '',
  '\\[ W=2^b \\]',
  '',
  'The inline identity is \\( E=K+1 \\).',
  '',
].join('\n');

const SPEC_DIGEST = sha256Hex(Buffer.from(SPEC_TEXT, 'utf8'));

const RFC_BODY = [
  '# Package',
  '',
  '## 14.1 The width domain',
  '',
  'The width is carried by a named constant.',
  '',
].join('\n');

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function formulas() {
  return uniqueFormulas(extractFormulas(SPEC_TEXT));
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function ledgerRowText(formula, { section = '14.1', verification = 'tests/symbol.rs::width', tests = 'tests/symbol.rs::width' } = {}) {
  const theory = `symbols: ${formula.body.trim().split('=')[0]} = value; normative: ${formula.body.trim()}`;
  return `| \`${formula.id}\` ( ${formula.body.trim()} ) | spec.md:L${formula.lineStart}-L${formula.lineStart} | §${section}:L${formula.lineStart}-L${formula.lineStart} | ${theory} | structural | src/symbol.rs#WIDTH | A named constant carries the value. | ${tests} |`;
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function renderLedger(formulasToWrite, { section = '14.1' } = {}) {
  return [
    '## Formula ledger',
    '',
    `- specDigest: \`${SPEC_DIGEST}\``,
    `- rfcDigest: \`${computeRfcDigest(RFC_BODY)}\``,
    '',
    '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |',
    '|---|---|---|---|---|---|---|---|',
    ...formulasToWrite.map((formula) => ledgerRowText(formula, { section })),
    '',
  ].join('\n');
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function renderRfc(formulasToWrite, { section = '14.1', body = RFC_BODY } = {}) {
  return `${body}\n${renderLedger(formulasToWrite, { section })}`;
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function sidecarRow(formula, { section = '14.1', rfcSection = section, theory } = {}) {
  return {
    id: formula.id,
    digest: formula.digest,
    body: formula.body,
    display: formula.display,
    normalized: formula.normalized,
    specLocation: { path: 'spec.md', lineStart: formula.lineStart, lineEnd: formula.lineStart },
    rfcLocation: { section, lineStart: formula.lineStart, lineEnd: formula.lineStart },
    theory: theory ?? {
      symbols: [{ symbol: formula.body.trim().split('=')[0], definition: 'value' }],
      normative: [formula.body.trim()],
    },
    implementation: {
      class: 'structural',
      rfcSection,
      location: 'src/symbol.rs#WIDTH',
      symbols: ['src/symbol.rs#WIDTH'],
      design: 'A named constant carries the value.',
      verification: 'tests/symbol.rs::width',
    },
    tests: ['tests/symbol.rs::width'],
  };
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function sidecarFor(formulasToWrite, { rfcDigest = computeRfcDigest(RFC_BODY), rows = null, section = '14.1' } = {}) {
  return {
    version: 1,
    specDigest: SPEC_DIGEST,
    rfcDigest,
    specPath: 'spec.md',
    rfcPath: 'RFC.md',
    formulas: rows ?? formulasToWrite.map((formula) => sidecarRow(formula, { section })),
  };
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function seedText(sourceSegments = ['seg-1']) {
  return [
    '# RFC Seed',
    '',
    '```json',
    JSON.stringify({
      package: { id: 'pkg-a', name: 'a', path: 'pkg-a' },
      source_spec: { path: 'spec.md', sha256: SPEC_DIGEST },
      source_segments: sourceSegments,
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'f'.repeat(64) },
    }, null, 2),
    '```',
    '',
  ].join('\n');
}

const TREE_MANIFEST = Object.freeze({
  workspace: { packages: [{ id: 'pkg-a', path: 'pkg-a' }] },
  structure: { segments: [{ id: 'seg-1', line_start: 1, line_end: 6 }] },
});

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function baseInput(overrides = {}) {
  return {
    rfcText: renderRfc(formulas()),
    seedText: seedText(),
    specText: SPEC_TEXT,
    treeManifest: TREE_MANIFEST,
    ledger: null,
    sidecar: null,
    ...overrides,
  };
}

// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function withLedger(overrides = {}) {
  const rfcText = overrides.rfcText ?? renderRfc(formulas());
  return {
    ...baseInput(overrides),
    rfcText,
    ledger: readFormulaLedger(rfcText),
  };
}

test('C001 ownership: the seed segments select the owned formulas and name unresolved segments', () => {
  const ownership = ownedFormulasForPackage({
    seedText: seedText(['seg-1', 'missing-segment']),
    specText: SPEC_TEXT,
    treeManifest: TREE_MANIFEST,
  });

  assert.deepEqual(ownership.owned.map((formula) => formula.id).sort(), formulas().map((formula) => formula.id).sort());
  assert.deepEqual(ownership.unresolvedSegments, ['missing-segment']);
});

test('C001 stale mirror: a sidecar with fewer rows is stale, not current', () => {
  const all = formulas();
  const report = inspectFormulaHandoff(withLedger({ sidecar: sidecarFor(all, { rows: [sidecarRow(all[0])] }) }));

  assert.equal(report.class, HANDOFF_CLASS.STALE_MIRROR);
  assert.deepEqual(report.ledgerOnly, [all[1].id]);
  assert.equal(report.findings.some((finding) => finding.code === 'STALE_SIDECAR'), true);
});

test('C001 postcondition: the applier mirrors every ledger row and preserves an AI-authored rfcSection', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const all = formulas();
    const existing = sidecarRow(all[0], { rfcSection: 'CUSTOM SECTION' });
    const report = inspectFormulaHandoff(withLedger({ sidecar: sidecarFor(all, { rows: [existing] }) }));
    const targetPath = join(root, 'RFC-FORMULAS.json');

    const applied = applyFormulaHandoff({
      targetPath,
      report,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText: report.rfcText,
    });

    assert.equal(applied.ok, true, JSON.stringify(applied.findings));
    const written = JSON.parse(readFileSync(targetPath, 'utf8'));
    assert.deepEqual(written.formulas.map((row) => row.id).sort(), all.map((formula) => formula.id).sort());
    assert.equal(written.formulas.find((row) => row.id === all[0].id).implementation.rfcSection, 'CUSTOM SECTION');
    assert.equal(written.formulas.find((row) => row.id === all[1].id).implementation.rfcSection, '14.1 The width domain');
    assert.deepEqual(validateFormulaSidecar(written, report.ledger), []);
    assert.equal(written.formulas.every((row) => row.body.length > 0 && row.tests.length > 0), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 missing sidecar: the applier creates it from the ledger', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const report = inspectFormulaHandoff(withLedger());
    assert.equal(report.class, HANDOFF_CLASS.MISSING_SIDECAR);
    const targetPath = join(root, 'RFC-FORMULAS.json');

    const applied = applyFormulaHandoff({
      targetPath,
      report,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText: report.rfcText,
    });

    assert.equal(applied.ok, true, JSON.stringify(applied.findings));
    assert.equal(applied.written, true);
    assert.deepEqual(validateFormulaSidecar(JSON.parse(readFileSync(targetPath, 'utf8')), report.ledger), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 invariant: an invalid ledger is refused and no file is invented', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const all = formulas();
    const rfcText = renderRfc(all).replace('tests/symbol.rs::width |', ' |');
    const report = inspectFormulaHandoff(withLedger({ rfcText }));
    const targetPath = join(root, 'nested', 'RFC-FORMULAS.json');

    assert.equal(report.class, HANDOFF_CLASS.LEDGER_INVALID);
    const applied = applyFormulaHandoff({
      targetPath,
      report,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText,
    });

    assert.equal(applied.ok, false);
    assert.equal(applied.findings.some((finding) => finding.code === 'LEDGER_INVALID'), true);
    assert.equal(existsSync(targetPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 sidecar-only content is a judgment class and writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const all = formulas();
    const targetPath = join(root, 'RFC-FORMULAS.json');
    writeFileSync(targetPath, JSON.stringify(sidecarFor(all, { rows: [sidecarRow(all[0]), sidecarRow(all[0])] })));
    const report = inspectFormulaHandoff(withLedger({ sidecar: sidecarFor(all) }));
    const extra = { ...sidecarFor(all), formulas: [...sidecarFor(all).formulas, { ...sidecarRow(all[0]), id: 'fx-ffffffffffff' }] };
    const extraReport = inspectFormulaHandoff(withLedger({ sidecar: extra }));
    const before = readFileSync(targetPath, 'utf8');

    assert.equal(extraReport.class, HANDOFF_CLASS.SIDECAR_ONLY_CONTENT);
    const applied = applyFormulaHandoff({
      targetPath,
      report: extraReport,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText: extraReport.rfcText,
    });

    assert.equal(applied.ok, false);
    assert.equal(readFileSync(targetPath, 'utf8'), before);
    assert.equal(report.class, HANDOFF_CLASS.CURRENT);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 a field conflict is a judgment class and writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const all = formulas();
    const targetPath = join(root, 'RFC-FORMULAS.json');
    writeFileSync(targetPath, JSON.stringify(sidecarFor(all)));
    const conflicting = sidecarFor(all, {
      rows: [sidecarRow(all[0], { theory: { symbols: [], normative: [] } }), sidecarRow(all[1])],
    });
    const report = inspectFormulaHandoff(withLedger({ sidecar: conflicting }));
    const before = readFileSync(targetPath, 'utf8');

    assert.equal(report.class, HANDOFF_CLASS.FIELD_CONFLICT);
    assert.equal(applyFormulaHandoff({
      targetPath,
      report,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText: report.rfcText,
    }).ok, false);
    assert.equal(readFileSync(targetPath, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 section ambiguity lists the candidates and the AI choice is applied explicitly', () => {
  const root = mkdtempSync(join(tmpdir(), 'formula-handoff-'));
  try {
    const all = formulas();
    const ambiguousBody = [
      '# Package',
      '',
      '## 14.1 First domain',
      '',
      '## 14.1 Second domain',
      '',
    ].join('\n');
    const rfcText = renderRfc(all, { body: ambiguousBody });
    const targetPath = join(root, 'RFC-FORMULAS.json');
    const report = inspectFormulaHandoff(withLedger({ rfcText, sidecar: sidecarFor(all) }));

    assert.equal(report.class, HANDOFF_CLASS.SECTION_AMBIGUOUS);
    assert.equal(report.sections.ambiguous[0].candidates.length, 2);

    writeFileSync(targetPath, JSON.stringify(sidecarFor(all)));
    const before = readFileSync(targetPath, 'utf8');
    assert.equal(applyFormulaHandoff({
      targetPath,
      report,
      mode: 'mirror-ledger',
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText,
    }).ok, false);
    assert.equal(readFileSync(targetPath, 'utf8'), before);

    writeFileSync(targetPath, JSON.stringify(sidecarFor(all)));
    const chosen = applyFormulaHandoff({
      targetPath,
      report,
      mode: 'apply-sections',
      chosenSections: { [all[0].id]: '14.1 First domain', [all[1].id]: '14.1 Second domain' },
      seedText: seedText(),
      specText: SPEC_TEXT,
      rfcText,
    });
    assert.equal(chosen.ok, true, JSON.stringify(chosen.findings));
    const written = JSON.parse(readFileSync(targetPath, 'utf8'));
    assert.equal(written.formulas[0].rfcLocation.section, '14.1 First domain');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 an unresolved section is a judgment class', () => {
  const all = formulas();
  const rfcText = renderRfc(all, { section: '99.9' });
  const report = inspectFormulaHandoff(withLedger({ rfcText, sidecar: sidecarFor(all, { section: '99.9' }) }));

  assert.equal(report.class, HANDOFF_CLASS.SECTION_UNRESOLVED);
  assert.equal(report.sections.unresolved.length, all.length);
});

test('C003 no owned formula is the only no-formula class', () => {
  const report = inspectFormulaHandoff(baseInput({ seedText: seedText([]) }));

  assert.equal(report.class, HANDOFF_CLASS.NO_OWNED_FORMULAS);
  assert.equal(report.ok, true);
});

test('C003 a package that owns formulas without a ledger is not no-formula', () => {
  const report = inspectFormulaHandoff(baseInput());

  assert.equal(report.class, HANDOFF_CLASS.MISSING_LEDGER);
  assert.equal(report.ok, false);
});

test('C003 section matching respects a token boundary', () => {
  assert.equal(sectionMatchesHeading('14.1 The width domain', '14.1'), true);
  assert.equal(sectionMatchesHeading('14.10 The other domain', '14.1'), false);
  assert.equal(sectionMatchesHeading('§14.1 The width domain', '14.1'), true);
  assert.equal(sectionMatchesHeading('14.1 The width domain', '14.1 The width domain'), true);
  assert.equal(sectionMatchesHeading('Unrelated', '14.1'), false);
});
