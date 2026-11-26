// The fixed-specification contract: a run reads SYSTEM-DESIGN.md at the workspace
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// root and refuses a caller-supplied path. The artifact location remains a pure
// function of that fixed specification, so a verification of an existing artifact
// cannot depend on how the verifying run was invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { artifactPathFor, parseSpecArgument, renderPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'educe-paths-'));
writeFileSync(join(WORK, 'SYSTEM-DESIGN.md'), '# A specification\n');

// [::TICKET::] PX-240, PX-241, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-240|PX-241|PX-454) --for-spec --no-implementation-order`.
test('C010 a run derives the artifact beside the fixed SYSTEM-DESIGN.md', () => {
  const specPath = join(WORK, 'SYSTEM-DESIGN.md');

  assert.equal(artifactPathFor(specPath), join(WORK, 'SYSTEM-DESIGN-sequences.json'));
  assert.equal(renderPathFor(specPath), join(WORK, 'SYSTEM-DESIGN-sequences.md'));
});

test('C010 only the final extension is removed, so a dotted name keeps its dots', () => {
  assert.equal(artifactPathFor('/tmp/spec.v32.final.md'), '/tmp/spec.v32.final-sequences.json');
  assert.equal(renderPathFor('/tmp/spec.v32.final.md'), '/tmp/spec.v32.final-sequences.md');
});

test('C010 an absent or empty argument resolves SYSTEM-DESIGN.md at the workspace root', () => {
  for (const argv of [[], ['']]) {
    const parsed = parseSpecArgument(argv, WORK);
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.equal(parsed.specPath, join(WORK, 'SYSTEM-DESIGN.md'));
  }
});

test('C010 a non-empty argument is refused because the command takes no argument', () => {
  const refused = [
    ['dynamic.md'],
    [join(WORK, 'dynamic.md')],
    [WORK],
    [join(WORK, 'absent.md')],
  ];

  for (const argv of refused) {
    const parsed = parseSpecArgument(argv, WORK);
    assert.equal(parsed.ok, false, JSON.stringify(parsed));
    assert.match(parsed.reason, /SYSTEM-DESIGN\.md|no argument/);
    assert.equal(parsed.specPath, undefined, 'a refused argument yields no path to write beside');
  }
});

test('C010 two arguments are refused', () => {
  const parsed = parseSpecArgument(['', 'extra'], WORK);
  assert.equal(parsed.ok, false);
  assert.equal(typeof parsed.reason, 'string');
});

test('C010 a workspace root without SYSTEM-DESIGN.md is refused', () => {
  const empty = mkdtempSync(join(tmpdir(), 'educe-paths-empty-'));
  const parsed = parseSpecArgument([], empty);
  assert.equal(parsed.ok, false);
  assert.match(parsed.reason, /SYSTEM-DESIGN\.md/);
});

test('C010 no environment variable changes the derived path', () => {
  const specPath = join(WORK, 'SYSTEM-DESIGN.md');
  const plain = artifactPathFor(specPath);

  process.env.EDUCE_SEQUENCES_OUT = join(WORK, 'elsewhere');
  try {
    assert.equal(artifactPathFor(specPath), plain);
  } finally {
    delete process.env.EDUCE_SEQUENCES_OUT;
  }
});
