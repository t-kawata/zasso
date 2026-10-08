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
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function quietly(argv, runInput) {
  const out = [];
  const err = [];
  const result = runCommand(argv, { runInput, stdout: (line) => out.push(line), stderr: (line) => err.push(line) });
  return { ...result, out: out.join('\n'), err: err.join('\n') };
}

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('C010 a run with one argument writes the artifact beside the specification', () => {
  const { specPath, artifactPath } = scratchSpec();

  const result = quietly([specPath], RUN_INPUT);

  assert.equal(result.exitCode, EXIT.OK);
  assert.equal(result.artifactPath, artifactPath);
  assert.equal(existsSync(artifactPath), true);
  assert.match(result.out, /checksRun=13 of 13/);
  assert.match(result.out, /pinsRederived=5 of 5/);
});

test('IT1 a run that has read nothing is refused at the first [read] phase and writes nothing', () => {
  const { specPath, artifactPath } = scratchSpec();

  const result = quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.match(result.err, /first \[read\] phase carries no signed reading/);
  assert.equal(existsSync(artifactPath), false, 'the shape was performed and nothing was written');
});

test('C010 zero arguments, two arguments, a directory and an extensionless path are refused with nothing written', () => {
  const { directory, specPath, artifactPath } = scratchSpec();
  const extensionless = join(directory, 'noext');
  writeFileSync(extensionless, 'nothing\n');

  for (const argv of [[], [specPath, specPath], [directory], [extensionless]]) {
    const result = quietly(argv, RUN_INPUT);

    assert.equal(result.exitCode, EXIT.MISUSED, JSON.stringify(argv));
    assert.equal(result.artifactPath, null);
  }
  assert.equal(existsSync(artifactPath), false);
});

test('C011 a second run over an unchanged specification writes a byte-identical artifact', () => {
  const { specPath, artifactPath } = scratchSpec();

  quietly([specPath], RUN_INPUT);
  const first = digestOf(artifactPath);
  quietly([specPath], RUN_INPUT);

  assert.equal(digestOf(artifactPath), first, 'idempotence is asserted by digest, not by parsed fields');
});

test('C013 a run records the specification digest and line count, recomputed independently', () => {
  const { specPath, artifactPath } = scratchSpec();

  quietly([specPath], RUN_INPUT);
  const recorded = JSON.parse(readFileSync(artifactPath, 'utf8')).spec;
  const bytes = readFileSync(specPath);

  assert.equal(recorded.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(recorded.lines, bytes.toString('utf8').split('\n').length - 1);
  assert.equal(recorded.path.includes('/Users/'), false, 'a path that leaves the process names no machine');
});

test('C013 a verification whose specification digest no longer matches is refused, naming both', () => {
  const { specPath, artifactPath } = scratchSpec();
  quietly([specPath], RUN_INPUT);
  const recorded = JSON.parse(readFileSync(artifactPath, 'utf8')).spec.sha256;

  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n`);
  const result = quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.REFUSED);
  assert.match(result.err, new RegExp(recorded));
  assert.match(result.err, /no signed reading|records spec sha256/);
});

test('C013 a verification of an existing artifact needs only the specification path', () => {
  const { specPath } = scratchSpec();
  quietly([specPath], RUN_INPUT);

  const result = quietly([specPath], null);

  assert.equal(result.exitCode, EXIT.OK);
  assert.match(result.out, /checksRun=13 of 13/);
});

test('C011 the artifact a run produces equals the committed golden record', () => {
  const { specPath, artifactPath } = scratchSpec();

  quietly([specPath], RUN_INPUT);
  const produced = JSON.parse(readFileSync(artifactPath, 'utf8'));

  // Nothing is normalised away: a run in a throwaway directory must produce the same
  // record as the run whose output is committed, which holds only because the recorded
  // path is the file name rather than the location the run happened to be invoked from.
  assert.deepEqual(produced, golden);
});
