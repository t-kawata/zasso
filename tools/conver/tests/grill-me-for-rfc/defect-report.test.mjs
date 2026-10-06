// PX-239 @verifies C002
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
/**
 * The workspace inventory, and the gate that makes full resolution binding.
 *
 * A defect that no fix inside one directory can reach is still this run's defect.
 * The gate reads each package's defect ledger out of its RFC — never a side file,
 * because a second source of truth is what the seed divergence ledger exists to
 * eliminate — and refuses a package that carries no ledger at all, since an
 * unread neighbour is indistinguishable from a clean one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_DEFECT_REPORT, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

const TABLE_HEADER =
  '| Defect | Class | Target | Disposition | Evidence | Ground |\n|---|---|---|---|---|---|';

/**
 * A package directory whose RFC carries a defect ledger.
 *
 * @param {string} root — the fixture workspace root
 * @param {string} packageName — the directory the package occupies
 * @param {object[]} rows — ledger rows, already shaped for the six columns
 * @returns {string} the package directory
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function writeDefectLedger(root, packageName, rows) {
  const dir = join(root, packageName);
  mkdirSync(dir, { recursive: true });
  const body = rows
    .map((row) => `| ${row.defect} | ${row.cls} | ${row.target} | ${row.disp} | ${row.evidence} | ${row.ground} |`)
    .join('\n');
  writeFileSync(
    join(dir, 'RFC.md'),
    `# RFC\n\n## Appendix C. Cross-directory defect ledger\n\n${TABLE_HEADER}\n${body}\n`,
    'utf8',
  );
  return dir;
}

/** A package whose RFC carries the appendix but no rows. */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function writeEmptyLedger(root, packageName, body) {
  const dir = join(root, packageName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'RFC.md'),
    `# RFC\n\n## Appendix C. Cross-directory defect ledger\n\n${body}\n`,
    'utf8',
  );
  return dir;
}

const RESOLVED_OTHER = {
  defect: 'read result type named three ways',
  cls: 'deficiency',
  target: 'crates/ports/gaia-ports/RFC.md',
  disp: 'resolved-other',
  evidence: 'crates/ports/gaia-ports/RFC.md @ 2026-10-06',
  ground: '§3.12-§3.14',
};

const RESOLVED_HERE = {
  defect: 'seed forbids a transaction handle while requiring commit',
  cls: 'contradiction',
  target: 'RFC.md',
  disp: 'resolved-here',
  evidence: '§3.9.4',
  ground: 'atomicity is a batch, not a handle',
};

test('C002 postcondition: a fully resolved workspace passes the gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg-other', [RESOLVED_OTHER]);
  writeDefectLedger(root, 'pkg-here', [RESOLVED_HERE, { ...RESOLVED_OTHER, disp: 'withdrawn', evidence: 'RFC.md §4.4, CheckList.md' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 0, result.stderr);
});

test('C002 postcondition: a cell written as a code span is read as its content', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  const dir = writeDefectLedger(root, 'pkg', [RESOLVED_OTHER]);
  const rfcPath = join(dir, 'RFC.md');
  // The nine migrated packages write the target and the class as code spans. A cell's
  // value is what it holds, not the markup that holds it.
  writeFileSync(
    rfcPath,
    readFileSync(rfcPath, 'utf8')
      .replace('| deficiency |', '| `deficiency` |')
      .replace('| crates/ports/gaia-ports/RFC.md |', '| `crates/ports/gaia-ports/RFC.md` |'),
    'utf8',
  );

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 0, result.stderr);
});

test('C002 postcondition: a row with no disposition fails the gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_HERE, disp: '' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /pkg/, 'the package is named');
});

test('C002 postcondition: resolved-other without a date is not a resolution', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_OTHER, evidence: 'crates/ports/gaia-ports/RFC.md' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /evidence|date/i, 'the missing half of the evidence is named');
});

test('C002 invariant: open and unresolved are not dispositions', () => {
  for (const word of ['open', 'unresolved']) {
    const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
    writeDefectLedger(root, 'pkg', [{ ...RESOLVED_HERE, disp: word }]);

    const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

    assert.equal(result.status, 1, `${word} must be rejected`);
    assert.match(result.stderr, /disposition/i, `${word} is refused as a disposition`);
  }
});

test('C002 invariant: a class outside the three is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_HERE, cls: 'bug' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /class/i, 'the offending column is named');
});

test('C002 postcondition: a target that is not an RFC is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_OTHER, target: 'crates/ports/gaia-ports/NOTES.md' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /target/i);
});

test('C002 postcondition: a whitespace-only ground is an empty ground', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_HERE, ground: '   ' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ground/i);
});

test('C002 boundary: no appendix fails, a zero-row appendix with a composition check passes', () => {
  const bare = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeFileSync(join(bare, 'RFC.md'), '# RFC\n\n## Design\n', 'utf8');
  mkdirSync(join(bare, 'pkg'), { recursive: true });
  writeFileSync(join(bare, 'pkg', 'RFC.md'), '# RFC\n\n## Design\n', 'utf8');

  assert.equal(
    runCommand(GRILL_DEFECT_REPORT, [bare, '--gate']).status,
    1,
    'a package that carries no ledger has not been read',
  );

  const checked = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeEmptyLedger(
    checked,
    'pkg',
    'No defect. Composition check: read gaia-foundation §2 and gaia-ports §3.9.4; every type\ncrossing each edge is declared on both sides.',
  );

  assert.equal(
    runCommand(GRILL_DEFECT_REPORT, [checked, '--gate']).status,
    0,
    'no defect is a result when the checks that establish it are recorded',
  );
});

test('C002 boundary: a zero-row appendix with no composition check fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeEmptyLedger(root, 'pkg', 'No defect.');

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /composition/i, 'an unrecorded check is not a result');
});

test('C002 invariant: the ledger is read from the RFC, never from a side file', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  const dir = writeDefectLedger(root, 'pkg', [RESOLVED_OTHER]);
  writeFileSync(join(dir, 'RFC.md'), '# RFC\n\n## Design\n', 'utf8');
  writeFileSync(join(dir, 'Defects.json'), JSON.stringify([RESOLVED_OTHER]), 'utf8');

  const result = runCommand(GRILL_DEFECT_REPORT, [root, '--gate']);

  assert.equal(
    result.status,
    1,
    'a second source of truth must not satisfy the gate',
  );
  assert.match(result.stderr, /ledger|appendix/i, 'the RFC is what was read, and it has none');
});

test('C002 boundary: without --gate the same workspace reports and exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, 'pkg', [{ ...RESOLVED_HERE, disp: '' }]);

  const result = runCommand(GRILL_DEFECT_REPORT, [root]);

  assert.equal(result.status, 0, 'the table is a report; the gate is the verdict');
  assert.match(result.stdout, /pkg/, 'the table names the package');
});

test('C002 invariant: the workspace is walked, so a nested package is read', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-defects-'));
  writeDefectLedger(root, join('crates', 'ports', 'gaia-ports'), [RESOLVED_OTHER]);

  assert.equal(runCommand(GRILL_DEFECT_REPORT, [root, '--gate']).status, 0);
});
