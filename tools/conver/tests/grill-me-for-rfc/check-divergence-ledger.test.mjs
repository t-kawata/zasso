// PX-239 @verifies C003
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
/**
 * The seed divergence ledger's structural gate.
 *
 * The ledger answers the precedence question a reader otherwise guesses at: the RFC
 * is canonical and the three stage-1 artifacts beside it are inputs. The gate checks
 * the record's shape, so a departure cannot quietly disappear — and it deliberately
 * does not require a design-tree coverage table, because gaia-foundation carries none
 * and a gate that fails on a real package is a gate nobody can pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_CHECK_DIVERGENCE_LEDGER, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

const PRECEDENCE =
  'RFC.md is canonical for this package. RFC-SEED.md, INFO-RFC-SEED.md and\n' +
  'EXPLAIN-RFC-SEED.md are the stage-1 inputs this run read; they are not authorities.';

const TABLE_HEADER =
  '| Artifact | Location | What the artifact says | What this document decides | Ground |\n' +
  '|---|---|---|---|---|';

/**
 * A package holding a seed divergence ledger and a design tree.
 *
 * @param {string} dir — the package directory
 * @param {object[]} rows — ledger rows
 * @param {{ withNode?: boolean, nodeStatus?: string, withHeader?: boolean }} [options]
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function writeDivergenceLedger(dir, rows, { withNode = true, nodeStatus = 'resolved', withHeader = true } = {}) {
  const body = rows
    .map((row) => `| ${row.artifact} | ${row.location} | ${row.says} | ${row.decides} | ${row.ground} |`)
    .join('\n');
  const table = withHeader ? `${TABLE_HEADER}\n${body}\n` : `${body}\n`;
  writeFileSync(
    join(dir, 'RFC.md'),
    `# RFC\n\n## Appendix E. Seed divergence ledger\n\n${PRECEDENCE}\n\n${table}`,
    'utf8',
  );
  const nodes = withNode ? [{ id: 'seed-divergence-ledger', status: nodeStatus, children: [] }] : [];
  writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify({ nodes }), 'utf8');
}

const DIVERGENT_ROW = {
  artifact: 'RFC-SEED.md',
  location: '§13',
  says: 'no trait method signatures are defined at stage one',
  decides: 'they are defined here, in §3 and §4',
  ground: 'the grill forbids scope delegation',
};

test('C003 postcondition: a well-formed ledger passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [DIVERGENT_ROW]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 0, result.stderr);
});

test('C003 postcondition: a cell written as a code span is read as its content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [DIVERGENT_ROW]);
  const rfcPath = join(dir, 'RFC.md');
  // The nine migrated packages write the artifact as `RFC-SEED.md`, a code span. A cell's
  // value is what it holds, not the markup that holds it.
  writeFileSync(rfcPath, readFileSync(rfcPath, 'utf8').replace('| RFC-SEED.md |', '| `RFC-SEED.md` |'), 'utf8');

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 0, result.stderr);
});

test('C003 boundary: an empty ledger passes — no departure is a result, not an omission', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, []);

  assert.equal(runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]).status, 0);
});

test('C003 error: a row naming an artifact outside the stage-1 set fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [{ ...DIVERGENT_ROW, artifact: 'NOTES.md' }]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /NOTES\.md/);
});

test('C003 postcondition: a location may name a block that carries no section number', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  // EXPLAIN-RFC-SEED.md is organised as A1..An, B1..Bn and a pre-decisions block; the nine
  // real ledgers point at those names. The rule is that a location resolves *inside* the
  // artifact, not that every artifact numbers its parts.
  writeDivergenceLedger(dir, [
    { ...DIVERGENT_ROW, artifact: 'EXPLAIN-RFC-SEED.md', location: 'pre-decisions' },
    { ...DIVERGENT_ROW, artifact: 'EXPLAIN-RFC-SEED.md', location: 'settled item B5' },
    { ...DIVERGENT_ROW, artifact: 'EXPLAIN-RFC-SEED.md', location: 'A13 and A18' },
  ]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 0, result.stderr);
});

test('C003 error: an empty location fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [{ ...DIVERGENT_ROW, location: '' }]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /location/i);
});

test('C003 error: a location naming the artifact itself does not resolve inside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [{ ...DIVERGENT_ROW, location: 'RFC-SEED.md' }]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /location/i);
});

test('C003 error: an empty ground fails, and says so distinctly from a bad artifact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [{ ...DIVERGENT_ROW, ground: '' }]);

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /ground/i);
});

test('C003 error: a missing precedence statement fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeFileSync(
    join(dir, 'RFC.md'),
    '# RFC\n\n## Appendix E. Seed divergence ledger\n\n' +
      `${TABLE_HEADER}\n| RFC-SEED.md | §13 | deferred | defined here | §3 |\n`,
    'utf8',
  );
  writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify({ nodes: [{ id: 'seed-divergence-ledger', status: 'resolved', children: [] }] }), 'utf8');

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /precedence|canonical/i);
});

test('C003 error: a ledger that is absent fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeFileSync(join(dir, 'RFC.md'), '# RFC\n\n## Design\n', 'utf8');
  writeFileSync(join(dir, 'DesignTree.json'), JSON.stringify({ nodes: [] }), 'utf8');

  const result = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /divergence ledger/i, 'the absent appendix is named in full');
});

test('C003 error: a missing or unresolved seed-divergence-ledger node fails', () => {
  const absent = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(absent, [DIVERGENT_ROW], { withNode: false });
  const missing = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [absent]);

  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /seed-divergence-ledger/);

  const unresolved = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(unresolved, [DIVERGENT_ROW], { nodeStatus: 'open' });
  const open = runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [unresolved]);

  assert.equal(open.status, 1);
  assert.match(open.stderr, /seed-divergence-ledger/);
});

test('C003 boundary: no design-tree coverage table is not a failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'px239-div-'));
  writeDivergenceLedger(dir, [DIVERGENT_ROW]); // the RFC carries no Appendix A coverage table

  assert.equal(
    runCommand(GRILL_CHECK_DIVERGENCE_LEDGER, [dir]).status,
    0,
    'gaia-foundation has no coverage table, so requiring one would fail the nine',
  );
});
