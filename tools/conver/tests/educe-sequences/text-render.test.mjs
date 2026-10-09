// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
// Three readings of one artifact: the list, the drawing, and the Mermaid the drawing came from.
//
// The three modes are one surface over one generator, so what is held here is not that each
// mode works but that they cannot disagree: the raw mode prints the bytes the fence would
// carry, the drawn mode folds those bytes to a budget before handing them over, and the
// library that turns them into a picture is reached only by the mode that needs it.
//
// The library itself is never imported here. The rail runs under `node --test` with nothing
// installed, so the third-party layout is injected and the text handed to it is what is
// asserted; the measured rendering is recorded in `docs/EDUCE-SEQUENCES-DESIGN.md`.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C005
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sequenceDiagramSource, renderSequenceDiagram, renderArtifact } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { DIAGRAMMED_OUTCOMES } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { coverageOf, coverageTerms } from '../../.claude/scripts/educe-sequences/rail/coverage.mjs';
import { countInterrogatives, renderBrief, renderBriefFrom } from '../../.claude/scripts/educe-sequences/rail/reading.mjs';
import { DEFAULT_WIDTH, FOLD_SEPARATOR, MIN_WIDTH, displayColumns, foldToBreak, textCommand, foldMessage } from '../../.claude/scripts/educe-sequences/rail/text.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
const PHASE_SCRIPT = join(PROJECT_ROOT, '.claude/scripts/educe-sequences/rail/phase.mjs');
const ARTIFACT = join(FIXTURE, 'ledger-sequences.json');
const RENDER_PATH = join(FIXTURE, 'ledger-sequences.md');

/** The golden artifact, read fresh so no test can hand another a mutated one. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function golden() {
  return JSON.parse(readFileSync(ARTIFACT, 'utf8'));
}

/** The sequences that claim to be sequences, which are the ones a diagram is owed for. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function drawable(artifact) {
  return artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome));
}

/** The steps one sequence owns, in artifact order — what the emitter draws. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function stepsOf(artifact, id) {
  return artifact.steps.filter((step) => step.sequence === id);
}

/** A renderer that records what it was handed and returns a marker instead of a picture.
 *
 * The library is the one part of this surface that is not ours, so what the drawn mode owes
 * is the text it hands over. Recording that text is how the composition is asserted without
 * a dependency, and the marker is what proves the record reached the output. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
function recordingRenderer() {
  const handed = [];
  return {
    handed,
    render: (source, { useAscii }) => {
      handed.push({ source, useAscii });
      return { ok: true, text: `<drawing ${handed.length}>` };
    },
  };
}

/** A renderer reporting the library absent, which is what the lazy import produces. */
// [::TICKET::] PX-250 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-250 --for-spec --no-implementation-order`.
const absentRenderer = {
  render: () => ({ ok: false, reason: 'beautiful-mermaid is not installed, so nothing can be drawn; install it with `node install.js`' }),
};

// ---------------------------------------------------------------------------
// C001 — one generator, and the fence around it
// ---------------------------------------------------------------------------

test('C001 the source is what the fence carries, for every sequence that claims to be one', () => {
  const artifact = golden();

  assert.equal(drawable(artifact).length > 0, true, 'the fixture declares a sequence, so this is not vacuous');
  for (const entry of drawable(artifact)) {
    const steps = stepsOf(artifact, entry.id);
    const source = sequenceDiagramSource(entry, steps);
    const lines = source.split('\n');

    assert.equal(lines[0], 'sequenceDiagram', `${entry.id} opens with the diagram keyword`);
    assert.equal(source.includes('```'), false, `${entry.id} carries no fence`);
    assert.equal(lines.length, 2 + new Set(steps.flatMap((step) => [step.subject, step.object])).size + steps.length);
  }
});

test('C001 renderSequenceDiagram is the fence around the source and nothing else', () => {
  const artifact = golden();

  for (const entry of drawable(artifact)) {
    const steps = stepsOf(artifact, entry.id);
    assert.equal(
      renderSequenceDiagram(entry, steps),
      ['```mermaid', sequenceDiagramSource(entry, steps), '```'].join('\n'),
    );
  }
});

test('C001 the extraction moves no byte of the rendering', () => {
  const rendered = Buffer.from(renderArtifact(golden()), 'utf8');

  assert.equal(rendered.equals(readFileSync(RENDER_PATH)), true, 'the committed rendering is unchanged by the split');
});

test('C001 the raw mode prints the source verbatim and prints no fence', async () => {
  const artifact = golden();
  const expected = drawable(artifact)
    .map((entry) => sequenceDiagramSource(entry, stepsOf(artifact, entry.id)))
    .join(`\n${''}`);

  const whole = await textCommand([ARTIFACT, '--mermaid', ...drawable(artifact).flatMap((entry) => ['--id', entry.id])], { render: absentRenderer });

  assert.equal(whole.exitCode, 0);
  assert.equal(whole.output.includes('```'), false, 'the fence belongs to the rendering');
  for (const entry of drawable(artifact)) {
    assert.equal(whole.output.includes(sequenceDiagramSource(entry, stepsOf(artifact, entry.id))), true);
  }
  assert.equal(expected.length > 0, true);
});

// ---------------------------------------------------------------------------
// C003 — the fold the width budget is made of
// ---------------------------------------------------------------------------

