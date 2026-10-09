// A name cannot break the drawing, and a rendering is written only from a verification
// that passed (PX-249, C001-C006).
//
// The emitter wrote participant names into the identifier position, where the Mermaid
// sequence lexer refuses a comma and a colon, and it escaped nothing: `;` failed the
// parse and `#` was silently lost together with everything after it. Measured over the
// real artifact, 17 of 68 diagrams did not parse and 15 of those carried a comma in a
// participant line. What is held here is that the emitted text is well formed by
// construction for any name the artifact can hold, that every step appears in exactly
// one diagram, and that a rendering is written only from a verification that passed.
//
// The escape set is a measurement against mermaid 12.0, not an assumption: it is the
// table in `docs/EDUCE-SEQUENCES-DESIGN.md`, and the encoding table below is what pins
// it. A change in the rule is a single edit to `MERMAID_ESCAPES`.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKS, DIAGRAM_FIELDS, DIAGRAMMED_OUTCOMES, ENGINE_DECLARED_CHECK_COUNT, checkAll, describeRefusal } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { checkRenderFreshness, encodeForDiagram, renderArtifact, renderSequenceDiagram } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { RENDER_EXIT, renderCommand } from '../../.claude/scripts/educe-sequences/rail/render.mjs';
import { runCommand } from '../../.claude/scripts/educe-sequences/rail/run.mjs';
import { suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURES = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures');
const RAIL = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail');

/** The artifact carrying a borrowed census, which is the one the checks read. */
const CENSUS = join(FIXTURES, 'census');
const CENSUS_SPEC = readSpecification(join(CENSUS, 'ledger.md'));
const SUPPLIED = suppliedDocumentsOf(join(CENSUS, 'educe-sequences'));

/** The artifact with no supplied material beside it, which the product paths can verify alone. */
const PLAIN = join(FIXTURES, 'spec');

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(join(CENSUS, 'ledger-sequences.json'), 'utf8'));
}

/** The golden artifact of the fixture the product paths are driven over. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function plainGolden() {
  return JSON.parse(readFileSync(join(PLAIN, 'ledger-sequences.json'), 'utf8'));
}

/**
 * A scratch copy of a fixture directory, so a product path writes outside the repository.
 *
 * The committed rendering is deliberately not carried over: a test that asserts nothing was
 * written has to start from a state where nothing is there, and copying the committed bytes
 * in would make every such assertion pass for the wrong reason.
 */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function scratch(fixture) {
  const root = mkdtempSync(join(tmpdir(), `px249-${fixture}-`));
  cpSync(join(FIXTURES, fixture), root, { recursive: true });
  rmSync(join(root, 'ledger-sequences.md'), { force: true });
  return { root, specPath: join(root, 'ledger.md'), artifactPath: join(root, 'ledger-sequences.json'), renderPath: join(root, 'ledger-sequences.md') };
}

/** An artifact whose first step names no target, which is what the drawability check refuses. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function undrawable(artifact) {
  return { ...artifact, steps: artifact.steps.map((step, index) => (index === 0 ? { ...step, object: '' } : step)) };
}

// ---------------------------------------------------------------------------
// C001 — the encoding is total and measured
// ---------------------------------------------------------------------------

test('C001 the encoder collapses whitespace and escapes the two characters the lexer cannot carry', () => {
  assert.equal(encodeForDiagram('operator'), 'operator');
  assert.equal(encodeForDiagram('a#b'), 'a#35;b');
  assert.equal(encodeForDiagram('a;b'), 'a#59;b');
  assert.equal(encodeForDiagram('line one\nline two'), 'line one line two');
  assert.equal(encodeForDiagram('tab\there'), 'tab here');
  assert.equal(encodeForDiagram(''), '');
  assert.equal(encodeForDiagram('   '), ' ');
});

test('C001 the escape runs in one pass, so a hash introduced by escaping a semicolon is not escaped again', () => {
  assert.equal(encodeForDiagram('a#b;c'), 'a#35;b#59;c');
  assert.equal(encodeForDiagram(';'), '#59;');
  assert.equal(encodeForDiagram('#'), '#35;');
});

test('C001 every character outside the measured set is carried literally', () => {
  const carriedLiterally = [',', ':', '+', '>', '<', '@', '-', '/', '`', "'", '"', '&', '「', '」', '・', '。', '％'];

  for (const character of carriedLiterally) {
    assert.equal(encodeForDiagram(`a${character}b`), `a${character}b`, `${character} is carried literally`);
  }
});

test('C001 the encoding is idempotent on text carrying neither escaped character, so it is applied exactly once', () => {
  for (const text of ['operator', 'a, b: c', 'row Settled', '申請者', '']) {
    assert.equal(encodeForDiagram(encodeForDiagram(text)), encodeForDiagram(text));
  }
});

// ---------------------------------------------------------------------------
// C002 — no name reaches the identifier position
// ---------------------------------------------------------------------------

/** The names measured to break the identifier position, in one table. */
const HOSTILE_NAMES = Object.freeze([
  'gaia-core',
  'Payment-Service, その2',
  'claim signature: a; b#c',
  'line one\nline two',
  '「引用」と`code`',
]);

