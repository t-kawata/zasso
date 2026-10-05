// PX-234 @verifies C005
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The reverse rotation's defences survive the transplant.
 *
 * Reverse mode exists because a grill over an existing implementation invites a
 * ratification RFC — the code restated as spec, with every consistency check
 * passing and nothing proved. Two mechanisms make that failure unavailable: the
 * intent-or-accident question is inserted for every unresolved claim, and a
 * stage-one residual is carried verbatim rather than reworded. This ticket adds a
 * forward-mode mechanism, so these two are asserted to still be where they were.
 *
 * The behaviour itself is covered by tests/grill-me-for-rfc/reverse/, which the
 * impact set runs; what is asserted here is that the command still states the two
 * as obligations and that neither script was replaced by a stub.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const COMMAND = join(PROJECT_ROOT, '.claude/commands/grill-me-for-rfc.md');
const GRILL_DIR = join(PROJECT_ROOT, '.claude/scripts/grill-me-for-rfc');

/** The reverse-mode section: from its heading to the end of the file. */
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function reverseSection() {
  const text = readFileSync(COMMAND, 'utf8');
  const start = text.indexOf('## Reverse mode');
  assert.notEqual(start, -1, 'the reverse-mode section is present');
  return text.slice(start);
}

test('C005 invariant: reverse mode still inserts the intent-or-accident question for every unresolved claim', () => {
  const section = reverseSection();

  assert.match(section, /intent-or-accident/, 'the question is still named');
  assert.match(section, /unconditional/, 'and still unconditional');
  assert.match(section, /never omit the intent-or-accident question for an unresolved claim/);
});

test('C005 invariant: a stage-one residual still travels verbatim', () => {
  const section = reverseSection();

  assert.match(section, /verbatim/);
  assert.match(section, /rewording any loses the observation/);
});

test('C005 invariant: the two reverse scripts still exist and carry no stub', () => {
  for (const name of ['reverse-questions.js', 'normative-decision.js']) {
    const source = readFileSync(join(GRILL_DIR, name), 'utf8');
    assert.ok(source.length > 1000, `${name} is still an implementation, not a placeholder`);
    assert.doesNotMatch(source, /\[::STUB::\]/, `${name} carries no stub`);
  }
});

test('C005 invariant: the closed answer vocabulary still holds for reverse questions', () => {
  assert.match(reverseSection(), /passes through `validate-question-format\.js` exactly as a forward question does/);
});