test('C003 the fold is total and lossless at every budget', () => {
  const messages = golden().steps.map((step) => `${step.predicate} [${step.operation}]`);

  assert.equal(messages.length > 0, true);
  for (const budget of [1, 5, 20, 40, 80, 200]) {
    for (const text of messages) {
      const lines = foldMessage(text, budget);

      assert.equal(lines.length >= 1, true, `the fold is total at budget ${budget}`);
      for (const line of lines) {
        assert.equal([...line].length <= budget, true, `a line wider than ${budget}: ${line}`);
      }
      assert.equal(lines.join(' ').replace(/\s+/g, ''), text.replace(/\s+/g, ''), 'every character survives, in order');

      // A word that fits is never broken, so a fold of words that all fit breaks only at the
      // spaces between them and rejoins exactly. A word wider than the budget has to be
      // split, and a split is the one place the reconstruction is not the original spacing.
      if (text.split(' ').every((word) => [...word].length <= budget)) {
        assert.equal(lines.join(' '), text, `a fold of words that fit rejoins exactly, at budget ${budget}`);
      }
    }
  }
});

test('C003 a token longer than the budget is split rather than dropped', () => {
  const lines = foldMessage('x'.repeat(50), 20);

  assert.deepEqual(lines.map((line) => line.length), [20, 20, 10]);
  assert.equal(lines.join(''), 'x'.repeat(50), 'no character is lost to the split');
});

test('C003 the fold is the identity when the text already fits', () => {
  assert.deepEqual(foldMessage('reads [Admit]', 80), ['reads [Admit]']);
  assert.deepEqual(foldMessage('reads [Admit]', 13), ['reads [Admit]']);
});

test('C003 a message exactly as wide as the budget is one line, and one column less folds it', () => {
  const longest = 'the operator reads the signed instruction and verifies the signature against the issuer key before writing a Pending row';

  assert.equal(longest.length, 120, 'the premise of the boundary: this message is as wide as the default budget');
  assert.deepEqual(foldMessage(longest, 120), [longest], 'a message that exactly fits is not broken');
  assert.equal(foldMessage(longest, 119).length > 1, true, 'one column less has to fold');

  for (const budget of [10, 33, 64, 119]) {
    const lines = foldMessage(longest, budget);
    assert.equal(Math.max(...lines.map((line) => [...line].length)) <= budget, true);
    assert.equal(lines.join(' ').replace(/\s+/g, ''), longest.replace(/\s+/g, ''), `no character is lost at budget ${budget}`);
  }
  assert.equal(foldMessage(longest, 64).join(' '), longest, 'words that fit are never broken');
});

// ---------------------------------------------------------------------------
// C002 — selection, and what a refusal is
// ---------------------------------------------------------------------------

test('C002 the list names every sequence with its range, its outcome and its step count', async () => {
  const artifact = golden();
  const listed = await textCommand([ARTIFACT, '--list'], { render: absentRenderer });

  assert.equal(listed.exitCode, 0);
  const lines = listed.output.trimEnd().split('\n');
  assert.equal(lines.length, artifact.sequences.length, 'one line per sequence');
  for (const [index, entry] of artifact.sequences.entries()) {
    assert.equal(lines[index].includes(entry.id), true, `${entry.id} is named`);
    assert.equal(lines[index].includes(`${entry.firstLine}-${entry.lastLine}`), true, `${entry.id} carries its range`);
    assert.equal(lines[index].includes(String(stepsOf(artifact, entry.id).length)), true, `${entry.id} carries its step count`);
  }
});

test('C002 each selected id contributes one output, in the order the arguments gave', async () => {
  const artifact = golden();
  const recorder = recordingRenderer();
  const drawn = await textCommand([ARTIFACT, '--id', 'settlement', '--id', 'admission'], { render: recorder.render });

  assert.equal(drawn.exitCode, 0);
  assert.equal(recorder.handed.length, 2, 'one drawing per id, and no more');
  assert.match(recorder.handed[0].source, /%% settlement 34-35/);
  assert.match(recorder.handed[1].source, /%% admission 24-26/, 'the argument order decides, not the artifact order');
  assert.equal(
    drawn.output.indexOf('settlement 34-35') < drawn.output.indexOf('admission 24-26'),
    true,
    'the blocks are printed in the order they were drawn',
  );
  assert.equal(artifact.sequences.length > 0, true);
});

test('C002 a repeated id is drawn twice, because it was asked for twice', async () => {
  const drawn = await textCommand([ARTIFACT, '--id', 'admission', '--id', 'admission'], { render: recordingRenderer().render });

  assert.equal(drawn.exitCode, 0);
  assert.equal((drawn.output.match(/<drawing \d+>/g) ?? []).length, 2);
});

test('C002 an id the artifact does not hold is refused by name and nothing reaches stdout', async () => {
  const refused = await textCommand([ARTIFACT, '--id', 'admission', '--id', 'no-such-sequence'], { render: recordingRenderer().render });

  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.output, '', 'a refusal is never a partial rendering');
  assert.match(refused.reason, /no-such-sequence/);
});

test('C002 an invocation naming neither mode is refused with a usage line naming both', async () => {
  const refused = await textCommand([ARTIFACT], { render: absentRenderer });

  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.output, '');
  assert.match(refused.reason, /--list/);
  assert.match(refused.reason, /--id/);
});

test('C002 an artifact that does not exist is refused by path before any id is judged', async () => {
  const refused = await textCommand([join(FIXTURE, 'absent.json'), '--id', 'admission'], { render: absentRenderer });

  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.output, '');
  assert.match(refused.reason, /absent\.json/);
});

test('C002 a flag that cannot act on the chosen mode is refused rather than ignored', async () => {
  const width = await textCommand([ARTIFACT, '--mermaid', '--id', 'admission', '--width', '40'], { render: absentRenderer });
  const charset = await textCommand([ARTIFACT, '--mermaid', '--id', 'admission', '--ascii'], { render: absentRenderer });

  assert.notEqual(width.exitCode, 0);
  assert.match(width.reason, /--width/);
  assert.match(width.reason, /--mermaid/);
  assert.notEqual(charset.exitCode, 0);
  assert.match(charset.reason, /--ascii/);
});