/** One step per hostile name, each naming the next as its object. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function hostileSteps() {
  return HOSTILE_NAMES.map((name, index) => ({
    id: `s${index}`,
    sequence: 'seq',
    subject: name,
    object: HOSTILE_NAMES[(index + 1) % HOSTILE_NAMES.length],
    predicate: `acts ${index}`,
    operation: `Op${index}`,
  }));
}

/** The lines of a block that declare a participant, with the identifier each declares. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function declaredIdentifiers(block) {
  return block
    .split('\n')
    .filter((line) => line.startsWith('  participant '))
    .map((line) => line.slice('  participant '.length).split(' as ')[0]);
}

/** The message lines of a block, as the sender and receiver identifiers. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function messagePairs(block) {
  return block
    .split('\n')
    .filter((line) => line.includes('->>'))
    .map((line) => line.trim().split(':')[0]);
}

test('C002 a hostile name is declared as an alias and reaches no identifier position', () => {
  const steps = hostileSteps();
  const block = renderSequenceDiagram({ id: 'seq', firstLine: 1, lastLine: 9 }, steps);
  const declared = declaredIdentifiers(block);

  assert.equal(block.split('\n')[0], '```mermaid');
  assert.equal(block.split('\n')[1], 'sequenceDiagram');
  assert.equal(block.split('\n').at(-1), '```');

  for (const pair of messagePairs(block)) {
    const [sender, receiver] = pair.split('->>');
    assert.match(sender, /^P\d+$/, 'the sender is an identifier');
    assert.match(receiver, /^P\d+$/, 'the receiver is an identifier');
    assert.equal(declared.includes(sender), true, 'the sender is declared');
    assert.equal(declared.includes(receiver), true, 'the receiver is declared');
  }
  for (const name of HOSTILE_NAMES) {
    assert.equal(declared.includes(name), false, `the raw name ${JSON.stringify(name)} is not an identifier`);
    assert.equal(block.includes(`participant ${name}`), false, 'no line declares the raw name as an identifier');
  }
});

test('C002 identifiers are assigned by first appearance and a repeated name is declared once', () => {
  const steps = [
    { id: 'a', sequence: 's', subject: 'operator', object: 'row', predicate: 'reads', operation: 'Op' },
    { id: 'b', sequence: 's', subject: 'operator', object: 'ledger', predicate: 'writes', operation: 'Op' },
  ];
  const block = renderSequenceDiagram({ id: 's', firstLine: 1, lastLine: 2 }, steps);

  assert.equal((block.match(/participant P1 as operator/g) ?? []).length, 1, 'a repeated name is declared once');
  assert.equal(block.includes('  participant P2 as row\n'), true);
  assert.equal(block.includes('  participant P3 as ledger\n'), true);
  assert.deepEqual(messagePairs(block), ['P1->>P2', 'P1->>P3'], 'the messages follow the step order');
});

test('C002 each field a message is drawn from is required on its own', () => {
  // One field at a time, so a shortened DIAGRAM_FIELDS fails: a check that asks for any of
  // the three rather than all of them would accept a message with no actor on one side.
  for (const field of ['subject', 'object', 'operation']) {
    const hurt = { ...golden(), steps: golden().steps.map((step, index) => (index === 0 ? { ...step, [field]: '' } : step)) };
    const verdicts = checkAll({ specLines: CENSUS_SPEC.lines, artifact: hurt, recorded: { supplied: SUPPLIED } })
      .verdicts.filter((verdict) => verdict.check === 'every-sequence-is-drawable');

    assert.equal(verdicts.length > 0, true, `a step with no ${field} is refused`);
  }
  assert.deepEqual(DIAGRAM_FIELDS, ['subject', 'object', 'operation']);
});

test('C002 the declared set is exactly the names the steps carry, with no name counted twice', () => {
  const steps = hostileSteps();
  const block = renderSequenceDiagram({ id: 'seq', firstLine: 1, lastLine: 9 }, steps);
  const carried = new Set(steps.flatMap((step) => [step.subject, step.object]));

  assert.deepEqual(declaredIdentifiers(block), [...carried].map((_, index) => `P${index + 1}`));
});

test('C002 the message count equals the step count and a sequence ruled out is drawn by nothing', () => {
  const artifact = golden();
  const blocks = [...renderArtifact(artifact).matchAll(/```mermaid\n([\s\S]*?)```/g)].map((match) => match[1]);

  for (const entry of artifact.sequences.filter((sequence) => DIAGRAMMED_OUTCOMES.includes(sequence.outcome))) {
    const drawn = blocks.find((block) => block.includes(`%% ${entry.id} `));
    const steps = artifact.steps.filter((step) => step.sequence === entry.id);
    const order = [...new Set(steps.flatMap((step) => [step.subject, step.object]))];

    assert.notEqual(drawn, undefined, `${entry.id} is drawn`);
    assert.equal(messagePairs(drawn).length, steps.length);
    assert.deepEqual(
      messagePairs(drawn),
      steps.map((step) => `P${order.indexOf(step.subject) + 1}->>P${order.indexOf(step.object) + 1}`),
      'the messages are the steps, in the artifact own order',
    );
  }
  for (const entry of artifact.sequences.filter((sequence) => sequence.outcome === 'notASequence')) {
    assert.equal(blocks.some((block) => block.includes(`%% ${entry.id} `)), false, `${entry.id} is owed no diagram`);
  }
});

// ---------------------------------------------------------------------------
// C003 — every step belongs to a drawn sequence
// ---------------------------------------------------------------------------

const BELONGS = 'every-step-belongs-to-a-drawn-sequence';

/** The verdicts one check raised over an artifact, read with the material it was read beside. */
// [::TICKET::] PX-249 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-249 --for-spec --no-implementation-order`.
function verdictsOf(artifact, check) {
  return checkAll({ specLines: CENSUS_SPEC.lines, artifact, recorded: { supplied: SUPPLIED } })
    .verdicts.filter((verdict) => verdict.check === check);
}

