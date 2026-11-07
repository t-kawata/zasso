// PX-362 @verifies C001
// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-362 --for-spec --no-implementation-order`.
/**
 * Formula obligations reach exactly one implementing ticket with the original
 * specification quotation. The tests move one refusal at a time and assert that
 * Tickets.json is untouched when the merge refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractFormulas,
  uniqueFormulas,
} from '../../.claude/scripts/spec-formula/index.mjs';
import { sha256Hex } from '../../.claude/scripts/workspacify-tree/lib/hash.mjs';

const require = createRequire(import.meta.url);
const { mergeFormulasToTickets } = require('../../.claude/scripts/tickets/merge-formulas-to-tickets.js');
const { renderFormulaObligations } = require('../../.claude/scripts/tickets/show-ticket-context.js');

const SPEC_TEXT = [
  '# Specification',
  '',
  '\\[ M=2^b \\]',
  '',
  '\\[ N=K+1 \\]',
  '',
].join('\n');

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function buildFixture({ tickets = null, sidecarSpecPath = 'spec.md', symbolsFor = () => ['src/symbol.rs#WIDTH'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'formula-tickets-'));
  const specPath = join(root, 'spec.md');
  writeFileSync(specPath, SPEC_TEXT, 'utf8');

  const formulas = uniqueFormulas(extractFormulas(SPEC_TEXT));
  const sidecar = {
    version: 1,
    specDigest: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')),
    rfcDigest: 'a'.repeat(64),
    specPath: sidecarSpecPath,
    rfcPath: 'RFC.md',
    formulas: formulas.map((formula) => ({
      id: formula.id,
      digest: formula.digest,
      body: formula.body,
      display: formula.display,
      normalized: formula.normalized,
      specLocation: { path: 'spec.md', lineStart: formula.lineStart, lineEnd: formula.lineStart },
      rfcLocation: { section: 'Design', lineStart: 1, lineEnd: 1 },
      theory: { symbols: [{ symbol: 'M', definition: 'bit width' }], normative: [formula.body.trim()] },
      implementation: {
        class: 'structural',
        rfcSection: 'Design',
        location: 'src/symbol.rs#WIDTH',
        symbols: symbolsFor(formula),
        design: 'A named constant carries the value.',
        verification: 'tests/symbol.rs::width',
      },
      tests: ['tests/symbol.rs::width'],
    })),
  };
  const sidecarPath = join(root, 'RFC-FORMULAS.json');
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');

  const dirsTree = {
    distribution: {
      digest: 'a'.repeat(64),
      units: {},
      formulas: Object.fromEntries(sidecar.formulas.map((formula) => [formula.id, {
        nodeIds: ['N0001'],
        filePaths: ['src/symbol.rs'],
        symbols: formula.implementation.symbols,
      }])),
    },
  };
  const dirsTreePath = join(root, 'Dirs-Tree.json');
  writeFileSync(dirsTreePath, JSON.stringify(dirsTree, null, 2), 'utf8');

  const ticketsDocument = tickets ?? {
    title: 'fixture',
    metadata: { source: 'test', generatedAt: '2026-01-01' },
    phases: [{
      id: -1,
      name: 'PX',
      tickets: [{
        id: 1,
        phaseId: -1,
        title: 'Implement the symbol',
        status: 'todo',
        contracts: [],
        nodeIds: ['N0001'],
        default_files: ['src/symbol.rs'],
      }],
    }],
  };
  const ticketsPath = join(root, 'Tickets.json');
  writeFileSync(ticketsPath, JSON.stringify(ticketsDocument, null, 2), 'utf8');

  return { root, specPath, sidecarPath, dirsTreePath, ticketsPath, sidecar, ticketsDocument, formulas };
}

// [::TICKET::] PX-362 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-362) --for-spec --no-implementation-order`.
function merge(fixture, options = {}) {
  return mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: fixture.dirsTreePath,
    sidecarPath: fixture.sidecarPath,
    specPath: fixture.specPath,
    treeManifestPath: null,
    write: true,
    ...options,
  });
}

test('C001 postcondition: every formula reaches one ticket with the specification origin', () => {
  const fixture = buildFixture();
  const result = merge(fixture);

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  const tickets = JSON.parse(readFileSync(fixture.ticketsPath, 'utf8')).phases[0].tickets;
  for (const formula of fixture.formulas) {
    const owners = tickets.filter((ticket) => (ticket.formulaObligations ?? []).some((row) => row.id === formula.id));
    assert.equal(owners.length, 1, `${formula.id} must have one implementing ticket`);
    const row = owners[0].formulaObligations.find((candidate) => candidate.id === formula.id);
    assert.equal(row.origin.path, 'spec.md');
    assert.equal(row.origin.line, formula.lineStart);
    assert.ok(row.origin.quote.length > 0);
    assert.equal(row.digest, formula.digest);
    assert.equal(row.implementation.symbol, 'src/symbol.rs#WIDTH');
  }
});

test('C001 error: a formula that reaches no ticket is refused before write', () => {
  const fixture = buildFixture({ tickets: { title: 'fixture', metadata: { source: 'test', generatedAt: '2026-01-01' }, phases: [{ id: -1, name: 'PX', tickets: [{ id: 1, phaseId: -1, title: 'Other', status: 'todo', contracts: [], nodeIds: ['N9999'], default_files: [] }] }] } });
  const before = readFileSync(fixture.ticketsPath, 'utf8');
  const result = merge(fixture);

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'FORMULA_NO_TICKET'), true);
  assert.equal(readFileSync(fixture.ticketsPath, 'utf8'), before);
});

test('C001 error: two tickets implementing one formula are refused as duplicate', () => {
  const fixture = buildFixture();
  const document = JSON.parse(readFileSync(fixture.ticketsPath, 'utf8'));
  document.phases[0].tickets.push({ ...document.phases[0].tickets[0], id: 2, title: 'Second implementer' });
  writeFileSync(fixture.ticketsPath, JSON.stringify(document));
  const result = merge(fixture);

  assert.equal(result.findings.some((finding) => finding.code === 'FORMULA_DUPLICATE_TICKET'), true, JSON.stringify(result.findings));
});

test('C001 error: an origin path of RFC.md is refused', () => {
  const fixture = buildFixture({ sidecarSpecPath: 'RFC.md' });
  const result = merge(fixture);

  assert.equal(result.findings.some((finding) => finding.code === 'ORIGIN_IS_RFC'), true, JSON.stringify(result.findings));
});

test('C001 error: an empty implementation symbol is refused', () => {
  const fixture = buildFixture({ symbolsFor: () => [] });
  const result = merge(fixture);

  assert.equal(result.findings.some((finding) => finding.code === 'IMPLEMENTATION_SYMBOL_MISSING'), true, JSON.stringify(result.findings));
});

test('C004 postcondition: an obligation on a reviewed ticket is an advisory and the status is unchanged', () => {
  const fixture = buildFixture();
  const document = JSON.parse(readFileSync(fixture.ticketsPath, 'utf8'));
  document.phases[0].tickets[0].status = 'reviewed';
  writeFileSync(fixture.ticketsPath, JSON.stringify(document, null, 2), 'utf8');
  const result = merge(fixture);

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.advisories.some((entry) => entry.code === 'FORMULA_OBLIGATION_ON_COMPLETED_TICKET'), true);
  const after = JSON.parse(readFileSync(fixture.ticketsPath, 'utf8'));
  assert.equal(after.phases[0].tickets[0].status, 'reviewed');
});

test('C001 postcondition: show-ticket-context renders the formula obligation', () => {
  const fixture = buildFixture();
  merge(fixture);
  const ticket = JSON.parse(readFileSync(fixture.ticketsPath, 'utf8')).phases[0].tickets[0];
  const rendered = renderFormulaObligations(ticket);

  assert.match(rendered, /## Formula Obligations/);
  assert.match(rendered, new RegExp(fixture.formulas[0].id));
  assert.match(rendered, /spec\.md:L3/);
  assert.match(rendered, /src\/symbol\.rs#WIDTH/);
  assert.match(rendered, /tests\/symbol\.rs::width/);
});

// PX-390 @verifies C003
// [::TICKET::] PX-390 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-390 --for-spec --no-implementation-order`.
function writeLedgerRfc(root) {
  writeFileSync(join(root, 'RFC.md'), [
    '# Package',
    '',
    '## Formula ledger',
    '',
    `- specDigest: \`${sha256Hex(Buffer.from(SPEC_TEXT, 'utf8'))}\``,
    `- rfcDigest: \`${'b'.repeat(64)}\``,
    '',
    '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |',
    '|---|---|---|---|---|---|---|---|',
    '',
  ].join('\n'), 'utf8');
}

test('PX-390 C003 a package with a ledger but no sidecar is named before any read throws', () => {
  const fixture = buildFixture();
  rmSync(fixture.sidecarPath);
  writeLedgerRfc(fixture.root);
  const result = mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: fixture.dirsTreePath,
    sidecarPath: join(fixture.root, 'missing-RFC-FORMULAS.json'),
    specPath: fixture.specPath,
    cwd: fixture.root,
    write: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'MISSING_FORMULA_SIDECAR'), true, JSON.stringify(result.findings));
  assert.equal(JSON.stringify(result.findings).includes('ENOENT'), false);
});

test('PX-390 C003 a package with no ledger and no formula index skips', () => {
  const fixture = buildFixture();
  rmSync(fixture.sidecarPath);
  const emptyDirsTreePath = join(fixture.root, 'Empty-Dirs-Tree.json');
  writeFileSync(emptyDirsTreePath, JSON.stringify({ distribution: { formulas: {} } }), 'utf8');
  writeFileSync(join(fixture.root, 'RFC.md'), '# Package\n\nNo formulas.\n', 'utf8');
  const result = mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: emptyDirsTreePath,
    sidecarPath: join(fixture.root, 'missing-RFC-FORMULAS.json'),
    specPath: fixture.specPath,
    cwd: fixture.root,
    write: false,
  });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.skipped, 'no-formulas');
  assert.deepEqual(result.findings, []);
});

test('PX-390 C003 empty arguments derive the canonical files from the workspace', () => {
  const fixture = buildFixture();
  writeFileSync(join(fixture.root, 'RFC-Dirs-Tree.json'), readFileSync(fixture.dirsTreePath));
  writeFileSync(join(fixture.root, 'RFC-FORMULAS.json'), readFileSync(fixture.sidecarPath));
  writeFileSync(join(fixture.root, 'RFC-SEED.md'), [
    '```json',
    JSON.stringify({ source_spec: { path: 'spec.md', sha256: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')) } }),
    '```',
  ].join('\n'), 'utf8');
  writeFileSync(join(fixture.root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({ structure: { segments: [] } }));
  writeFileSync(join(fixture.root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({}));

  const result = mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: '',
    sidecarPath: '',
    specPath: '',
    cwd: fixture.root,
    write: false,
  });

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.obligations.length, fixture.formulas.length);
});

test('PX-390 C003 a sidecar whose formulas the Dirs-Tree does not index is refused', () => {
  const fixture = buildFixture();
  const emptyDirsTreePath = join(fixture.root, 'Empty-Dirs-Tree.json');
  writeFileSync(emptyDirsTreePath, JSON.stringify({ distribution: { formulas: {} } }), 'utf8');

  const result = mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: emptyDirsTreePath,
    sidecarPath: fixture.sidecarPath,
    specPath: fixture.specPath,
    cwd: fixture.root,
    write: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'FORMULA_INDEX_MISSING'), true, JSON.stringify(result.findings));
});

// PX-390 review @verifies C003
test('PX-390 review: a malformed tree manifest is a named finding, not an exception', () => {
  const fixture = buildFixture();
  const treePath = join(fixture.root, 'Broken-Tree.json');
  writeFileSync(treePath, '{not json', 'utf8');

  const result = mergeFormulasToTickets({
    ticketsPath: fixture.ticketsPath,
    dirsTreePath: fixture.dirsTreePath,
    sidecarPath: fixture.sidecarPath,
    specPath: fixture.specPath,
    treeManifestPath: treePath,
    cwd: fixture.root,
    write: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'UNREADABLE_TREE_MANIFEST'), true, JSON.stringify(result.findings));
});