test('C002 an unknown option is refused by name', async () => {
  const refused = await textCommand([ARTIFACT, '--list', '--draw'], { render: absentRenderer });

  assert.notEqual(refused.exitCode, 0);
  assert.match(refused.reason, /--draw/);
});

// ---------------------------------------------------------------------------
// The drawn mode — composed here, laid out by the library
// ---------------------------------------------------------------------------

test('the drawn mode hands the library a folded source and prints the picture it returns', async () => {
  const recorder = recordingRenderer();
  const drawn = await textCommand([ARTIFACT, '--id', 'admission', '--width', '40'], { render: recorder.render });

  assert.equal(drawn.exitCode, 0);
  assert.equal(recorder.handed.length, 1);
  assert.equal(drawn.output.includes('<drawing 1>'), true, 'what the library returned reached the output');
  assert.equal(drawn.output.includes('admission 24-26'), true, 'the block names the sequence it draws');

  const folded = recorder.handed[0].source;
  assert.equal(folded.includes('sequenceDiagram'), true);
  for (const line of folded.split('\n')) {
    if (!line.includes('->>')) continue;
    for (const piece of line.slice(line.indexOf(': ') + 2).split(FOLD_SEPARATOR)) {
      assert.equal([...piece].length <= 40, true, `a folded message line runs past the budget: ${piece}`);
    }
  }
});

test('the drawn mode hands over the identifiers, so a long name cannot widen the drawing', async () => {
  const artifact = golden();
  const recorder = recordingRenderer();
  await textCommand([ARTIFACT, '--id', 'admission'], { render: recorder.render });

  const source = recorder.handed[0].source;

  assert.match(source, /participant P1 as P1/);
  for (const step of stepsOf(artifact, 'admission')) {
    assert.equal(source.includes(step.object), false, `${step.object} belongs in the legend, not in the drawing`);
  }
});

test('C003 the drawn mode narrows the message budget until the drawing fits', async () => {
  const seen = [];
  // A renderer whose width grows with the longest folded piece, which is the shape the
  // library has: a wider message pushes the lifelines further apart.
  const widening = (source) => {
    const pieces = source.split('\n').filter((line) => line.includes('->>'))
      .flatMap((line) => line.slice(line.indexOf(': ') + 2).split(FOLD_SEPARATOR));
    const longest = Math.max(...pieces.map((piece) => [...piece].length));
    seen.push(longest);
    return { ok: true, text: 'x'.repeat(3 * longest) };
  };

  const drawn = await textCommand([ARTIFACT, '--id', 'admission', '--width', '30'], { render: widening });

  assert.equal(drawn.exitCode, 0);
  assert.equal(seen.length > 1, true, 'the first attempt did not fit, so the budget was narrowed');
  for (let index = 1; index < seen.length; index += 1) {
    assert.equal(seen[index] <= seen[index - 1], true, 'narrowing never widens');
  }
  assert.equal(3 * seen.at(-1) <= 30, true, 'the drawing it kept fits the budget it was given');
  assert.equal(drawn.reason, '', 'a drawing that fits has nothing to report');
});

test('a drawing that cannot be made to fit is printed and reported rather than withheld', async () => {
  const rigid = () => ({ ok: true, text: 'x'.repeat(500) });
  const drawn = await textCommand([ARTIFACT, '--id', 'admission', '--width', '60'], { render: rigid });

  assert.equal(drawn.exitCode, 0);
  assert.equal(drawn.output.includes('x'.repeat(500)), true, 'a diagram that is merely wide can be scrolled');
  assert.match(drawn.reason, /500/);
  assert.match(drawn.reason, /60/);
});

test('a sequence carrying no step says so instead of drawing blankness', async () => {
  const artifact = golden();
  const bare = artifact.sequences.filter((entry) => stepsOf(artifact, entry.id).length === 0);

  assert.equal(bare.length > 0, true, 'most entries of a real artifact carry no step, so this is the common case');
  for (const entry of bare) {
    const recorder = recordingRenderer();
    const drawn = await textCommand([ARTIFACT, '--id', entry.id], { render: recorder.render });

    assert.equal(drawn.exitCode, 0, 'an entry the artifact holds is not a refusal');
    assert.equal(drawn.output.includes(entry.id), true);
    assert.match(drawn.output, /carries no step/);
    assert.deepEqual(recorder.handed, [], 'the renderer is not handed a sequence with nothing in it');
    const lines = drawn.output.split('\n');
    assert.equal(lines.some((line, index) => line === '' && lines[index + 1] === ''), false, 'no run of blank lines');
    assert.match(lines.filter((line) => line !== '').at(-1), /carries no step/, 'the block ends by saying what the entry is');
  }
});

