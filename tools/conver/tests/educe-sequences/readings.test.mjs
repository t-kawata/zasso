// The files a reading phase exchanges (PX-240, the phase driver).
//
// A reading phase is where a machine cannot go, so what comes back has to be a shape the
// machine can check. These tests hold that shape: a declaration with an empty limb list
// is refused rather than surfacing later as a specification that "has no predicate", and
// a readings line missing a field is refused with the line it was found on, so a reader
// learns which claim to redo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DECLARATION_FILE,
  missingReadingFields,
  readDeclarationFile,
  readReadingsFile,
  readingsFileName,
  signedCount,
  validateDeclaration,
  writeReadingsFile,
} from '../../.claude/scripts/educe-sequences/rail/readings.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const WORK = mkdtempSync(join(tmpdir(), 'educe-readings-'));

const VALID_DECLARATION = {
  predicate: { limbs: ['balance change'] },
  rowSchema: { fields: ['subject', 'predicate'] },
  weakestLink: { subject: 'a weak judgement', why: 'a reason', tightenedBy: 'a-declared-check' },
  enumerations: [{ name: 'OperationStatus', members: ['Pending'], closedness: 'closed' }],
  forms: [{ name: 'numbered-section', proposes: true }],
  entries: [{ id: 'admission', kind: 'entry', firstLine: 1, lastLine: 2 }],
  sections: [{ id: 's1', firstLine: 1, lastLine: 2 }],
  exemptions: [],
};

test('the readings file name is derived from the brief, so two briefs cannot collide', () => {
  assert.equal(readingsFileName('span'), 'readings-span.jsonl');
  assert.equal(readingsFileName('adversarial'), 'readings-adversarial.jsonl');
  assert.equal(DECLARATION_FILE, 'declaration.json');
});

test('a well-formed declaration is accepted', () => {
  assert.deepEqual(validateDeclaration(VALID_DECLARATION), []);
});

test('a declaration with no limbs is refused here rather than read as a specification with no predicate', () => {
  const problems = validateDeclaration({ ...VALID_DECLARATION, predicate: { limbs: [] } });

  assert.equal(problems.includes('predicate.limbs is empty'), true);
});

test('a declaration whose every enumeration is empty is refused', () => {
  const problems = validateDeclaration({
    ...VALID_DECLARATION,
    enumerations: [{ name: 'OperationStatus', members: [], closedness: 'closed' }],
  });

  assert.equal(problems.some((problem) => problem.includes('reading of nothing')), true);
});

test('a declaration missing a section names the section', () => {
  const { forms, ...withoutForms } = VALID_DECLARATION;
  const problems = validateDeclaration(withoutForms);

  assert.equal(problems.includes('the declaration has no forms'), true);
});

test('a declaration entry missing a key names the entry and the key', () => {
  const problems = validateDeclaration({ ...VALID_DECLARATION, entries: [{ id: 'admission', kind: 'entry', firstLine: 1 }] });

  assert.equal(problems.includes('entries[0] has no lastLine'), true);
});

test('a declaration file that is not JSON is refused rather than thrown', () => {
  const path = join(WORK, 'broken.json');
  writeFileSync(path, '{not json');

  const result = readDeclarationFile(path);

  assert.equal(result.ok, false);
  assert.match(result.problems[0], /not readable JSON/);
});

test('a missing declaration file is refused by name', () => {
  const result = readDeclarationFile(join(WORK, 'absent.json'));

  assert.equal(result.ok, false);
  assert.match(result.problems[0], /does not exist/);
});

test('a readings file round-trips through the one-line-per-reading form', () => {
  const path = join(WORK, 'readings-span.jsonl');
  writeReadingsFile(path, [
    { subject: 'admission', outcome: 'direct', reader: 'span' },
    { subject: 'settlement', outcome: 'viaNeighbour', neighbour: 'n1', reader: 'span' },
  ]);

  const result = readReadingsFile(path);

  assert.equal(result.ok, true);
  assert.equal(result.readings.length, 2);
  assert.equal(signedCount(result.readings), 2);
});

test('a reading missing a field is refused with the line it was found on', () => {
  const path = join(WORK, 'readings-broken.jsonl');
  writeFileSync(path, `${JSON.stringify({ subject: 'admission', outcome: 'direct', reader: 'span' })}\n${JSON.stringify({ subject: 'settlement', outcome: 'direct' })}\n`);

  const result = readReadingsFile(path);

  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /^line 2 carries no reader$/);
});

test('a neighbour verdict without a neighbour is refused', () => {
  const path = join(WORK, 'readings-neighbour.jsonl');
  writeFileSync(path, `${JSON.stringify({ subject: 'settlement', outcome: 'viaNeighbour', reader: 'span' })}\n`);

  const result = readReadingsFile(path);

  assert.equal(result.ok, false);
  assert.match(result.problems[0], /neighbour/);
});

test('the required fields of a reading depend on its outcome', () => {
  assert.deepEqual(missingReadingFields({ subject: 'a', outcome: 'direct', reader: 'span' }), []);
  assert.deepEqual(missingReadingFields({ subject: 'a', outcome: 'viaNeighbour', reader: 'span' }), ['neighbour']);
});

test('an unsigned reading counts as unsigned, which is what reddens a run', () => {
  assert.equal(signedCount([{ reader: 'span' }, { reader: '  ' }, {}]), 1);
});

// ---------------------------------------------------------------------------
// The weakest link (PX-241, contract C006)
// ---------------------------------------------------------------------------

const A_WEAKEST_LINK = { subject: 'adjacency by citation', why: 'coverage is not a reading', tightenedBy: 'neighbour-cites-inside-span' };

test('C006 a declaration naming its weakest link and the check that tightens it validates', () => {
  assert.deepEqual(validateDeclaration({ ...VALID_DECLARATION, weakestLink: A_WEAKEST_LINK }), []);
});

test('C006 a declaration with no weakest link is refused by name', () => {
  assert.deepEqual(validateDeclaration({ ...VALID_DECLARATION, weakestLink: undefined }), ['the declaration has no weakestLink']);
});

test('C006 an empty subject, why or tightenedBy is refused naming the field', () => {
  for (const field of ['subject', 'why', 'tightenedBy']) {
    const problems = validateDeclaration({ ...VALID_DECLARATION, weakestLink: { ...A_WEAKEST_LINK, [field]: '' } });

    assert.equal(problems.some((problem) => problem.includes(`weakestLink.${field}`)), true, `an empty ${field} was accepted`);
  }
});

test('C006 a weakest link given as a list rather than an object is refused', () => {
  assert.equal(validateDeclaration({ ...VALID_DECLARATION, weakestLink: [] }).some((problem) => problem.includes('weakestLink')), true);
});
