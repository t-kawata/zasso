// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// The command (PX-240, contracts C010, C011, C013, and the first integration test).
//
// The run happens in a throwaway directory holding one copy of the specification, so
// the committed fixture is read and never written. What is asserted is the whole
// surface: the derived location, the refusal of a run that has read nothing, byte
// identity across two runs over an unchanged specification, and the refusal of a
// verification whose specification digest no longer matches what was recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT, runCommand } from '../../.claude/scripts/educe-sequences/rail/run.mjs';

const FIXTURE_SPEC = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const GOLDEN_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;
const RUN_INPUT = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger.run.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

/** A directory holding one copy of the specification, so a write never reaches the fixture. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function scratchSpec() {
  const directory = mkdtempSync(join(tmpdir(), 'educe-run-'));
  const specPath = join(directory, 'ledger.md');
  copyFileSync(FIXTURE_SPEC, specPath);
  return { directory, specPath, artifactPath: join(directory, 'ledger-sequences.json') };
}

/** A run whose output is captured rather than printed. */
// [::TICKET::] PX-240, PX-241, PX-244, PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241|PX-244|PX-243) --for-spec --no-implementation-order`.
async function quietly(argv, runInput) {
  const out = [];
  const err = [];
  const result = await runCommand(argv, { runInput, stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
  return { ...result, out: out.join('\n'), err: err.join('\n') };
}

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** The path the demand record is written to for a scratch specification directory. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
function recordPath(directory) {
  return join(directory, 'educe-sequences', 'demand.json');
}


// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.

test('C013 a rebuild refuses an adjudication outside the declared vocabulary, and writes nothing', async () => {
  // The phase path proves the adjudicate readings before it composes; the rebuild path reads
  // the same file, so it is held to the same proof rather than to a check that happens to
  // notice afterwards. What the reader gets either way is the field and the words allowed.
  const { specPath, artifactPath } = scratchSpec();
  const foreign = { ...RUN_INPUT, readings: { ...RUN_INPUT.readings, adjudications: [{ subject: 's1', outcome: 'schema_block', reader: 'adjudicate' }] } };

  const result = await quietly([specPath], foreign);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.equal(existsSync(artifactPath), false, 'a refused rebuild leaves nothing behind');
  assert.equal(result.err.includes('s1'), true, result.err);
  assert.equal(result.err.includes('outcome'), true, result.err);
  for (const outcome of ['direct', 'viaNeighbour', 'notASequence', 'singleStep', 'exempt']) {
    assert.equal(result.err.includes(outcome), true, outcome);
  }
});

test('C010 a run with one argument writes the artifact beside the specification', async () => {
  const { specPath, artifactPath } = scratchSpec();

  const result = await quietly([specPath], RUN_INPUT);

  assert.equal(result.exitCode, EXIT.OK);
  assert.equal(result.artifactPath, artifactPath);
  assert.equal(existsSync(artifactPath), true);
  assert.match(result.out, /checksRun=30 of 30/);
  assert.match(result.out, /pinsRederived=5 of 5/);
});

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C011 a pin that no longer re-derives is refused by its pin, and a check names its subject', async () => {
  const { specPath, artifactPath } = scratchSpec();
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  const tampered = JSON.parse(readFileSync(artifactPath, 'utf8'));
  tampered.pins.predicate.line = 1;
  writeFileSync(artifactPath, `${JSON.stringify(tampered, null, 2)}\n`);

  const result = await quietly([specPath]);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.match(result.err, /^refused: predicate: line 1 does not carry every limb/m);
  assert.match(result.err, /^refused: predicate-pin-rederives: predicate \u2014 /m);
});

test('IT1 a run that has read nothing is refused at the first [read] phase and writes nothing', async () => {
  const { specPath, artifactPath } = scratchSpec();

  const result = await quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.match(result.err, /first \[read\] phase carries no signed reading/);
  assert.equal(existsSync(artifactPath), false, 'the shape was performed and nothing was written');
});