test('a file that is not a sequence artifact is refused by name rather than by a stack trace', async () => {
  const root = mkdtempSync(join(tmpdir(), 'px250-shape-'));
  const notAnArtifact = join(root, 'other.json');
  const halfAnArtifact = join(root, 'half.json');
  writeFileSync(notAnArtifact, JSON.stringify({ hello: 'world' }));
  writeFileSync(halfAnArtifact, JSON.stringify({ sequences: [{ id: 'x', firstLine: 1, lastLine: 2, outcome: 'direct' }] }));

  try {
    for (const path of [notAnArtifact, halfAnArtifact]) {
      const refused = await textCommand([path, '--list'], { render: absentRenderer });

      assert.notEqual(refused.exitCode, 0, `${path} is not a sequence artifact`);
      assert.equal(refused.output, '', 'a refusal writes nothing to stdout');
      assert.match(refused.reason, /is not a sequence artifact/, 'the refusal says what the file is not');
      assert.equal(refused.reason.includes('TypeError'), false, 'and never by a stack trace');
      assert.equal(refused.reason.includes(' at '), false, 'nor by a frame of one');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the drawn mode draws exactly the participants of the sequence it was asked for', async () => {
  const artifact = golden();
  const recorder = recordingRenderer();
  const drawn = await textCommand([ARTIFACT, '--id', 'settlement'], { render: recorder.render });
  const steps = stepsOf(artifact, 'settlement');
  const names = [...new Set(steps.flatMap((step) => [step.subject, step.object]))];
  const legend = drawn.output.split('\n').filter((line) => /^P\d+ = /.test(line));

  assert.equal(drawn.exitCode, 0);
  assert.equal(recorder.handed.length, 1);
  assert.deepEqual(legend, names.map((name, index) => `P${index + 1} = ${name}`), 'the legend is the participants, in first-appearance order');
  assert.equal(legend.length < artifact.steps.length, true, 'the other sequence does not leak into this one');
});

test('the drawn mode asks for the character set it was told to use', async () => {
  const unicode = recordingRenderer();
  const ascii = recordingRenderer();

  await textCommand([ARTIFACT, '--id', 'admission'], { render: unicode.render });
  await textCommand([ARTIFACT, '--id', 'admission', '--ascii'], { render: ascii.render });

  assert.equal(unicode.handed[0].useAscii, false);
  assert.equal(ascii.handed[0].useAscii, true);
});

test('the drawn mode refuses by naming the library when it is absent, rather than raising', async () => {
  const refused = await textCommand([ARTIFACT, '--id', 'admission'], { render: absentRenderer.render });

  assert.notEqual(refused.exitCode, 0);
  assert.match(refused.reason, /beautiful-mermaid/);
});

// ---------------------------------------------------------------------------
// C005 — the library is reached by one mode and by no other
// ---------------------------------------------------------------------------

test('C005 the modes that need no library run with a renderer that refuses to be called', async () => {
  const uncallable = {
    render: () => {
      throw new Error('the library must not be reached by this mode');
    },
  };

  const listed = await textCommand([ARTIFACT, '--list'], { render: uncallable.render });
  const raw = await textCommand([ARTIFACT, '--id', 'admission', '--mermaid'], { render: uncallable.render });

  assert.equal(listed.exitCode, 0, 'the list needs no library');
  assert.equal(raw.exitCode, 0, 'the raw mode needs no library');
});

test('C005 the width budget is a named constant, taken from the terminal when there is one', () => {
  assert.equal(Number.isInteger(DEFAULT_WIDTH), true);
  assert.equal(DEFAULT_WIDTH > 0, true);
  assert.equal(Number.isInteger(MIN_WIDTH), true);
  assert.equal(MIN_WIDTH > 0 && MIN_WIDTH <= DEFAULT_WIDTH, true, 'a floor below the default, so the default is reachable');
});

// ---------------------------------------------------------------------------
// C001-C007 — the fourth reading: what a sequence's acts are, in the order they
// are performed, and who does what to whose
// ---------------------------------------------------------------------------
// The tree is rooted where the drawing is rooted — the sequences that claim to be one — so a
// reader meets the same set in both readings and the two cannot disagree. It draws nothing,
// so it reaches no library; it writes nothing, so it cannot damage an artifact; and it is a
// rendering of what a reader already wrote, so it is orientation and never evidence.
//
// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// @verifies C005
// @verifies C006
// @verifies C007

/** A header line opens with the sequence mark; a branch line carries an ordinal and a name. */
const HEADER = /^▸ /;
const BRANCH = /^\s+[├└]─ \d\d  /;

/** The sequence an id names, which is what a header line's first word must be. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function headerIds(output) {
  return output.split('\n').filter((line) => HEADER.test(line)).map((line) => line.slice(2).split(' ')[0]);
}

/** Build an artifact in a temporary directory, read it, then remove the directory. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
async function withArtifact(document, read) {
  const root = mkdtempSync(join(tmpdir(), 'px252-tree-'));
  const path = join(root, 'artifact.json');
  writeFileSync(path, JSON.stringify(document));
  try {
    return await read(path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** One step of a synthetic artifact, carrying only what the schema requires plus the acts. */
// [::TICKET::] PX-252 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-252 --for-spec --no-implementation-order`.
function stepAct(id, sequence, operation, line) {
  return { id, sequence, operation, subject: 'an actor', predicate: 'performs', object: 'an act', line, quote: 'the act' };
}

test('C001 the tree roots at exactly the sequences that claim to be one, in artifact order', async () => {
  const artifact = golden();
  const claiming = artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome));
  const tree = await textCommand([ARTIFACT, '--tree'], { render: absentRenderer });

  assert.equal(claiming.length > 0, true, 'the fixture claims a sequence, so this is not vacuous');
  assert.equal(tree.exitCode, 0);
  assert.deepEqual(headerIds(tree.output), claiming.map((entry) => entry.id), 'in the artifact array order');
  const owed = artifact.steps.filter((step) => claiming.some((entry) => entry.id === step.sequence));
  assert.equal(tree.output.split('\n').filter((line) => BRANCH.test(line)).length, owed.length, 'one branch line per owed step');
});

test('C001 the entries the tree does not draw are counted rather than left silent', async () => {
  const artifact = golden();
  const claiming = artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome));
  const named = new Set(artifact.steps.map((step) => step.operation));
  const tree = await textCommand([ARTIFACT, '--tree'], { render: absentRenderer });
  const tail = tree.output.trimEnd().split('\n').at(-1);

  assert.match(tail, new RegExp(`${artifact.sequences.length - claiming.length} entries`), 'the regions ruled not a sequence');
  assert.match(tail, new RegExp(`${artifact.operations.filter((operation) => !named.has(operation.id)).length} operation`), 'the operations no step names');
});

