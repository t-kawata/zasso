// A new generation reads again, or it does not happen (PX-254).
//
// The command file promises that a new generation asks the reader again, and the promise
// was empty: a `[read]` gate can see only that the file it is told to read exists and is
// signed, and the file was inherited from the generation before. So a fifth invocation over
// an unchanged specification opened a generation, re-opened every `[read]` phase in the
// status, passed every one of them on the readings it already had, wrote an artifact whose
// nine measured terms were identical to the fourth, and reported a pass. Nothing in the
// output said that no reading had been made.
//
// The rule is not a check on the reader, because a gate that judges a reader rather than a
// record is the class of check this apparatus refuses everywhere and is satisfied by
// touching a file. The rule is that a new generation moves the declaration and the readings
// of every `[read]` phase into `archive/`, so the existence predicate a `[read]` gate
// already has comes to mean written this generation. Nothing is deleted: the previous
// generation's answers stay readable at one path, which is what a re-read is made against.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetDigestOf } from '../../.claude/scripts/educe-sequences/rail/inherit.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { beginRun } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import {
  ARCHIVE_DIRECTORY,
  DECLARATION_FILE,
  archiveReadings,
  archivedFileName,
  readingsFileName,
  writeReadingsFile,
} from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SPEC_SOURCE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.md');
const RUN_INPUT_PATH = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec/ledger.run.json');
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/educe-sequences.md');
const PHASE = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');

const RUN_INPUT = JSON.parse(readFileSync(RUN_INPUT_PATH, 'utf8'));
const COMMAND = readFileSync(COMMAND_PATH, 'utf8');

/** The span reading the fixture's declaration is read with, in the shape a run records it. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function spanReading() {
  const [first, ...rest] = RUN_INPUT.readings.sequences;
  return [{ ...first, steps: RUN_INPUT.readings.steps, operations: RUN_INPUT.readings.operations }, ...rest];
}

/** A run directory's own path, with nothing written into it yet. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function scratchRun() {
  const root = mkdtempSync(join(tmpdir(), 'px254-regen-'));
  const specPath = join(root, 'ledger.md');
  copyFileSync(SPEC_SOURCE, specPath);
  return { root, specPath, spec: readSpecification(specPath), directory: join(root, 'educe-sequences') };
}

/** The declaration and the readings the fixture states, written into a run directory. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function writeFixtureReadings(directory) {
  writeFileSync(join(directory, DECLARATION_FILE), `${JSON.stringify(RUN_INPUT.declaration, null, 2)}\n`);
  writeReadingsFile(join(directory, readingsFileName('span')), spanReading());
  writeReadingsFile(join(directory, readingsFileName('adjudicate')), RUN_INPUT.readings.adjudications);
  writeReadingsFile(join(directory, readingsFileName('inquest')), RUN_INPUT.readings.inquest);
}

/** The files a new generation must move aside, in the order the phase table names them. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function readingsOfThisRun() {
  return [DECLARATION_FILE, readingsFileName('span'), readingsFileName('adjudicate'), readingsFileName('inquest')];
}

/** A run whose first generation has read: the directory is opened, then the files are written. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function seededRun() {
  const run = scratchRun();
  beginRun({ specPath: run.specPath, spec: run.spec });
  writeFixtureReadings(run.directory);
  return { ...run, span: readFileSync(join(run.directory, readingsFileName('span')), 'utf8') };
}

/** Open the next generation over a run directory. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function openNextGeneration(run) {
  return beginRun({ specPath: run.specPath, spec: run.spec });
}

/** The archived names a run directory holds, sorted. */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
function archivedNames(directory) {
  const archive = join(directory, ARCHIVE_DIRECTORY);
  return existsSync(archive) ? readdirSync(archive).sort() : [];
}

// ---------------------------------------------------------------------------
// C001 — a reading is moved aside, never deleted, and the gate refuses
// ---------------------------------------------------------------------------

