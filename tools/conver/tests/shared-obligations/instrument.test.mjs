// [::TICKET::] PX-302 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-302 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeInstrument } from '../../.claude/scripts/shared-obligations/instrument.mjs';

// @verifies C005
test('C005 all-No inquest and all-held attacks are non-discriminating', () => {
  const instrument = summarizeInstrument({
    readings: { inquest: { records: 2, yes: 0, no: 2 } },
    attacks: [{ outcome: 'held' }, { outcome: 'held' }],
  });

  assert.equal(instrument.nonDiscriminating, true);
  assert.equal(instrument.inquest.records, 2);
  assert.equal(instrument.inquest.yesRatio, 0);
  assert.equal(instrument.attacks.records, 2);
  assert.equal(instrument.attacks.held, 2);
  assert.equal(instrument.attacks.brokenRatio, 0);
});

// @verifies C005
test('C005 one Yes makes the inquest discriminating', () => {
  const instrument = summarizeInstrument({
    readings: { inquest: { records: 2, yes: 1, no: 1 } },
    attacks: [{ outcome: 'held' }],
  });

  assert.equal(instrument.nonDiscriminating, false);
  assert.equal(instrument.inquest.yesRatio, 0.5);
});

// @verifies C005
test('C005 zero denominators return 0 and not NaN', () => {
  const instrument = summarizeInstrument({});

  assert.equal(instrument.inquest.yesRatio, 0);
  assert.equal(instrument.attacks.brokenRatio, 0);
  assert.equal(instrument.judgments.discriminationRatio, 0);
  assert.equal(Number.isNaN(instrument.inquest.yesRatio), false);
  assert.equal(instrument.nonDiscriminating, true);
});

// @verifies C005
test('C005 distinct basis quotes and effort alternatives are counted', () => {
  const instrument = summarizeInstrument({
    judgments: [
      { basis: [{ quote: 'a clause' }] },
      { basis: [{ quote: 'a  clause' }] },
      { basis: [{ quote: 'another clause' }] },
    ],
    effort: [
      { alternatives: [{ verdict: 'absent' }], discriminator: { basisRef: 'a' } },
      { alternatives: [{ verdict: 'absent' }], discriminator: { basisRef: 'a' } },
      { alternatives: [{ verdict: 'present' }], discriminator: { basisRef: 'b' } },
    ],
  });

  assert.equal(instrument.judgments.basisQuotes, 3);
  assert.equal(instrument.judgments.distinctBasisQuotes, 2);
  assert.equal(instrument.judgments.discriminationRatio, 2 / 3);
  assert.equal(instrument.effort.records, 3);
  assert.equal(instrument.effort.distinctAlternatives, 2);
  assert.equal(instrument.effort.distinctDiscriminators, 2);
});