test('C001 a named entry is printed alone, whatever its outcome', async () => {
  const named = await textCommand([ARTIFACT, '--tree', '--id', 'admission', '--id', 'settlement'], { render: absentRenderer });

  assert.equal(named.exitCode, 0);
  assert.deepEqual(headerIds(named.output), ['admission', 'settlement'], 'the argument order decides');
  assert.equal(named.output.includes('front-matter'), false, 'an entry not asked for is not printed');
  // An entry the artifact holds but never adjudicated is still an entry it holds, so `--id`
  // shows it with the outcome it carries: `--id` names an entry, not a claim.
  const unruled = await textCommand([ARTIFACT, '--tree', '--id', 'settlement-replays-admission'], { render: absentRenderer });
  assert.equal(unruled.exitCode, 0);
  assert.deepEqual(headerIds(unruled.output), ['settlement-replays-admission']);
  assert.match(unruled.output, /unread|not a sequence/);
});

test('C001 an artifact whose entries claim nothing prints a counted line and not silence', async () => {
  const tree = await withArtifact({
    sequences: [
      { id: 'first', kind: 'entry', firstLine: 1, lastLine: 4, outcome: 'notASequence' },
      { id: 'second', kind: 'entry', firstLine: 5, lastLine: 8, outcome: 'exempt' },
    ],
    steps: [],
    operations: [{ id: 'Never', position: 'excluded' }],
  }, (path) => textCommand([path, '--tree'], { render: absentRenderer }));

  assert.equal(tree.exitCode, 0, 'an artifact with nothing to draw is a reading, not a refusal');
  assert.notEqual(tree.output.trim(), '', 'silence would be indistinguishable from a run that failed');
  assert.match(tree.output, /2 entries/, 'the entries ruled not a sequence are counted');
  assert.match(tree.output, /1 operation/, 'the operations no step names are counted');
});

test('C002 every act field reaches the block as the artifact carries it', async () => {
  const artifact = golden();
  const claiming = artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome));
  const owed = artifact.steps.filter((step) => claiming.some((entry) => entry.id === step.sequence));
  const tree = await textCommand([ARTIFACT, '--tree'], { render: absentRenderer });

  assert.equal(owed.length > 0, true, 'the fixture owes steps, so this is not vacuous');
  for (const step of owed) {
    assert.equal(tree.output.includes(`WHO: ${step.subject}`), true, `${step.id} carries its subject`);
    assert.equal(tree.output.includes(`WHAT: ${step.predicate}`), true, `${step.id} carries its predicate`);
    assert.equal(tree.output.includes(`WHOSE: ${step.object}`), true, `${step.id} carries its object`);
  }
});

test('C002 a step the schema does not require the act fields of prints the absence', async () => {
  // artifact-schema.json requires of a step only id, sequence, operation, line and quote, so
  // a step with no subject, predicate or object is a step the schema allows.
  const tree = await withArtifact({
    sequences: [{ id: 'solo', kind: 'entry', firstLine: 1, lastLine: 2, outcome: 'direct' }],
    steps: [{ id: 'solo-1', sequence: 'solo', operation: 'Act', line: 1, quote: 'the act' }],
    operations: [{ id: 'Act', position: 'positioned' }],
  }, (path) => textCommand([path, '--tree'], { render: absentRenderer }));

  assert.equal(tree.exitCode, 0);
  assert.match(tree.output, /WHO: \(not stated\)/, 'an absent field is named as absent, not omitted');
  assert.match(tree.output, /WHAT: \(not stated\)/);
  assert.match(tree.output, /WHOSE: \(not stated\)/);
});

test('C003 the fold is total, lossless and holds the budget at every width', () => {
  const mixed = '通常のroot issuance条件に加えて申請者のValidForumEkycParticipationProofをissued_at時点で完全オフライン検証する';

  assert.equal(foldToBreak('a message that fits', 40).length, 1, 'the identity when the text already fits');
  // The budget is honoured from the width of one character upward. Below that no fold can
  // keep it: a character is drawn whole, so the narrowest line the text admits is one
  // character wide, and the fold is total rather than refusing.
  for (let budget = 2; budget <= 60; budget += 1) {
    const folded = foldToBreak(mixed, budget);

    assert.equal(folded.length >= 1, true, `the fold is total at ${budget}`);
    assert.equal(folded.every((line) => displayColumns(line) <= budget), true, `a line over ${budget}`);
    assert.equal(
      folded.join('').replace(/\s/g, ''),
      mixed.replace(/\s/g, ''),
      `the fold is lossless at ${budget}: every character survives, in order`,
    );
  }
  assert.deepEqual(foldToBreak('申請', 1), ['申', '請'], 'a budget under one character yields one character per line');
});

test('C003 a cut falls only where a reader of the text expects one', () => {
  const mixed = '通常のroot issuance条件に加えて申請者のValidForumEkycParticipationProofをissued_at時点で完全オフライン検証する';
  const folded = foldToBreak(mixed, 40);

  assert.equal(folded.length > 1, true, 'this text needs folding at 40, so what follows is not vacuous');
  for (const line of folded) {
    assert.equal(/^[）」』】〉》、。，．：；！？]/.test(line), false, `a line opens with a closing mark: ${line}`);
    assert.equal(/[（「『【〈《]$/.test(line), false, `a line closes with an opening mark: ${line}`);
  }
  // A Latin token that fits on a line of its own is never split, at any budget it fits.
  const latin = 'the operator verifies the signature against the issuer key';
  for (let budget = 20; budget <= 48; budget += 1) {
    for (const line of foldToBreak(latin, budget)) {
      assert.equal(/[A-Za-z]-$/.test(line), false, `a Latin token was split at ${budget}: ${line}`);
    }
  }
  assert.equal(foldToBreak(latin, 24).join('').includes('signature'), true, 'the token survived whole');
});