test('C001 an archived name is the working name with the generation before its extension', () => {
  assert.equal(archivedFileName('readings-span.jsonl', 4), 'readings-span.g4.jsonl');
  assert.equal(
    archivedFileName(readingsFileName('span'), 4),
    readingsFileName('span').replace(/\.jsonl$/, '.g4.jsonl'),
    'the archived name is built from the reading name rather than restating it',
  );
  assert.equal(archivedFileName(DECLARATION_FILE, 4), 'declaration.g4.json');
});

test('C001 the move takes the reading out of the run directory and leaves it readable', () => {
  const run = seededRun();
  const moved = archiveReadings({ directory: run.directory, generation: 4, files: readingsOfThisRun() });

  assert.equal(existsSync(join(run.directory, readingsFileName('span'))), false, 'the reading left the run directory');
  assert.equal(
    readFileSync(join(run.directory, ARCHIVE_DIRECTORY, 'readings-span.g4.jsonl'), 'utf8'),
    run.span,
    'the previous generation answers are still readable, byte for byte',
  );
  assert.deepEqual([...moved].sort(), [
    'declaration.g4.json',
    'readings-adjudicate.g4.jsonl',
    'readings-inquest.g4.jsonl',
    'readings-span.g4.jsonl',
  ]);
});

test('C001 a run directory holding none of them is not refused', () => {
  const run = scratchRun();
  const moved = archiveReadings({ directory: run.directory, generation: 1, files: readingsOfThisRun() });

  assert.deepEqual(moved, [], 'nothing to move is not a refusal');
  assert.equal(existsSync(join(run.directory, ARCHIVE_DIRECTORY)), false, 'an empty archive is not created');
});

test('C001 a new generation moves the declaration with the readings', () => {
  const run = seededRun();
  openNextGeneration(run);

  assert.equal(existsSync(join(run.directory, DECLARATION_FILE)), false, 'the declaration is a reading and moves too');
  assert.equal(existsSync(join(run.directory, ARCHIVE_DIRECTORY, 'declaration.g1.json')), true);
});

test('C001 a phase that is not asked again keeps what it wrote', () => {
  // The archive is derived from the phases that are re-opened, which are the `[read]` ones.
  // The ad-hoc phase is not among them, so its reading is not moved: a file the run would
  // not ask for again must not be taken away.
  const run = seededRun();
  writeReadingsFile(join(run.directory, readingsFileName('adhoc')), [{ subject: 'a scaffold', reader: 'adhoc' }]);

  openNextGeneration(run);

  assert.equal(existsSync(join(run.directory, readingsFileName('adhoc'))), true);
});

test('C001 a re-opened read phase is refused until the reading is written again', () => {
  const run = seededRun();
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '8'], { encoding: 'utf8' }).status, 0);
  openNextGeneration(run);

  const refused = spawnSync('node', [PHASE, 'run', run.specPath, '8'], { encoding: 'utf8' });

  assert.notEqual(refused.status, 0, 'the generation asks the reader again');
  assert.match(refused.stdout, /readings-span\.jsonl/, 'and names the file to write');
});

// ---------------------------------------------------------------------------
// C002 — the digest that is compared and the digest that is recorded
// ---------------------------------------------------------------------------

test('C002 the digest changes when the readings move', () => {
  const run = seededRun();
  const found = assetDigestOf(run.directory);
  archiveReadings({ directory: run.directory, generation: 4, files: readingsOfThisRun() });

  assert.notEqual(assetDigestOf(run.directory), found);
});

test('C002 the recorded digest is the one measured after the move', () => {
  const run = seededRun();
  const begun = openNextGeneration(run);

  assert.equal(begun.mode, 'new-generation');
  assert.equal(begun.assets.digest, assetDigestOf(run.directory), 'the record describes the set the generation holds');
  assert.equal(existsSync(join(run.directory, ARCHIVE_DIRECTORY, 'readings-span.g1.jsonl')), true);
});

