// The ad-hoc surface (PX-240, phase 16).
//
// One thing about this work is genuinely not mechanical: a defect class that has never
// been seen needs a check that has never been written. What apparatus can do is make
// that act cost something and leave a trace — a scaffold that refuses without the defect
// that motivated it, a record with no empty field, and a promotion that keeps the record
// rather than deleting the evidence that the check was ever ad-hoc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ADHOC_DIRECTORY,
  CHECK_CONTRACT_FIELDS,
  promotionCandidates,
  runScaffoldCases,
  promoteRecord,
  railExitTemplate,
  scaffoldCheck,
} from '../../.claude/scripts/educe-sequences/rail/adhoc.mjs';
import { RAIL_EXIT_FIELDS, writeRailExit } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const WORK = () => mkdtempSync(join(tmpdir(), 'educe-adhoc-'));
// [::TICKET::] PX-240 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-240 --for-spec --no-implementation-order`.

const spec = readSpecification(new URL('./fixtures/spec/ledger.md', import.meta.url).pathname);
const golden = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger-sequences.json', import.meta.url), 'utf8'));

const DEFECT = 'an operation bound to a window because a name appeared near it';

test('scaffolding a check writes a module and the two cases that must falsify it', () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: DEFECT, refuses: 'a verdict reached from a window' });

  assert.equal(written.ok, true);
  assert.equal(existsSync(written.modulePath), true);
  assert.equal(existsSync(written.casesPath), true);
  assert.equal(written.modulePath.startsWith(join(directory, ADHOC_DIRECTORY)), true);

  const module = readFileSync(written.modulePath, 'utf8');
  for (const field of CHECK_CONTRACT_FIELDS) assert.equal(module.includes(field), true, `the scaffold carries no ${field}`);
  assert.equal(module.includes(DEFECT), true, 'the scaffold does not carry the defect that motivated it');
});

test('the case file carries both directions and the condition that would promote it', () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: DEFECT, refuses: 'a verdict reached from a window' });
  const cases = JSON.parse(readFileSync(written.casesPath, 'utf8'));

  assert.equal(cases.mutationCase.name, 'window-binding-mutation');
  assert.equal(cases.counterCase.name, 'window-binding-counter');
  assert.match(cases.promotionCondition, /second specification/);
});

test('a scaffold without an originating defect is refused', () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: '', refuses: 'x' });

  assert.equal(written.ok, false);
  assert.match(written.problems.join('; '), /originating defect/);
  assert.equal(existsSync(join(directory, ADHOC_DIRECTORY)), false, 'a refused scaffold writes nothing');
});

test('a scaffold that does not say what it refuses is refused', () => {
  const written = scaffoldCheck({ directory: WORK(), check: 'x', defect: DEFECT, refuses: '   ' });

  assert.equal(written.ok, false);
  assert.match(written.problems.join('; '), /refuses/);
});

test('the record a scaffold leaves has no empty field', () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: DEFECT, refuses: 'a verdict reached from a window' });

  for (const field of RAIL_EXIT_FIELDS) {
    assert.equal(written.record[field] === undefined || written.record[field] === '', false, `${field} is empty`);
  }
  assert.equal(written.record.promoted, false);
});

test('a record is promoted only when the second specification that needed it is named', () => {
  const records = [{ id: 'window-binding#55', promoted: false, promotionCondition: 'promote when a second specification needs the same rule' }];

  assert.equal(promoteRecord(records, 'window-binding#55', { secondSpecification: '' }).ok, false);
  const promoted = promoteRecord(records, 'window-binding#55', { secondSpecification: 'the settlement ledger' });

  assert.equal(promoted.ok, true);
  assert.equal(promoted.record.promoted, true);
  assert.match(promoted.record.promotionCondition, /settlement ledger/);
  assert.equal(promoted.record.noAnalogueInRecord, undefined, 'a promotion keeps the record, not a copy of it');
});

