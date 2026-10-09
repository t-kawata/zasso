// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
// The reader-facing half (PX-240, contracts C002, C003, C004, C007).
//
// Two rules are under test. A brief is checked by counting its four clauses, so no
// reader is dispatched with an unchecked brief. The integrator proves every field of
// every reading before it writes, so a refusal leaves the artifact byte-identical to
// its state before the call — a partial write is the failure this exists to remove.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { predicateFor } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import {
  BRIEF_CLAUSES,
  BRIEF_NAMES,
  applyReadings,
  buildWorklist,
  countInterrogatives,
  renderBrief,
  renderBriefFrom,
} from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { selectNeighbourFor } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';

const SPEC_PATH = new URL('./fixtures/spec/ledger.md', import.meta.url).pathname;
const GOLDEN_PATH = new URL('./fixtures/spec/ledger-sequences.json', import.meta.url).pathname;
const BRIEFS_ROOT = new URL('../../.claude/scripts/educe-sequences/briefs', import.meta.url).pathname;
/** The fifth brief template, read so a test can remove a clause from it. */
const ADHOC_BRIEF_PATH = new URL('../../.claude/scripts/educe-sequences/briefs/adhoc.md', import.meta.url).pathname;
const WORKLIST = 'ledger-worklist.txt';

const spec = readSpecification(SPEC_PATH);
const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));

/** The predicate as a brief receives it, so a clause test refuses for its own clause. */
const PREDICATE = predicateFor(golden.pins.predicate.limbs, spec.lines);