test('C003 the golden fixture draws every step, so the check raises nothing', () => {
  assert.deepEqual(verdictsOf(golden(), BELONGS), []);
});

test('C003 a step attached to a sequence ruled notASequence is refused, naming the step', () => {
  const artifact = golden();
  const ruled = {
    ...artifact,
    sequences: artifact.sequences.map((entry) => (entry.id === 'admission' ? { ...entry, outcome: 'notASequence' } : entry)),
  };

  assert.deepEqual(verdictsOf(ruled, BELONGS).map((verdict) => verdict.subject), ['admission-1', 'admission-2', 'admission-3']);
});

test('C003 a step naming no sequence at all is refused rather than counted', () => {
  const artifact = golden();
  const detached = { ...artifact, steps: artifact.steps.map((step) => ({ ...step, sequence: 'no-such-entry' })) };

  assert.equal(verdictsOf(detached, BELONGS).length, artifact.steps.length);
});

test('C003 the registry declares the new check once and the stated count is the registry length', () => {
  assert.equal(CHECKS.filter((check) => check.id === BELONGS).length, 1);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, CHECKS.length);
  assert.equal(ENGINE_DECLARED_CHECK_COUNT, 29);
});

// ---------------------------------------------------------------------------
// C004 — the rendering is written only from a verification that passed
// ---------------------------------------------------------------------------

test('C004 a refused rendering writes nothing and leaves the artifact byte-identical', async () => {
  const run = scratch('spec');
  writeFileSync(run.artifactPath, `${JSON.stringify(undrawable(plainGolden()), null, 2)}\n`);
  const committed = readFileSync(run.artifactPath, 'utf8');

  const refused = await renderCommand([run.specPath]);

  assert.equal(refused.exitCode, RENDER_EXIT.REFUSED);
  assert.equal(refused.renderingPath, null);
  assert.match(refused.reason, /every-sequence-is-drawable/);
  assert.equal(existsSync(run.renderPath), false, 'a refused rendering writes nothing');
  assert.equal(readFileSync(run.artifactPath, 'utf8'), committed, 'a refused rendering leaves the artifact as it found it');
});

test('C004 the command writes the rendering of an artifact that passes, and the bytes are a re-render', async () => {
  const run = scratch('spec');

  const written = await renderCommand([run.specPath]);

  assert.equal(written.exitCode, RENDER_EXIT.OK);
  assert.equal(written.renderingPath, run.renderPath);
  assert.equal(readFileSync(run.renderPath, 'utf8'), renderArtifact(plainGolden()));
});

