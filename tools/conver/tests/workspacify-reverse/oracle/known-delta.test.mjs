// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The known structural delta between an answer key and its subject.
 *
 * A subject is not a byte copy of its key: the scrub removes forward artefacts,
 * strips provenance comments from shared files, renames ticket-keyed test files
 * and deletes tests that read what was removed. Every one of those is
 * intentional, and a reconciliation that reported them as findings would waste
 * the classification pass on phantoms.
 *
 * So the delta is MEASURED, never assumed, and every entry carries the evidence
 * that established it. The recovery rules are proven here on a synthetic pair;
 * the experiment's own pair — `siprs-for-reverse` and `siprs-with-4layers` — has
 * been deleted, and the tests that measured it went with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractKnownDelta,
} from '../../../.claude/scripts/workspacify-reverse/lib/oracle-bundle.mjs';
import {
  ORACLE_FIXTURE_FILES,
  SUBJECT_FIXTURE_FILES,
  createSyntheticOraclePair,
  createSyntheticTree,
} from '../helpers/scratch.mjs';

// --- The recovery rules, proven on a pair built to be recoverable ----------------

test('the three recovery rules are distinguishable on a synthetic pair', () => {
  const pair = createSyntheticOraclePair();
  try {
    const delta = extractKnownDelta({ oracleRoot: pair.oracleRoot, subjectRoot: pair.subjectRoot });

    const recovered = Object.fromEntries(delta.renamedTestFiles.map((entry) => [entry.original, entry.renamed]));
    assert.equal(recovered['verify_spec_p7_3'], 'verify_spec_26d77120', 'comment-stripped identity recovers this one');
    assert.equal(delta.renamedTestFiles.length, 2);
    assert.deepEqual(delta.unresolvedRenames, []);
  } finally {
    pair.dispose();
  }
});

test('a synthetic pair with an unrecoverable rename reports it rather than guessing', () => {
  const oracle = createSyntheticTree(ORACLE_FIXTURE_FILES, { prefix: 'wsp-oracle-' });
  const subjectFiles = { ...SUBJECT_FIXTURE_FILES };
  // Rename the test files AND change their content, so no recovery rule can apply,
  // and leave Cargo.toml naming files that are not there.
  delete subjectFiles['tests/verify_spec_4b35a676.rs'];
  delete subjectFiles['tests/verify_spec_26d77120.rs'];
  subjectFiles['tests/verify_spec_zzzzzzzz.rs'] = 'pub fn unrelated() -> u8 { 99 }\n';
  subjectFiles['tests/verify_spec_yyyyyyyy.rs'] = 'pub fn also_unrelated() -> u8 { 98 }\n';
  const subject = createSyntheticTree(subjectFiles, { prefix: 'wsp-subject-' });

  try {
    const delta = extractKnownDelta({ oracleRoot: oracle.root, subjectRoot: subject.root });
    assert.ok(delta.unresolvedRenames.length > 0, 'an unmatched name must be reported, never silently paired');
    assert.deepEqual(delta.renamedTestFiles, []);
    assert.equal(
      delta.renamedTestFiles.length + delta.unresolvedRenames.filter((entry) => entry.side === 'subject').length,
      delta.subjectTestNames.length,
      'every subject-side test name is either mapped or reported',
    );
  } finally {
    oracle.dispose();
    subject.dispose();
  }
});