/** A throwaway artifact path holding the golden artifact, so a write cannot touch the fixture. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function scratchArtifact() {
  const directory = mkdtempSync(join(tmpdir(), 'educe-reading-'));
  const path = join(directory, 'ledger-sequences.json');
  copyFileSync(GOLDEN_PATH, path);
  return path;
}

const digestOf = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('C007 each of the four briefs renders with its four clauses', () => {
  for (const briefName of BRIEF_NAMES) {
    const text = renderBrief({ briefName, worklistPath: WORKLIST, briefsRoot: BRIEFS_ROOT, predicate: PREDICATE });

    assert.equal(countInterrogatives(text), 1, `${briefName} asks exactly one question`);
    assert.equal(text.includes(BRIEF_CLAUSES.VERBATIM_QUOTE), true, briefName);
    assert.equal(text.includes(BRIEF_CLAUSES.NO_LINE_WINDOW), true, briefName);
    assert.equal(text.includes(WORKLIST), true, briefName);
  }
});

test('C007 an unknown brief name does not render', () => {
  assert.throws(() => renderBrief({ briefName: 'fifth-role', worklistPath: WORKLIST, briefsRoot: BRIEFS_ROOT, predicate: PREDICATE }), /unknown brief name/);
});

test('C007 a template that lost the verbatim-quote clause does not render and names the clause', () => {
  const template = readFileSync(join(BRIEFS_ROOT, 'span.md'), 'utf8').replace('- {{VERBATIM_QUOTE}}', '');

  assert.throws(() => renderBriefFrom({ template, briefName: 'span', worklistPath: WORKLIST, predicate: PREDICATE }), /verbatim-quote/);
});

test('C007 a template that lost the no-line-window clause does not render and names the clause', () => {
  const template = readFileSync(join(BRIEFS_ROOT, 'span.md'), 'utf8').replace('- {{NO_LINE_WINDOW}}', '');

  assert.throws(() => renderBriefFrom({ template, briefName: 'span', worklistPath: WORKLIST, predicate: PREDICATE }), /no-line-window/);
});

test('C003 the engine selects the neighbour that cites a line inside the entry span', () => {
  const settlement = golden.sequences.find((entry) => entry.id === 'settlement');
  const selected = selectNeighbourFor(golden, settlement);

  assert.equal(selected, 'settlement-replays-admission');
  assert.equal(selected, settlement.neighbour);
  assert.equal(golden.sequences.find((entry) => entry.id === selected).cites >= settlement.firstLine, true);
  assert.equal(golden.sequences.find((entry) => entry.id === selected).cites <= settlement.lastLine, true);
});

test('C003 a worklist built by the citation rule names the neighbour the engine selected', () => {
  const lines = buildWorklist({ artifact: golden, select: (entry) => entry.outcome === 'viaNeighbour' });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /realize-via settlement-replays-admission/);
});

test('C003 a reading that names a neighbour which only covers the span is refused, naming both', () => {
  const artifactPath = scratchArtifact();
  const before = digestOf(artifactPath);

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [{ subject: 'settlement', outcome: 'viaNeighbour', neighbour: 'non-operation', reader: 'span' }],
  });

  assert.equal(outcome.refused.length, 1);
  assert.equal(outcome.refused[0].field, 'neighbour');
  assert.match(outcome.refused[0].why, /non-operation/);
  assert.match(outcome.refused[0].why, /settlement-replays-admission/);
  assert.equal(digestOf(artifactPath), before, 'a refused reading changes no byte');
});

test('C002 a proven set of readings is applied and the written count equals the readings', () => {
  const artifactPath = scratchArtifact();
  const before = digestOf(artifactPath);
  const artifact = { ...structuredClone(golden), steps: [...golden.steps, { id: 'extra', subject: 's', predicate: 'p', object: 'o', contract: 'c' }] };

  const outcome = applyReadings({
    artifactPath,
    artifact,
    specLines: spec.lines,
    readings: [
      { subject: 'admission', outcome: 'direct', reader: 'span' },
      { subject: 'settlement', outcome: 'viaNeighbour', neighbour: 'settlement-replays-admission', reader: 'span' },
    ],
  });

  assert.deepEqual(outcome, { written: 2 });
  assert.notEqual(digestOf(artifactPath), before);
});

test('C002 a reading missing a required field is refused, and the artifact keeps its digest', () => {
  const artifactPath = scratchArtifact();
  const before = digestOf(artifactPath);

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [{ subject: 'admission', outcome: 'direct', reader: '' }],
  });

  assert.equal(outcome.refused[0].field, 'reader');
  assert.equal(digestOf(artifactPath), before);
});

test('C002 two readings for one subject are refused, because the second is not a repair of the first', () => {
  const artifactPath = scratchArtifact();
  const before = digestOf(artifactPath);

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [
      { subject: 'admission', outcome: 'direct', reader: 'span' },
      { subject: 'admission', outcome: 'notASequence', reader: 'adjudicate' },
    ],
  });

  assert.equal(outcome.refused.length, 1);
  assert.match(outcome.refused[0].why, /second reading for one subject/);
  assert.equal(digestOf(artifactPath), before);
});

test('C002 an outcome outside the declared set is refused', () => {
  const artifactPath = scratchArtifact();

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [{ subject: 'admission', outcome: 'probably', reader: 'span' }],
  });

  assert.equal(outcome.refused[0].field, 'outcome');
  assert.match(outcome.refused[0].why, /not one of/);
});

test('C004 a supplied rule whose presupposition is an integer line naming it is accepted', () => {
  const artifactPath = scratchArtifact();

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [{
      subject: 'LedgerStatus',
      outcome: 'direct',
      reader: 'span',
      spec_name: 'LedgerStatus',
      presupposition: 55,
      grounds: [19],
      rule: 'at least five members',
      why: 'the sentence admits a shorter list',
      override: null,
    }],
  });

  assert.deepEqual(outcome, { written: 1 });
  assert.equal(spec.lines[54].includes('LedgerStatus'), true);
});

test('C004 a supplied rule whose presupposition is prose is refused, naming the name and the grounds', () => {
  const artifactPath = scratchArtifact();
  const before = digestOf(artifactPath);
  const grounds = [19, 55];

  const outcome = applyReadings({
    artifactPath,
    artifact: golden,
    specLines: spec.lines,
    readings: [{
      subject: 'LedgerStatus',
      outcome: 'direct',
      reader: 'span',
      spec_name: 'LedgerStatus',
      presupposition: 'the section that defines the status list',
      grounds,
      rule: 'at least five members',
      why: 'it reads better',
      override: null,
    }],
  });

  assert.equal(outcome.refused[0].field, 'presupposition');
  assert.match(outcome.refused[0].why, /prose/);
  assert.deepEqual(outcome.refused[0].searched, grounds);
  assert.equal(digestOf(artifactPath), before);
});

test('C004 a row that keeps a defining_section the supplied rule supersedes is refused', () => {
  const artifactPath = scratchArtifact();
  const artifact = structuredClone(golden);
  artifact.operations.find((operation) => operation.id === 'LedgerStatus').defining_section = 4;

  const outcome = applyReadings({
    artifactPath,
    artifact,
    specLines: spec.lines,
    readings: [{
      subject: 'LedgerStatus',
      outcome: 'direct',
      reader: 'span',
      spec_name: 'LedgerStatus',
      presupposition: 55,
      grounds: [19],
      rule: 'at least five members',
      why: 'the sentence admits a shorter list',
      override: null,
    }],
  });

  assert.equal(outcome.refused[0].field, 'defining_section');
  assert.match(outcome.refused[0].why, /supersedes/);
});

// ---------------------------------------------------------------------------
// The fifth brief (PX-241, contract C008)
// ---------------------------------------------------------------------------

// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
test('C008 the ad-hoc brief is a declared role, so a check author is dispatched with a checked brief', () => {
  assert.deepEqual([...BRIEF_NAMES], ['span', 'adjudicate', 'adversarial', 'reroute', 'adhoc', 'inquest', 'uncovered']);
});

test('C008 the ad-hoc brief renders with exactly one question and the three other clauses', () => {
  const text = renderBrief({ briefName: 'adhoc', worklistPath: '/tmp/a-worklist.txt', predicate: PREDICATE });

  assert.equal(countInterrogatives(text), 1);
  assert.equal(text.includes(BRIEF_CLAUSES.VERBATIM_QUOTE), true);
  assert.equal(text.includes(BRIEF_CLAUSES.NO_LINE_WINDOW), true);
  assert.equal(text.includes('/tmp/a-worklist.txt'), true);
});

test('C008 the ad-hoc brief names the constructor library rather than listing it, so it cannot go stale', () => {
  const text = renderBrief({ briefName: 'adhoc', worklistPath: '/tmp/a-worklist.txt', predicate: PREDICATE });

  assert.match(text, /rail\/checks\.mjs/);
  for (const constructor of ['pinCheck', 'agreeOn', 'coverEvery', 'placeEach', 'reachEvery', 'citeFrom', 'groundIn']) {
    assert.equal(text.includes(constructor), false, `the brief enumerates ${constructor}, which would go stale when the library grows`);
  }
});

test('C008 removing a clause from the ad-hoc template makes it refuse by clause name', () => {
  const template = readFileSync(ADHOC_BRIEF_PATH, 'utf8').replace('- {{NO_LINE_WINDOW}}', '');

  assert.throws(() => renderBriefFrom({ template, briefName: 'adhoc', worklistPath: '/tmp/w.txt', predicate: PREDICATE }), /no-line-window/);
});