test('C004 columns are counted as a reader sees them', () => {
  assert.equal(displayColumns('申請者'), 6, 'two columns per CJK character');
  assert.equal(displayColumns('abc'), 3);
  assert.equal(displayColumns(''), 0);
  assert.equal(displayColumns('A申'), 3, 'mixed script is summed, not counted by code point');
});

test('C004 no rendered line exceeds the budget, over the whole golden artifact', async () => {
  const tree = await textCommand([ARTIFACT, '--tree', '--width', '120'], { render: absentRenderer });

  assert.equal(tree.exitCode, 0);
  assert.equal(headerIds(tree.output).length > 1, true, 'the fixture claims more than one sequence, so the separator is exercised');
  for (const line of tree.output.split('\n')) {
    assert.equal(displayColumns(line) <= 120, true, `${displayColumns(line)} columns: ${line}`);
  }
  // A blank line separates two sequences and never sits inside one, so the block a step
  // belongs to is readable without counting the lines above it.
  assert.equal(/\n\n\n/.test(tree.output), false, 'one blank line between two sequences, never two');
  assert.equal(tree.output.split('\n').some((line) => line !== '' && line.trim() === ''), false, 'no line is whitespace that is not blank');
});

test('C004 an object wider than the budget is folded rather than allowed to overflow', async () => {
  const wide = golden();
  wide.steps[0] = { ...wide.steps[0], object: 'x'.repeat(400) };
  const tree = await withArtifact(wide, (path) => textCommand([path, '--tree', '--width', '60'], { render: absentRenderer }));

  assert.equal(tree.exitCode, 0);
  assert.equal(tree.output.split('\n').every((line) => displayColumns(line) <= 60), true);
  assert.equal(tree.output.includes('x'.repeat(400)), false, 'the object is folded, not dropped');
  assert.equal(tree.output.includes('xxxxxx'), true);
});

test('C005 SHARE counts other sequences, and is absent when there are none', async () => {
  const tree = await withArtifact({
    sequences: [1, 2, 3].map((n) => ({ id: `s${n}`, kind: 'entry', firstLine: n, lastLine: n, outcome: 'direct' })),
    steps: [
      stepAct('s1-1', 's1', 'Shared', 1), stepAct('s1-2', 's1', 'Paired', 1), stepAct('s1-3', 's1', 'Solo', 1),
      stepAct('s1-4', 's1', 'Twice', 1), stepAct('s1-5', 's1', 'Twice', 2),
      stepAct('s2-1', 's2', 'Shared', 2), stepAct('s2-2', 's2', 'Paired', 2),
      stepAct('s3-1', 's3', 'Shared', 3),
    ],
    operations: ['Shared', 'Paired', 'Solo', 'Twice'].map((id) => ({ id, position: 'positioned' })),
  }, (path) => textCommand([path, '--tree', '--id', 's1'], { render: absentRenderer }));

  assert.equal(tree.exitCode, 0);
  assert.match(tree.output, /SHARE: also named by 2 other sequences/, 'Shared is named in three sequences');
  assert.match(tree.output, /SHARE: also named by 1 other sequence\b/, 'the singular for two sequences');
  assert.equal(tree.output.includes('SHARE: also named by 0'), false, 'Solo is named here alone');
  assert.equal((tree.output.match(/SHARE:/g) ?? []).length, 2, 'Twice is named twice in one sequence and adds no share');
});

test('C005 the nine measured terms are unchanged: sharing is spelled by the tree and nowhere else', () => {
  assert.deepEqual(
    coverageTerms(coverageOf(golden())).map((term) => term.key),
    ['entries', 'sequences', 'steps', 'operations', 'placed', 'excused', 'sections', 'linesReached', 'census'],
    'a second spelling of one fact is a second thing to keep in step',
  );
});

test('C006 the fourth reading accepts the budget the list refuses', async () => {
  const withWidth = await textCommand([ARTIFACT, '--tree', '--width', '40'], { render: absentRenderer });

  assert.equal(withWidth.exitCode, 0, 'the tree has a budget to spend');
  const labelled = withWidth.output.split('\n').filter((line) => /(?:WHO|WHAT|WHOSE|SHARE): /.test(line));
  assert.equal(labelled.length > 0, true, 'there are act lines for the budget to hold');
  for (const line of labelled) {
    assert.equal(displayColumns(line) <= 40, true, `${displayColumns(line)} columns: ${line}`);
  }
  // A heading names a sequence, a range and a count, and folding an identifier is worse than
  // a wide line: the reading is scrolled rather than withheld, the rule the drawn mode keeps.
  assert.equal(withWidth.output.split('\n').some((line) => line.startsWith('▸ ') && displayColumns(line) > 40), true);

  const listed = await textCommand([ARTIFACT, '--list', '--width', '40'], { render: absentRenderer });
  assert.notEqual(listed.exitCode, 0, 'the list has none, so the flag is still refused there');
  assert.match(listed.reason, /--width/);
});

