// [::TICKET::] PX-194 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-194 --for-spec --no-implementation-order`.
// PX-194 @verifies C005
// The cross-seed gates run inside the pipeline: a contract that is missing on one
// side or names an undeclared boundary stops the run before anything is published.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { runGate } from '../../../.claude/scripts/workspacify-allocate/run.mjs';
import { materializeSeedFixture, makeDecisions } from '../helpers/build-valid-manifest.mjs';

function silent(callback) {
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  try {
    return callback();
  } finally {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  }
}

function decisionsWith(manifest, mutate) {
  const decisions = makeDecisions(manifest);
  mutate(decisions);
  return decisions;
}

test('C005 a dropped side, an undeclared contract and a weakened clause all stop the run', () => {
  const fixture = materializeSeedFixture();
  try {
    const decisionsPath = join(fixture.dir, 'decisions.json');

    // The provider seed drops its declared contract: the seed-local gate catches it first.
    writeFileSync(decisionsPath, JSON.stringify(decisionsWith(fixture.manifest, (decisions) => {
      decisions.seeds = decisions.seeds.map((seed) => (seed.packageId === 'pkg-a' ? { ...seed, contractEdges: [] } : seed));
    })));
    assert.throws(
      () => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]),
      (error) => error.gateId === 'G3' && /contract-boundary-001/.test(error.message),
    );

    // A contract without a declared boundary is rejected by the local gate too.
    writeFileSync(decisionsPath, JSON.stringify(decisionsWith(fixture.manifest, (decisions) => {
      decisions.seeds[0].contractEdges = [{ ...decisions.seeds[0].contractEdges[0], contract_id: 'contract-ghost' }];
    })));
    assert.throws(
      () => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]),
      (error) => error.gateId === 'G3' && /contract-ghost/.test(error.message),
    );

    // Both sides present and individually valid, but the provider weakens a clause:
    // only the bilateral symmetry gate can see this.
    writeFileSync(decisionsPath, JSON.stringify(decisionsWith(fixture.manifest, (decisions) => {
      decisions.seeds = decisions.seeds.map((seed) => (seed.packageId === 'pkg-a'
        ? { ...seed, contractEdges: seed.contractEdges.map((edge) => ({ ...edge, clauses: { ...edge.clauses, postconditions: ['the provider returns whatever it likes'] } })) }
        : seed));
    })));
    assert.throws(
      () => runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]),
      (error) => error.gateId === 'G4' && /contract-boundary-001/.test(error.message),
    );
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test('C005 a clean payload passes with the cross-seed gates in the summary', () => {
  const fixture = materializeSeedFixture();
  try {
    const decisionsPath = join(fixture.dir, 'decisions.json');
    writeFileSync(decisionsPath, JSON.stringify(makeDecisions(fixture.manifest)));
    let output = '';
    const stdout = process.stdout.write;
    const stderr = process.stderr.write;
    process.stdout.write = (chunk) => { output += chunk; return true; };
    process.stderr.write = () => true;
    try {
      runGate(['gate', fixture.manifestPath, `--decisions=${decisionsPath}`]);
    } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    const summary = JSON.parse(output);
    assert.equal(summary.status, 'COMPLETE');
    assert.match(summary.gateSummary, /G4:PASS/);
    assert.match(summary.gateSummary, /G5:PASS/);
    assert.match(summary.gateSummary, /order:PASS/);
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});