test('C004 the argument contract is unchanged and a stale artifact is refused', async () => {
  const run = scratch('spec');

  assert.equal((await renderCommand([])).exitCode, RENDER_EXIT.MISUSED, 'no argument');
  assert.equal((await renderCommand([run.specPath, run.artifactPath])).exitCode, RENDER_EXIT.MISUSED, 'two arguments');
  assert.equal((await renderCommand([join(run.root, 'absent.md')])).exitCode, RENDER_EXIT.MISUSED, 'a path that does not exist');
  assert.equal((await renderCommand([run.root])).exitCode, RENDER_EXIT.MISUSED, 'a directory');

  const stale = { ...plainGolden(), spec: { ...plainGolden().spec, sha256: '0'.repeat(64) } };
  writeFileSync(run.artifactPath, `${JSON.stringify(stale, null, 2)}\n`);

  const refused = await renderCommand([run.specPath]);

  assert.equal(refused.exitCode, RENDER_EXIT.REFUSED);
  assert.match(refused.reason, /artifact records spec sha256/);
  assert.equal(existsSync(run.renderPath), false);
});

test('C004 a specification with no artifact beside it is refused, naming the path', async () => {
  const run = scratch('spec');
  const empty = mkdtempSync(join(tmpdir(), 'px249-empty-'));
  copyFileSync(run.specPath, join(empty, 'ledger.md'));

  const refused = await renderCommand([join(empty, 'ledger.md')]);

  assert.equal(refused.exitCode, RENDER_EXIT.REFUSED);
  assert.equal(refused.renderingPath, null);
  assert.match(refused.reason, /no artifact is beside/);
});

// ---------------------------------------------------------------------------
// C005 — one verification, two product surfaces
// ---------------------------------------------------------------------------

test('C005 both product surfaces call one verification and name the same first refusal', async () => {
  const run = scratch('spec');
  writeFileSync(run.artifactPath, `${JSON.stringify(undrawable(plainGolden()), null, 2)}\n`);

  const rail = (name) => readFileSync(join(RAIL, name), 'utf8');

  assert.match(rail('run.mjs'), /verifyArtifact\(/);
  assert.match(rail('render.mjs'), /verifyArtifact\(/);
  assert.equal(rail('run.mjs').split('loadAdhocChecks(').length - 1, 1, 'the verification is not duplicated in run.mjs');
  assert.equal(rail('render.mjs').split('loadAdhocChecks(').length - 1, 0, 'the rendering reaches the checks through the shared verification');

  const throughRun = await runCommand([run.specPath], { runInput: null });
  const throughRender = await renderCommand([run.specPath]);

  assert.equal(throughRun.exitCode, 1);
  assert.equal(throughRender.exitCode, RENDER_EXIT.REFUSED);
  assert.equal(throughRender.reason, describeRefusal(throughRun.verdicts[0]), 'the two surfaces name the same first refusal');
});

test('C005 a run holding readings replaces an artifact that fails a check rather than being wedged by it', async () => {
  const run = scratch('census');
  // The artifact beside the specification fails a check, which is the state every artifact
  // written before a check existed is in. A run holding readings is about to replace it, so
  // judging it first would make the new checks a wall rather than a gate: the only way out
  // of a failed generation would be refused too.
  writeFileSync(run.artifactPath, `${JSON.stringify(undrawable(golden()), null, 2)}\n`);
  const readings = JSON.parse(readFileSync(join(CENSUS, 'ledger.run.json'), 'utf8'));

  const rebuilt = await runCommand([run.specPath], { runInput: readings });

  assert.equal(rebuilt.exitCode, 0, 'the run clears the ground and judges what it built');
  assert.deepEqual(JSON.parse(readFileSync(run.artifactPath, 'utf8')), golden());
});

test('C005 the verification re-derives the pins rather than only reading the artifact', async () => {
  const run = scratch('spec');
  const tampered = { ...plainGolden(), pins: { ...plainGolden().pins, predicate: { ...plainGolden().pins.predicate, limbs: ['a limb no line carries'] } } };
  writeFileSync(run.artifactPath, `${JSON.stringify(tampered, null, 2)}\n`);

  const refused = await renderCommand([run.specPath]);

  assert.equal(refused.exitCode, RENDER_EXIT.REFUSED);
  assert.equal(existsSync(run.renderPath), false);
});

// ---------------------------------------------------------------------------
// C006 — both committed renderings are a re-render
// ---------------------------------------------------------------------------

test('C006 the two committed renderings are byte-equal to a re-render of their artifacts', () => {
  for (const fixture of ['spec', 'census']) {
    const artifact = JSON.parse(readFileSync(join(FIXTURES, fixture, 'ledger-sequences.json'), 'utf8'));
    const committedPath = join(FIXTURES, fixture, 'ledger-sequences.md');

    assert.deepEqual(checkRenderFreshness({ artifact, committedPath }), { ok: true, files: [] }, `${fixture} is regenerated`);
  }
});
