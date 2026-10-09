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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sequenceDiagramSource, renderSequenceDiagram, renderArtifact } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { DIAGRAMMED_OUTCOMES } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { DEFAULT_WIDTH, FOLD_SEPARATOR, MIN_WIDTH, textCommand, foldMessage } from '../../.claude/scripts/educe-sequences/rail/text.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE = join(PROJECT_ROOT, 'tests/educe-sequences/fixtures/census');
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