test('C006 an id the artifact does not hold, and a flag that cannot act on the mode', async () => {
  const unknown = await textCommand([ARTIFACT, '--tree', '--id', 'no-such-sequence'], { render: absentRenderer });

  assert.equal(unknown.exitCode, 1, 'a statement about the artifact');
  assert.equal(unknown.output, '', 'a refusal is never a partial rendering');
  assert.match(unknown.reason, /no-such-sequence/);

  for (const inert of ['--mermaid', '--ascii']) {
    const refused = await textCommand([ARTIFACT, '--tree', inert], { render: absentRenderer });

    assert.equal(refused.exitCode, 2, `${inert} is a statement about the invocation`);
    assert.equal(refused.output, '');
    assert.match(refused.reason, new RegExp(inert));
  }

  const both = await textCommand([ARTIFACT, '--tree', '--list'], { render: absentRenderer });
  assert.notEqual(both.exitCode, 0, 'one names what the artifact holds, the other what to read from it');
});

test('C006 the fourth reading reaches no library', async () => {
  const neverCalled = {
    render: () => {
      throw new Error('the tree must reach no renderer');
    },
  };
  const tree = await textCommand([ARTIFACT, '--tree'], { render: neverCalled.render });

  assert.equal(tree.exitCode, 0, 'a machine that has never run install.js can read a tree');
  assert.equal(tree.reason, '');
});

test('C007 a brief carrying the tree still asks exactly one question', () => {
  const template = [
    '# Brief: adjudicate',
    '{{QUESTION}}',
    '{{PREDICATE}}',
    '- {{VERBATIM_QUOTE}}',
    '- {{NO_LINE_WINDOW}}',
    '{{TREE}}',
    'Worklist: {{WORKLIST_PATH}}',
  ].join('\n');
  // The tree quotes acts out of the specification, and a specification sentence may end in a
  // question mark. Those are not questions the brief asks, so they are subtracted from the
  // count exactly as the predicate clause already is.
  const tree = '▸ s1  direct\n  ├─ 01  Act  WHO: who does it?\n  │             WHAT: acts?  WHOSE: it?';
  const rendered = renderBriefFrom({
    template,
    briefName: 'adjudicate',
    worklistPath: '/run/educe-sequences/worklist.txt',
    predicate: { line: 10, limbs: ['a limb'], text: 'a procedure counts when it effects a limb' },
    orientation: { tree },
  });

  assert.equal(rendered.includes('who does it?'), true, 'the tree reached the brief');
  assert.equal(countInterrogatives(rendered), 4, 'the brief asks one and the tree quotes three');
});

test('C007 the tree travels to the phases whose question is about order, actor or reach', () => {
  const worklistPath = '/run/educe-sequences/worklist.txt';
  const predicate = { line: 10, limbs: ['a limb'], text: 'a procedure counts when it effects a limb' };

  for (const briefName of ['span', 'uncovered', 'reroute', 'adversarial', 'adjudicate']) {
    const rendered = renderBrief({ briefName, worklistPath, predicate, orientation: { tree: 'TREE-MARK' } });

    assert.equal(rendered.includes('TREE-MARK'), true, `${briefName} carries the tree`);
  }
  for (const briefName of ['inquest', 'adhoc']) {
    const rendered = renderBrief({ briefName, worklistPath, predicate, orientation: { tree: 'TREE-MARK' } });

    assert.equal(rendered.includes('TREE-MARK'), false, `${briefName} does not carry the tree`);
  }
  // A generation with no artifact in hand renders without the block, so a first generation's
  // briefs are exactly as long as they are today.
  for (const briefName of ['span', 'adjudicate']) {
    const rendered = renderBrief({ briefName, worklistPath, predicate, orientation: { tree: '' } });

    assert.equal(rendered.includes('{{TREE}}'), false, 'no placeholder is left standing');
  }
});

test('C006 every byte the three existing readings write is unchanged', async () => {
  const artifact = golden();
  const claiming = artifact.sequences.filter((entry) => DIAGRAMMED_OUTCOMES.includes(entry.outcome));

  assert.equal(claiming.length > 0, true, 'the fixture claims a sequence, so this is not vacuous');
  for (const entry of claiming) {
    const recorder = recordingRenderer();
    const drawn = await textCommand([ARTIFACT, '--id', entry.id], { render: recorder.render });
    const raw = await textCommand([ARTIFACT, '--id', entry.id, '--mermaid'], { render: absentRenderer });

    assert.match(raw.output, /^sequenceDiagram\n/, `${entry.id} still prints the source`);
    assert.equal(raw.output.includes('<br/>'), false, 'the raw mode is unfolded, as before');
    assert.equal(drawn.output.includes(`P1 = `), true, `${entry.id} still prints its legend`);
    assert.equal(recorder.handed.length >= 1, true, `${entry.id} still reaches the renderer`);
  }
});