test('C002 the superseded generation records what its audit asked and answered', () => {
  // The history row is the record of what the generation that is being superseded
  // produced, and its audit counts are read from the declaration and the inquest file.
  // Both are moved by the archive, so a record taken after the move answers zero for
  // every count - a silent loss of exactly the facts the row exists to carry.
  const run = seededRun();
  const begun = openNextGeneration(run);

  assert.equal(begun.mode, 'new-generation');
  const superseded = begun.status.history.at(-1);
  assert.equal(superseded.inquest.asked > 0, true, 'the superseded generation asked its audit questions');
  assert.equal(superseded.inquest.answered > 0, true, 'and the answers it gave are recorded, not zeroed by the move');
});

test('C002 the archive is part of what a run inherits', () => {
  const run = seededRun();
  openNextGeneration(run);
  const withArchive = assetDigestOf(run.directory);
  writeFileSync(join(run.directory, ARCHIVE_DIRECTORY, 'readings-span.g0.jsonl'), 'a claim\n');

  assert.notEqual(assetDigestOf(run.directory), withArchive);
});

// ---------------------------------------------------------------------------
// C003 — a generation opened and left alone still moves nothing
// ---------------------------------------------------------------------------

test('C003 a second begin over a set nothing was entered in is a verification', () => {
  const run = seededRun();
  const first = openNextGeneration(run);
  const before = archivedNames(run.directory);
  const second = openNextGeneration(run);

  assert.equal(first.mode, 'new-generation');
  assert.equal(second.mode, 'verification');
  assert.deepEqual(archivedNames(run.directory), before, 'a verification moves nothing');
});

test('C003 a generation a reader has worked in opens the next and moves the readings', () => {
  const run = seededRun();
  openNextGeneration(run);
  // The reader answers the generation it was given: the files exist again, written now.
  writeFixtureReadings(run.directory);
  assert.equal(spawnSync('node', [PHASE, 'run', run.specPath, '1'], { encoding: 'utf8' }).status, 0);

  const next = openNextGeneration(run);

  assert.equal(next.mode, 'new-generation');
  assert.deepEqual(archivedNames(run.directory), [
    'declaration.g1.json',
    'declaration.g2.json',
    'readings-adjudicate.g1.jsonl',
    'readings-adjudicate.g2.jsonl',
    'readings-inquest.g1.jsonl',
    'readings-inquest.g2.jsonl',
    'readings-span.g1.jsonl',
    'readings-span.g2.jsonl',
  ]);
});

test('C003 a verification leaves the readings where they are', () => {
  const run = seededRun();
  const begun = openNextGeneration(run);
  assert.equal(begun.mode, 'new-generation');
  const again = openNextGeneration(run);

  assert.equal(again.mode, 'verification');
  assert.equal(archivedNames(run.directory).some((name) => name.endsWith('.g2.jsonl')), false);
});

// ---------------------------------------------------------------------------
// C004 — the command file names the archive and states the move
// ---------------------------------------------------------------------------

test('C004 the command file states the move and names the archive path', () => {
  assert.equal(
    COMMAND.includes('<dir of spec-file>/educe-sequences/archive/'),
    true,
    'the archive is named under the run directory',
  );
  assert.match(COMMAND, /moves? the (readings|declaration)/, 'the file states that a new generation moves them');
});

// ---------------------------------------------------------------------------
// C005 — a claim comes from the file the reader wrote
// ---------------------------------------------------------------------------

test('C005 a re-opened read phase is not settled until the reader writes the file', () => {
  const run = seededRun();
  assert.equal(spawnSync('node', [PHASE, 'through', run.specPath, '8'], { encoding: 'utf8' }).status, 0);
  openNextGeneration(run);
  assert.notEqual(spawnSync('node', [PHASE, 'run', run.specPath, '8'], { encoding: 'utf8' }).status, 0);

  writeReadingsFile(join(run.directory, readingsFileName('span')), spanReading());
  const passed = spawnSync('node', [PHASE, 'run', run.specPath, '8'], { encoding: 'utf8' });

  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  const status = JSON.parse(readFileSync(join(run.directory, 'status.json'), 'utf8'));
  assert.equal(status.readings.span.claims > 0, true, 'the claim is counted from the file the reader wrote');
});
