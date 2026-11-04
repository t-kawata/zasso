// PX-360 @verifies C001
// [::TICKET::] PX-360 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-360 --for-spec --no-implementation-order`.
/**
 * A workspace whose packages own disjoint specification lines.
 *
 * One package moving one formula is the only difference between the passing and
 * failing tests, so a finding can only come from the comparison under test.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeRfcDigest,
  digestFormula,
  extractFormulas,
  normalizeFormula,
  uniqueFormulas,
} from '../../../.claude/scripts/spec-formula/index.mjs';
import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';

export const SPEC_TEXT = [
  '# Specification',
  '',
  '\\[ M=2^b \\]',
  '',
  'The inline identity is \\( N=K+1 \\).',
  '',
].join('\n');

export const SPEC_PATH = 'spec.md';
export const SEGMENTS = Object.freeze([
  { id: 'seg-a', line_start: 1, line_end: 3 },
  { id: 'seg-b', line_start: 4, line_end: 6 },
]);

export function formulaAt(line) {
  return uniqueFormulas(extractFormulas(SPEC_TEXT)).find((formula) => formula.lineStart === line);
}

/** One ledger row, with the optional field left empty when a test asks for a defect. */
export function ledgerRow(formula, { empty = '' } = {}) {
  const implementationClass = formula.lineStart === 5 ? 'notation' : 'structural';
  const design = empty === 'design' ? '' : 'A named constant or type alias carries the value.';
  const theory = empty === 'theory' ? '' : `symbols: ${formula.body.trim().split('=')[0]} = value; normative: ${formula.body.trim()}`;
  const tests = empty === 'tests' ? '' : 'tests/format.rs::value_is_carried';
  return `| \`${formula.id}\` ( ${formula.body.trim()} ) | ${SPEC_PATH}:L${formula.lineStart}-L${formula.lineStart} | §Design:L${formula.lineStart}-L${formula.lineStart} | ${theory} | ${implementationClass} | src/format.rs#VALUE | ${design} | ${tests} |`;
}

export function sidecarRow(formula, { empty = '' } = {}) {
  return {
    id: formula.id,
    digest: formula.digest,
    body: formula.body,
    display: formula.display,
    normalized: formula.normalized,
    specLocation: { path: SPEC_PATH, lineStart: formula.lineStart, lineEnd: formula.lineStart },
    rfcLocation: { section: 'Design', lineStart: formula.lineStart, lineEnd: formula.lineStart },
    theory: {
      symbols: empty === 'theory' ? [] : [{ symbol: formula.body.trim().split('=')[0], definition: 'value' }],
      normative: empty === 'theory' ? [] : [formula.body.trim()],
    },
    implementation: {
      class: formula.lineStart === 5 ? 'notation' : 'structural',
      location: 'src/format.rs#VALUE',
      symbols: ['src/format.rs#VALUE'],
      design: empty === 'design' ? '' : 'A named constant or type alias carries the value.',
      verification: 'tests/format.rs::value_is_carried',
    },
    tests: empty === 'tests' ? [] : ['tests/format.rs::value_is_carried'],
  };
}

/** Render one package's RFC with the formulas it was given. */
export function renderRfc(formulas, { empty = '', includeRow = () => true, invented = false } = {}) {
  const body = '# Package\n\n## Design\n\nThe value is carried by a named symbol.\n';
  const rows = formulas.filter(includeRow).map((formula) => ledgerRow(formula, { empty }));
  if (invented) {
    rows.push('| `fx-ffffffffffff` ( Z=9 ) | spec.md:L99-L99 | §Design:L99-L99 | symbols: Z = invented; normative: Z=9 | structural | src/format.rs#Z | A constant. | tests/format.rs::z |');
  }
  return [
    body,
    '## Formula ledger',
    '',
    `- specDigest: \`${sha256Hex(Buffer.from(SPEC_TEXT, 'utf8'))}\``,
    `- rfcDigest: \`${computeRfcDigest(body)}\``,
    '',
    '| Formula | Spec location | RFC location | Theory | Class | Implemented by | Implementation design | Verification |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// [::TICKET::] PX-360, PX-361 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-360|PX-361) --for-spec --no-implementation-order`.
function writePackage(root, { id, path, segments, formulas, rfcOptions = {}, sidecar = true }) {
  const directory = join(root, path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'RFC-SEED.md'), [
    '# RFC Seed',
    '',
    '```json',
    JSON.stringify({
      package: { id, name: id, path },
      source_spec: { path: SPEC_PATH, sha256: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')) },
      source_segments: segments,
      stage1_manifest: { path: 'WORKSPACIFY-TREE-MANIFEST.json', hash: 'f'.repeat(64) },
    }, null, 2),
    '```',
    '',
  ].join('\n'), 'utf8');

  const rfcText = renderRfc(formulas, rfcOptions);
  writeFileSync(join(directory, 'RFC.md'), rfcText, 'utf8');
  if (sidecar) {
    writeFileSync(join(directory, 'RFC-FORMULAS.json'), JSON.stringify({
      version: 1,
      specDigest: sha256Hex(Buffer.from(SPEC_TEXT, 'utf8')),
      rfcDigest: computeRfcDigest(rfcText.slice(0, rfcText.indexOf('## Formula ledger'))),
      specPath: SPEC_PATH,
      rfcPath: 'RFC.md',
      formulas: formulas.filter(rfcOptions.includeRow ?? (() => true)).map((formula) => sidecarRow(formula, { empty: rfcOptions.empty ?? '' })),
    }, null, 2), 'utf8');
  }
  return { id, directory };
}

export function buildWorkspace({ packageA = {}, packageB = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 's8-'));
  const specDigest = sha256Hex(Buffer.from(SPEC_TEXT, 'utf8'));
  writeFileSync(join(root, SPEC_PATH), SPEC_TEXT, 'utf8');

  const all = uniqueFormulas(extractFormulas(SPEC_TEXT));
  const first = all.find((formula) => formula.lineStart === 3);
  const second = all.find((formula) => formula.lineStart === 5);

  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    workspace: { packages: [{ id: 'pkg-a', path: 'pkg-a' }, { id: 'pkg-b', path: 'pkg-b' }] },
    structure: { segments: SEGMENTS },
    integrity: { manifest_hash: 'f'.repeat(64) },
  }, null, 2));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ seed_index: [] }, null, 2));
  writeFileSync(join(root, 'workspace-sequences.json'), JSON.stringify({
    schema_version: 3,
    spec: { path: SPEC_PATH, sha256: specDigest, lines: SPEC_TEXT.split('\n').length },
  }, null, 2));

  const packageOne = writePackage(root, {
    id: 'pkg-a',
    path: 'pkg-a',
    segments: ['seg-a'],
    formulas: [first],
    ...packageA,
  });
  const packageTwo = writePackage(root, {
    id: 'pkg-b',
    path: 'pkg-b',
    segments: ['seg-b'],
    formulas: [second],
    ...packageB,
  });

  return { root, packages: [packageOne, packageTwo], first, second, specDigest };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
