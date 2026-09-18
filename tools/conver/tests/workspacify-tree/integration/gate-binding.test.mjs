// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C005
// [::TICKET::] PX-217: the gate judges every count it computes.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`
//
// These tests drive the real CLI, because the defects they close were defects of
// binding: each check worked when called directly and no test proved it was
// called. A unit test of `checkPortAdapterBoundary` passes either way, so every
// assertion here goes through `run.mjs gate` and reads the run's own report.
//
// Each mutant is one field away from a document that reaches COMPLETE, so a
// refusal can only come from the field under test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stageTreeDecisions } from '../helpers/stage-tree-decisions.mjs';

const RUN_SCRIPT = join(process.cwd(), '.claude/scripts/workspacify-tree/run.mjs');
const FIXTURES = join(process.cwd(), 'tests/workspacify-tree/fixtures');

/** A throwaway subject holding a copy of one fixture, so the run reads nothing of this repository. */
// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function makeSubject(spec) {
  const dir = mkdtempSync(join(tmpdir(), 'wst-binding-'));
  cpSync(join(FIXTURES, spec), join(dir, spec));
  return dir;
}

/** Run `gate` over one fixture with one decisions document, optionally mutated. */
// [::TICKET::] PX-217 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-217 --for-spec --no-implementation-order`.
function runGate({ spec, decisions, mutate = () => {} }) {
  const dir = makeSubject(spec);
  try {
    const document = JSON.parse(readFileSync(join(FIXTURES, decisions), 'utf8'));
    // The gaia fixture ships an inapplicable database policy, which is why the run
    // that exposed D1 never exercised G5 at all. Enable it, then inject.
    if (document.adapters?.databasePolicy) {
      document.adapters.databasePolicy = { applicable: true, rawSqlProhibited: true };
    }
    mutate(document);
    stageTreeDecisions(dir, document);

    const result = spawnSync(process.execPath, [RUN_SCRIPT, 'gate', `--spec=${join(dir, spec)}`], {
      cwd: dir,
      encoding: 'utf8',
    });
    return { exitCode: result.status, report: JSON.parse(result.stdout.trim().split('\n')[0]) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('PX-217 C001 [@verifies C001]: the CLI refuses the migration-atomicity mutant that returned COMPLETE', () => {
  const control = runGate({ spec: 'gaia-like-spec.md', decisions: 'gaia-decisions.json' });
  assert.equal(control.exitCode, 0);
  assert.equal(control.report.status, 'COMPLETE');
  assert.equal(control.report.finalAudit.migration_atomicity_misuse_count, 0);

  const mutant = runGate({
    spec: 'gaia-like-spec.md',
    decisions: 'gaia-decisions.json',
    mutate: (document) => { document.workspace[0].migrationAsAtomicity = true; },
  });
  assert.notEqual(mutant.exitCode, 0);
  assert.match(mutant.report.gates, /G5:FAIL/);
  assert.equal(mutant.report.finalAudit.migration_atomicity_misuse_count, 1);
});

test('PX-217 C002 [@verifies C002]: the CLI refuses an adapter no port implements through', () => {
  const refused = runGate({
    spec: 'gaia-like-spec.md',
    decisions: 'gaia-decisions.json',
    mutate: (document) => { document.workspace[0].kind = 'adapter'; },
  });

  assert.notEqual(refused.exitCode, 0);
  assert.match(refused.report.gates, /G3:REVIEW_REQUIRED/);
  assert.equal(refused.report.finalAudit.unattached_adapter_count, 1);
});

test('PX-217 C002 [@verifies C002]: the CLI refuses a capability no port provides', () => {
  const refused = runGate({
    spec: 'gaia-like-spec.md',
    decisions: 'gaia-decisions.json',
    mutate: (document) => { document.workspace[0].externalImplementations = ['payment']; },
  });

  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.report.finalAudit.missing_port_count, 1);
});

test('PX-217 C003 [@verifies C003]: the published counts carry the collisions the harvest found', () => {
  // `duplicated-objects.md` harvests two objects and two claims that share two
  // normalized keys, so the count is 2 only if buildInventory handed the claim
  // list to normalizeAliases. A zero would be indistinguishable from a harvest
  // that found nothing, which is why the assertion is on the value.
  const report = runGate({ spec: 'duplicated-objects.md', decisions: 'decisions-complete.json' }).report;

  assert.equal(report.finalAudit.object_claim_collision_count, 2);
  assert.equal(report.finalAudit.unresolved_object_claim_collision_count, 2);
});

test('PX-217 C005 [@verifies C005]: a sound run reports the new counts at zero and still completes', () => {
  const control = runGate({ spec: 'objects-table.md', decisions: 'decisions-complete.json' });

  assert.equal(control.exitCode, 0);
  assert.equal(control.report.status, 'COMPLETE');
  for (const name of [
    'migration_atomicity_misuse_count',
    'unattached_adapter_count',
    'missing_port_count',
    'object_claim_collision_count',
    'unresolved_object_claim_collision_count',
    'alias_cycle_count',
  ]) {
    assert.equal(control.report.finalAudit[name], 0, `${name} should be reported as zero`);
  }
});
