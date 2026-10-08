// The one-argument contract: the output location is a pure function of the argument
// (PX-240, contract C010). A flag, an environment variable or a second argument that
// changed the location would make a verification of an existing artifact depend on
// how the verifying run was invoked rather than on the specification alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { artifactPathFor, parseSpecArgument, renderPathFor } from '../../.claude/scripts/educe-sequences/rail/paths.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'educe-paths-'));

// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function specNamed(name, body = '# A specification\n') {
  const path = join(WORK, name);
  writeFileSync(path, body);
  return path;
}

test('C010 a run with one argument derives the artifact beside the specification', () => {
  const specPath = specNamed('ledger.md');

  assert.equal(artifactPathFor(specPath), join(WORK, 'ledger-sequences.json'));
  assert.equal(renderPathFor(specPath), join(WORK, 'ledger-sequences.md'));
});

test('C010 only the final extension is removed, so a dotted name keeps its dots', () => {
  assert.equal(artifactPathFor('/tmp/spec.v32.final.md'), '/tmp/spec.v32.final-sequences.json');
  assert.equal(renderPathFor('/tmp/spec.v32.final.md'), '/tmp/spec.v32.final-sequences.md');
});

test('C010 zero arguments, two arguments, a directory and an extensionless path are each refused', () => {
  const specPath = specNamed('plain.md');
  const extensionless = specNamed('noext');

  const refusals = [
    parseSpecArgument([]),
    parseSpecArgument([specPath, specPath]),
    parseSpecArgument([WORK]),
    parseSpecArgument([extensionless]),
  ];

  for (const refusal of refusals) {
    assert.equal(refusal.ok, false, JSON.stringify(refusal));
    assert.equal(typeof refusal.reason, 'string');
    assert.equal(refusal.specPath, undefined, 'a refused argument yields no path to write beside');
  }
});

test('C010 an argument that names nothing is refused before the specification is opened', () => {
  const refusal = parseSpecArgument([join(WORK, 'absent.md')]);

  assert.equal(refusal.ok, false);
  assert.match(refusal.reason, /absent\.md/);
});

test('C010 one good argument resolves to an absolute path', () => {
  const specPath = specNamed('good.md');
  const parsed = parseSpecArgument([specPath]);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.specPath, specPath);
});

test('C010 no environment variable changes the derived path', () => {
  const specPath = specNamed('stable.md');
  const plain = artifactPathFor(specPath);

  process.env.EDUCE_SEQUENCES_OUT = join(WORK, 'elsewhere');
  try {
    assert.equal(artifactPathFor(specPath), plain);
  } finally {
    delete process.env.EDUCE_SEQUENCES_OUT;
  }
});