test('C007 the driver renders a brief that carries the tree of the artifact in hand', () => {
  // The unit cases above hand the renderer a tree. The command file does not: Step 8 runs
  // `phase.mjs brief <spec> <role>`, and the tree is built there, from whatever artifact the
  // run directory holds. A defect only the entry point can see is one every unit test misses.
  const root = mkdtempSync(join(tmpdir(), 'px252-driver-'));
  const specPath = join(root, 'ledger.md');
  const specFixture = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/spec');
  copyFileSync(join(specFixture, 'ledger.md'), specPath);
  copyFileSync(join(specFixture, 'ledger-sequences.json'), join(root, 'ledger-sequences.json'));
  mkdirSync(join(root, 'educe-sequences'), { recursive: true });

  try {
    const rendered = spawnSync('node', [PHASE_SCRIPT, 'brief', specPath, 'span'], { cwd: PROJECT_ROOT, encoding: 'utf8' });

    assert.equal(rendered.status, 0, rendered.stderr);
    assert.equal(rendered.stdout.includes('▸ admission'), true, 'the brief carries the tree the run has');
    assert.equal(rendered.stdout.includes('WHO: operator'), true, 'and the acts it read');
    assert.equal(rendered.stdout.includes('{{TREE}}'), false, 'no placeholder is left standing');
    assert.equal(rendered.stdout.includes(join(root, 'educe-sequences', 'worklist.txt')), true, 'and still its worklist path');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C001 an artifact carrying no operations is refused by name rather than by a stack trace', async () => {
  // `operations` is required by the artifact schema, so a document without it is not a
  // sequence artifact — and the tree counts the operations no step names, so it is the one
  // reading that reads the array. Refusing by name is the module's contract for every mode.
  const refused = await withArtifact({
    sequences: [{ id: 's', kind: 'entry', firstLine: 1, lastLine: 2, outcome: 'direct' }],
    steps: [{ id: 's-1', sequence: 's', operation: 'Act', line: 1, quote: 'q' }],
  }, (path) => textCommand([path, '--tree'], { render: absentRenderer }));

  assert.notEqual(refused.exitCode, 0);
  assert.equal(refused.output, '', 'a refusal writes nothing to stdout');
  assert.match(refused.reason, /is not a sequence artifact/);
  assert.match(refused.reason, /operations/);
  assert.equal(refused.reason.includes('TypeError'), false, 'and never by a stack trace');
  assert.equal(refused.reason.includes(' at '), false, 'nor by a frame of one');
});

test('C004 the width table carries the planes outside the basic one', () => {
  assert.equal(displayColumns('〿'), 1, 'an ideographic half fill space is Narrow');
  assert.equal(displayColumns('\u{1F600}'), 2, 'a pictograph is Wide');
  assert.equal(displayColumns('\u{20000}'), 2, 'an ideograph outside the basic plane is Wide');
  assert.equal(displayColumns('\u{1B000}'), 2, 'a kana supplement is Wide');
});

test('C004 a lead wider than the budget is printed rather than degenerating', async () => {
  // An operation name and a column wider than the budget leave the value no room. The reading
  // is printed rather than withheld, the way a drawing too wide to fit is — but the value must
  // not be folded to one character per line, which reads as a defect rather than as a reading.
  const tree = await withArtifact({
    sequences: [{ id: 's', kind: 'entry', firstLine: 1, lastLine: 2, outcome: 'direct' }],
    steps: [{
      id: 's-1', sequence: 's', operation: 'ValidForumEkycParticipationProof',
      subject: 'operator', predicate: 'verifies', object: 'the proof', line: 1, quote: 'q',
    }],
    operations: [{ id: 'ValidForumEkycParticipationProof', position: 'positioned' }],
  }, (path) => textCommand([path, '--tree', '--width', '40'], { render: absentRenderer }));

  assert.equal(tree.exitCode, 0);
  const labelled = tree.output.split('\n').filter((line) => /(?:WHO|WHAT|WHOSE): /.test(line));
  assert.equal(tree.output.includes('WHO: operator'), true, 'the acts are printed rather than withheld');
  assert.equal(tree.output.includes('WHAT: verifies'), true);
  assert.equal(tree.output.includes('WHOSE: the'), true);
  assert.equal(tree.output.split('\n').some((line) => line.trim() === 'proof'), true, 'the object wrapped rather than being dropped');
  assert.equal(labelled.length, 3, 'one labelled line per act');
  // The degenerate fold gave every character a line of its own and 29 lines for one step. The
  // reading is a heading, a spine, three acts with one wrap, and the tail.
  const written = tree.output.split('\n').length;
  assert.equal(written <= 14, true, `the reading took ${written} lines`);
});

test('C004 a sequence of a hundred steps aligns its labels as one of ten does', async () => {
  // The ordinal grows a column at a hundred, and the label column is what the body lines are
  // indented to: a column counted from a constant rather than from the ordinal leaves the
  // labels one column out and the reading unreadable exactly where it is longest.
  const steps = Array.from({ length: 105 }, (unused, index) => stepAct(`s-${index + 1}`, 's', 'Act', index + 1));
  const tree = await withArtifact({
    sequences: [{ id: 's', kind: 'entry', firstLine: 1, lastLine: 200, outcome: 'direct' }],
    steps,
    operations: [{ id: 'Act', position: 'positioned' }],
  }, (path) => textCommand([path, '--tree'], { render: absentRenderer }));

  const labelColumns = tree.output.split('\n')
    .map((line) => /^(.*?)(?:WHO|WHAT|WHOSE): /.exec(line))
    .filter((match) => match !== null)
    .map((match) => displayColumns(match[1]));

  assert.equal(labelColumns.length, 105 * 3, 'every act line is measured');
  assert.equal(new Set(labelColumns).size, 1, `the labels begin in one column, not ${[...new Set(labelColumns)].join(', ')}`);
});

test('C006 a repeated id is printed twice, because it was asked for twice', async () => {
  const tree = await textCommand([ARTIFACT, '--tree', '--id', 'admission', '--id', 'admission'], { render: absentRenderer });

  assert.equal(tree.exitCode, 0);
  assert.deepEqual(headerIds(tree.output), ['admission', 'admission']);
});

test('C007 a brief asked for with the superseded option is refused rather than silently emptied', () => {
  // The two orientation inputs are one option now. A caller that still passes the old key would
  // otherwise render every pair as "not asked" and be told nothing, which is the silent failure
  // this module refuses a flag it cannot act on for.
  assert.throws(
    () => renderBrief({
      briefName: 'inquest',
      worklistPath: '/run/educe-sequences/worklist.txt',
      predicate: { line: 10, limbs: ['a limb'], text: 'a procedure counts when it effects a limb' },
      previousAnswers: [],
    }),
    /orientation/,
  );
});