test('C010 zero arguments, two arguments, a directory and an extensionless path are refused with nothing written', async () => {
  const { directory, specPath, artifactPath } = scratchSpec();
  const extensionless = join(directory, 'noext');
  writeFileSync(extensionless, 'nothing\n');

  for (const argv of [[], [specPath, specPath], [directory], [extensionless]]) {
    const result = await quietly(argv, RUN_INPUT);

    assert.equal(result.exitCode, EXIT.MISUSED, JSON.stringify(argv));
    assert.equal(result.artifactPath, null);
  }
  assert.equal(existsSync(artifactPath), false);
});

test('C011 a second run over an unchanged specification writes a byte-identical artifact', async () => {
  const { specPath, artifactPath } = scratchSpec();

  await quietly([specPath], RUN_INPUT);
  const first = digestOf(artifactPath);
  await quietly([specPath], RUN_INPUT);

  assert.equal(digestOf(artifactPath), first, 'idempotence is asserted by digest, not by parsed fields');
});

test('C013 a run records the specification digest and line count, recomputed independently', async () => {
  const { specPath, artifactPath } = scratchSpec();

  await quietly([specPath], RUN_INPUT);
  const recorded = JSON.parse(readFileSync(artifactPath, 'utf8')).spec;
  const bytes = readFileSync(specPath);

  assert.equal(recorded.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(recorded.lines, bytes.toString('utf8').split('\n').length - 1);
  assert.equal(recorded.path.includes('/Users/'), false, 'a path that leaves the process names no machine');
});

test('C013 a verification whose specification digest no longer matches is refused, naming both', async () => {
  const { specPath, artifactPath } = scratchSpec();
  await quietly([specPath], RUN_INPUT);
  const recorded = JSON.parse(readFileSync(artifactPath, 'utf8')).spec.sha256;

  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n`);
  const result = await quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.match(result.err, new RegExp(recorded));
  assert.match(result.err, /no signed reading|records spec sha256/);
});

// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
test('C013 a verification of an existing artifact needs only the specification path', async () => {
  const { specPath } = scratchSpec();
  await quietly([specPath], RUN_INPUT);

  const result = await quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.OK);
  assert.match(result.out, /checksRun=30 of 30/);
});

// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
test('PX-260 the artifact states the demand, and names no package that owes it', async () => {
  const { specPath, artifactPath } = scratchSpec();
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

  assert.deepEqual(Object.keys(artifact.demand.counts), ['operations', 'sequences', 'boundaries', 'surfaces']);
  assert.equal(artifact.demand.counts.operations, artifact.operations.length, 'the demand is counted from the artifact it sits in');
  assert.equal(artifact.demand.counts.sequences, artifact.sequences.filter((entry) => entry.outcome !== 'notASequence').length);
  assert.equal(artifact.demand.counts.surfaces, artifact.demand.candidateColumns.length, 'a candidate column is the surface demand, so the two counts cannot disagree');
  assert.equal(typeof artifact.demand.boundaryCount, 'number');
  assert.equal(JSON.stringify(artifact.demand).includes('package'), false, 'the rail emits, never assigns');
});

// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
test('PX-261 a passing run records what the workspace still owes, beside the specification and never in the artifact', async () => {
  const { directory, specPath, artifactPath } = scratchSpec();
  const recordPath = join(directory, 'educe-sequences', 'demand.json');

  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(Object.keys(record.facts.counts), ['operations', 'sequences', 'boundaries', 'surfaces']);
  assert.match(record.measuredAgainst.spec, /^[0-9a-f]{64}$/, 'the record names the specification it was measured against');
  assert.equal(Array.isArray(record.coverage.unassigned), true);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(readFileSync(artifactPath, 'utf8')), 'demand'), true, 'the artifact states the demand facts and nothing about who owes them');
});

test('PX-261 a second run over an unchanged specification writes a byte-identical demand record and leaves the artifact alone', async () => {
  const { directory, specPath, artifactPath } = scratchSpec();
  const recordPath = join(directory, 'educe-sequences', 'demand.json');
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);
  const firstRecord = readFileSync(recordPath, 'utf8');
  const artifactBefore = digestOf(artifactPath);

  assert.equal((await quietly([specPath])).exitCode, EXIT.OK);

  assert.equal(readFileSync(recordPath, 'utf8'), firstRecord);
  assert.equal(digestOf(artifactPath), artifactBefore, 'the verification leaves the document it verified byte-identical');
});

test('PX-261 a refused run writes no demand record', async () => {
  const { directory, specPath, artifactPath } = scratchSpec();
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);
  rmSync(join(directory, 'educe-sequences', 'demand.json'));
  writeFileSync(artifactPath, `${JSON.stringify({ ...JSON.parse(readFileSync(artifactPath, 'utf8')), steps: [] }, null, 2)}\n`);

  const refused = await quietly([specPath]);

  assert.equal(refused.exitCode, EXIT.REFUSED);
  assert.equal(existsSync(join(directory, 'educe-sequences', 'demand.json')), false);
});

// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
test('PX-260 a second run over an unchanged specification states the same demand, byte for byte', async () => {
  const { specPath, artifactPath } = scratchSpec();
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);
  const first = readFileSync(artifactPath);
  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  assert.equal(digestOf(artifactPath), createHash('sha256').update(first).digest('hex'));
});

test('C011 the artifact a run produces equals the committed golden record', async () => {
  const { specPath, artifactPath } = scratchSpec();

  await quietly([specPath], RUN_INPUT);
  const produced = JSON.parse(readFileSync(artifactPath, 'utf8'));

  // Nothing is normalised away: a run in a throwaway directory must produce the same
  // record as the run whose output is committed, which holds only because the recorded
  // path is the file name rather than the location the run happened to be invoked from.
  assert.deepEqual(produced, golden);
});

// ---------------------------------------------------------------------------
// PX-262 — the rail writes the denominator and never refuses over it
// ---------------------------------------------------------------------------

test('C003 a run that borrowed no census writes the denominator and exits 0, because the rail produces a reading and not a verdict', async () => {
  const { directory, specPath } = scratchSpec();
  const recordPath = join(directory, 'educe-sequences', 'demand.json');

  const result = await quietly([specPath], RUN_INPUT);

  assert.equal(result.exitCode, EXIT.OK, 'a missing denominator is not a refusal');
  assert.doesNotMatch(result.err, /^refused: /m, 'the refusal is the gate sentence, and the rail does not use it');
  assert.doesNotMatch(result.err, /ReferenceError|TypeError|at main \(/, 'a crash is not a refusal either');

  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.deepEqual(Object.keys(record.denominator), ['operations', 'sequences', 'boundaries', 'surfaces']);
  assert.equal(record.denominator.operations.borrowed, false);
  assert.equal(record.denominator.operations.source, 'unstated', 'the scratch specification carries no supplied census material');
  assert.equal(record.denominator.operations.members, 0);
});

test('C003 the record states which axes are unstated, so the absence is written rather than inferred from a verdict', async () => {
  const { directory, specPath } = scratchSpec();
  const recordPath = join(directory, 'educe-sequences', 'demand.json');

  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  assert.equal(Array.isArray(record.coverage.denominatorGaps), true);
  assert.ok(record.coverage.denominatorGaps.some((gap) => gap.axis === 'operations'));
  for (const gap of record.coverage.denominatorGaps) {
    assert.ok(gap.why.length > 0 && gap.repair.length > 0, `the ${gap.axis} gap states the reason and the repair`);
  }
});

test('C003 the recorded gaps are exactly the axes the record states as unstated, so the two cannot drift', async () => {
  const { directory, specPath } = scratchSpec();

  assert.equal((await quietly([specPath], RUN_INPUT)).exitCode, EXIT.OK);

  const record = JSON.parse(readFileSync(recordPath(directory), 'utf8'));
  // The surfaces axis is the one whose statement and whose placement are the same act, so an axis
  // asking about no column has nothing to state and is recorded unstated without being a gap.
  const unstated = Object.entries(record.denominator)
    .filter(([, axis]) => axis.source === 'unstated')
    .map(([axis]) => axis)
    .filter((axis) => axis !== 'surfaces' || record.facts.counts.surfaces > 0)
    .sort();

  assert.deepEqual(record.coverage.denominatorGaps.map((gap) => gap.axis).sort(), unstated, 'a gap is reported for an unstated axis and for no other');
  for (const gap of record.coverage.denominatorGaps) assert.equal(record.denominator[gap.axis].borrowed, false);
});
