// @verifies C004
// @verifies C005
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
/**
 * The AI's design semantics, and the two ways they are not allowed to enter.
 *
 * The claim contract already refuses an inference that states no basis — "an
 * assertion wearing an inference label" — and this module holds the authored entries
 * to the stricter half of the same contract: the basis must name claims that exist,
 * the falsification must be something a reader could run, and nothing an author writes
 * may re-open a measurement.
 *
 * A refused file admits *nothing*. Admitting the sound entries of a partly broken file
 * would publish a spec whose authored section silently differs from the file the
 * operator handed over, and the difference would be invisible in the document.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DESIGN_CLAIM_ID_PREFIX,
  SEMANTICS_FILE_KEY,
  readSemanticsFile,
  validateDesignSemantics,
  renderSemanticsAdvice,
} from '../../../.claude/scripts/workspacify-reverse/lib/design-semantics.mjs';

/** The measured claims an authored entry is allowed to infer from. */
const MEASURED = Object.freeze([
  {
    claim_id: 'clm-account-boundary_crossing-5',
    claim_type: 'observed',
    scope: 'src/api',
    statement: 'src consumes src/api through the reference at src/account.rs:5',
    falsification: 'remove the reference at src/account.rs:5 and observe whether the consumer still resolves',
    evidence: [{ source_span: { file: 'src/account.rs', line: 5 }, evidence_mode: 'source_static' }],
    basis: [],
  },
  {
    claim_id: 'clm-account-invariant-17',
    claim_type: 'inferred',
    scope: 'src/api',
    statement: 'the condition asserted at src/account.rs:17 holds',
    falsification: 'mutate the asserted condition at src/account.rs:17 and observe whether any test fails',
    evidence: [{ source_span: { file: 'src/account.rs', line: 17 }, evidence_mode: 'source_static' }],
    basis: ['the assertion at src/account.rs:17 exists in the text'],
  },
]);

/** One sound authored entry, the shape the whole file is judged by. */
// [::TICKET::] P26-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-4 --for-spec --no-implementation-order`.
function soundEntry(overrides = {}) {
  return {
    statement: 'src/api owns the request lifecycle, so a caller outside it never sees a half-built request',
    falsification: 'publish a request from src/state and observe whether a consumer can read it mid-construction',
    basis: ['clm-account-boundary_crossing-5'],
    scope: 'src/api',
    ...overrides,
  };
}

test('C004 precondition: the basis the fixture names is a claim the ledger carries', () => {
  const measured = new Set(MEASURED.map((claim) => claim.claim_id));

  for (const id of soundEntry().basis) {
    assert.equal(measured.has(id), true, `${id} must exist before an entry may infer from it`);
  }
});

test('C004 postcondition: an entry whose basis resolves becomes one inferred claim', () => {
  const { claims: admitted, findings } = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: [soundEntry()] },
    claims: MEASURED,
  });

  assert.deepEqual(findings, []);
  assert.equal(admitted.length, 1);

  const [claim] = admitted;
  assert.match(claim.claim_id, new RegExp(`^${DESIGN_CLAIM_ID_PREFIX}[0-9a-f]{12}$`));
  assert.equal(claim.claim_type, 'inferred', 'an authored claim is an inference, never a measurement');
  assert.equal(claim.scope, 'src/api');
  assert.ok(claim.falsification.length > 0, 'the falsification the author gave is what the spec carries');
  assert.deepEqual(claim.basis, soundEntry().basis, 'and the basis is the measured claim it names');
  assert.equal(claim.evidence.length, 0, 'an authored claim cites claims, not source spans it did not read');
});

test('C004 postcondition: six entries become six claims, and each keeps its own basis', () => {
  const entries = Array.from({ length: 6 }, (_, index) =>
    soundEntry({ statement: `design statement number ${index}`, basis: [MEASURED[index % MEASURED.length].claim_id] }),
  );

  const { claims: admitted, findings } = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: entries },
    claims: MEASURED,
  });

  assert.deepEqual(findings, []);
  assert.equal(admitted.length, 6);
  assert.equal(new Set(admitted.map((claim) => claim.claim_id)).size, 6, 'six entries are six ids, never five');
});