test('a promotion of a record that does not exist is refused by id', () => {
  const refused = promoteRecord([], 'absent#1', { secondSpecification: 'x' });

  assert.equal(refused.ok, false);
  assert.match(refused.problems[0], /no rail-exit record absent#1/);
});

test('the promotion candidates are the records still marked ad-hoc', () => {
  const records = [{ id: 'a', promoted: false }, { id: 'b', promoted: true }];

  assert.deepEqual(promotionCandidates(records).map((record) => record.id), ['a']);
});

test('a template names the reader and the verifier, so the count can be checked against them', () => {
  const template = railExitTemplate({
    check: 'window-binding',
    defect: DEFECT,
    cases: { mutationCase: { inputs: 'i', outputShape: 'o', readBy: 'rail/falsify.mjs' }, counterCase: { name: 'c' }, promotionCondition: 'p' },
  });

  assert.deepEqual(Object.keys(template).sort(), [...RAIL_EXIT_FIELDS].sort());
  assert.equal(template.readBy, 'rail/falsify.mjs');
  assert.equal(template.verifiedBy, 'c');
});

// ---------------------------------------------------------------------------
// The scaffold is executed, not described (PX-241, contracts C009, C010)
// ---------------------------------------------------------------------------

/** A scaffold whose two bodies have been written, the way an author would write them. */
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.
function scaffoldAndFill({ check = 'window-binding', body, mutation }) {
  const directory = WORK();
  const written = scaffoldCheck({ directory, check, defect: DEFECT, refuses: 'a verdict reached from a window' });
  const filled = readFileSync(written.modulePath, 'utf8')
    .replace(/\/\/ \[::STUB::\][^\n]*\n/g, '')
    .replace(/  run\(context\) \{[\s\S]*?\n  \},/, `  run(context) {\n${body}\n  },`)
    .replace(/export const mutation = \(artifact\) => \{[\s\S]*?\n\};/, `export const mutation = (artifact) => {\n${mutation}\n};`);
  writeFileSync(written.modulePath, filled);
  return { directory, written };
}

test('C009 the scaffold writes a module that imports the library and exports a check and a mutation', () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: DEFECT, refuses: 'a verdict reached from a window' });
  const source = readFileSync(written.modulePath, 'utf8');

  assert.match(source, /^import \{[^}]*\} from '.*rail\/checks\.mjs';$/m, 'the module cannot reach the constructor library');
  assert.match(source, /export const check = \{/);
  assert.match(source, /export const mutation = /);
  assert.match(source, /\[::STUB::\] PX-241/, 'the unfilled bodies carry no stub marker');
});

test('C009 the emitted import specifier resolves from the run ad-hoc directory', async () => {
  const directory = WORK();

  const written = scaffoldCheck({ directory, check: 'window-binding', defect: DEFECT, refuses: 'a verdict reached from a window' });
  const loaded = await import(written.modulePath);

  assert.equal(loaded.check.id, 'window-binding');
  assert.equal(typeof loaded.mutation, 'function');
});

test('C010 a scaffolded check whose mutation reddens and whose counter stays green is recorded with what was observed', async () => {
  const { directory } = scaffoldAndFill({
    body: "    return context.artifact.sequences.filter((entry) => entry.flagged === true).map((entry) => ({ check: 'window-binding', subject: entry.id, reason: 'flagged' }));",
    mutation: "    const next = structuredClone(artifact);\n    next.sequences[0].flagged = true;\n    return next;",
  });

  const outcome = await runScaffoldCases({ directory, check: 'window-binding', artifact: golden, specLines: spec.lines });

  assert.equal(outcome.ok, true);
  assert.deepEqual(Object.keys(outcome.executed).sort(), ['attributable', 'counterGreen', 'reddened']);
  assert.equal(outcome.executed.reddened, true);
  assert.equal(outcome.executed.attributable, true);
  assert.equal(outcome.executed.counterGreen, true);
});

test('C010 a check whose mutation does not redden is refused rather than recorded', async () => {
  const { directory } = scaffoldAndFill({
    body: '    return [];',
    mutation: '    return structuredClone(artifact);',
  });

  const outcome = await runScaffoldCases({ directory, check: 'window-binding', artifact: golden, specLines: spec.lines });

  assert.equal(outcome.ok, false);
  assert.match(outcome.problems.join(' '), /does not redden/);
});

test('C010 a check whose counter-mutation reddens is refused, because the rule is defective', async () => {
  const { directory } = scaffoldAndFill({
    body: "    return context.artifact.sequences.map((entry) => ({ check: 'window-binding', subject: entry.id, reason: 'always' }));",
    mutation: "    const next = structuredClone(artifact);\n    next.sequences[0].flagged = true;\n    return next;",
  });

  const outcome = await runScaffoldCases({ directory, check: 'window-binding', artifact: golden, specLines: spec.lines });

  assert.equal(outcome.ok, false);
  assert.match(outcome.problems.join(' '), /counter-mutation reddened/);
});

test('C010 a rail-exit record without an executed outcome is refused', () => {
  assert.equal(RAIL_EXIT_FIELDS.includes('executed'), true, 'the record does not carry what was observed');

  const record = { ...railExitTemplate({ check: 'x', defect: DEFECT, cases: { mutationCase: { inputs: 'i', outputShape: 'o', readBy: 'r' }, counterCase: { name: 'c' }, promotionCondition: 'p' } }) };
  delete record.executed;

  assert.throws(() => writeRailExit(record, join(WORK(), 'rail-exits.jsonl')), /executed/);
});