test('C004 invariant: the id is a function of the statement, so the same entry re-runs to the same id', () => {
  const once = validateDesignSemantics({ authored: { [SEMANTICS_FILE_KEY]: [soundEntry()] }, claims: MEASURED });
  const twice = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: [soundEntry(), soundEntry({ statement: 'another statement' })] },
    claims: MEASURED,
  });

  assert.equal(
    once.claims[0].claim_id,
    twice.claims[0].claim_id,
    'a re-run over the same tree must produce the same spec, so the id cannot depend on order',
  );
  assert.notEqual(once.claims[0].claim_id, twice.claims[1].claim_id);
});

test('C004 boundary: an unresolvable basis is refused by name, and nothing is admitted', () => {
  const { claims: admitted, findings } = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: [soundEntry(), soundEntry({ basis: ['clm-not-a-claim-1'] })] },
    claims: MEASURED,
  });

  assert.equal(admitted, null, 'a refused file admits nothing, not even the entry that was sound');
  assert.equal(findings.length, 1);
  assert.match(findings[0], /clm-not-a-claim-1/, 'the unresolvable id is named');
  assert.match(findings[0], /entry 2/, 'and the entry it belongs to is named');
});

test('C004 boundary: an empty falsification is refused by name', () => {
  const { claims: admitted, findings } = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: [soundEntry({ falsification: '   ' })] },
    claims: MEASURED,
  });

  assert.equal(admitted, null);
  assert.match(findings.join(' '), /falsification/i, 'the field at fault is named');
});

test('C004 boundary: a file that is not the declared shape is refused rather than guessed at', () => {
  for (const [label, authored] of [
    ['a bare array', [soundEntry()]],
    ['an unknown key', { semantics: [soundEntry()], extra: 1 }],
    ['no entries', { semantics: [] }],
    ['a missing statement', { semantics: [soundEntry({ statement: '' })] }],
  ]) {
    const { claims: admitted, findings } = validateDesignSemantics({ authored, claims: MEASURED });
    assert.equal(admitted, null, `${label} is refused`);
    assert.ok(findings.length > 0, `${label} says why`);
  }
});

test('C005 invariant: an entry may not re-open a measurement', () => {
  for (const [label, overrides] of [
    ['an id that a measured claim already carries', { claim_id: MEASURED[0].claim_id }],
    ['a claim_type the author chose', { claim_type: 'observed' }],
    ['evidence the author supplied for a claim nobody measured', { evidence: [{ source_span: { file: 'x.rs', line: 1 } }] }],
  ]) {
    const { claims: admitted, findings } = validateDesignSemantics({
      authored: { [SEMANTICS_FILE_KEY]: [soundEntry(overrides)] },
      claims: MEASURED,
    });

    assert.equal(admitted, null, `${label} is refused`);
    assert.match(findings.join(' '), /measured|re-open|measurement/i, `${label} says which rule it broke`);
  }
});

test('C005 invariant: no measured claim is returned by this module at all', () => {
  const { claims: admitted } = validateDesignSemantics({
    authored: { [SEMANTICS_FILE_KEY]: [soundEntry()] },
    claims: MEASURED,
  });

  const measuredIds = new Set(MEASURED.map((claim) => claim.claim_id));
  assert.deepEqual(
    admitted.filter((claim) => measuredIds.has(claim.claim_id)),
    [],
    'the merge adds authored claims and never returns a measured one, so none can be replaced',
  );
});

test('C004 error surface: the advice names the file, the entries and what to do', () => {
  const advice = renderSemanticsAdvice(['entry 2 names clm-absent-1, which no claim carries'], {
    path: '/tmp/semantics.json',
  });

  assert.match(advice, /\/tmp\/semantics\.json/, 'the file it read is named');
  assert.match(advice, /clm-absent-1/, 'the finding is named');
  assert.match(advice, /What to do:/, 'and so is the act that fixes it');
});

test('C004: a file that cannot be read is reported rather than thrown', () => {
  const { entries, findings } = readSemanticsFile('/nonexistent/semantics.json');

  assert.equal(entries, null);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not exist/);
});
