// PX-239 @verifies C005
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
/**
 * Candidate discovery, never a verdict.
 *
 * Contradiction detection between two prose documents is not decidable, so this
 * script reports the shapes that produced real defects in the nine runs and leaves
 * the adjudication to the run. The exit status therefore never encodes the result:
 * an empty candidate set is not a pass, and a non-empty one is not a failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GRILL_SCAN_DEFECTS, runCommand } from '../question-gate/helpers/fixture-workspace.mjs';

/**
 * A package directory holding the stage-1 artifacts a pattern reads.
 *
 * @param {Record<string, string>} files — filename to content
 * @returns {string} the package directory
 */
// [::TICKET::] PX-239 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-239 --for-spec --no-implementation-order`.
function makePackage(files) {
  const dir = mkdtempSync(join(tmpdir(), 'px239-scan-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

test('C005 invariant: the candidate set never changes the exit status', () => {
  const quiet = makePackage({ 'RFC.md': '# RFC\n\n## 3. Design\n\nNothing deferred here.\n' });
  const none = runCommand(GRILL_SCAN_DEFECTS, [quiet]);

  assert.equal(none.status, 0, 'no candidate is not a failure');

  const seeded = makePackage({
    'RFC.md': '# RFC\n\n## 3. Design\n',
    'RFC-SEED.md':
      '## 13. Deferred to implementation\n\nTrait method signatures are not defined at stage one.\n',
  });
  const some = runCommand(GRILL_SCAN_DEFECTS, [seeded]);

  assert.equal(some.status, 0, 'a candidate is the work, not a failure');
});

test('C005 postcondition: a §13 deferral of a trait signature is reported', () => {
  const dir = makePackage({
    'RFC.md': '# RFC\n\n## 3. Design\n',
    'RFC-SEED.md':
      '## 12. Open questions\n\n## 13. Deferred to implementation\n\n' +
      'Trait method signatures and the concrete I/O contract are not defined at stage one.\n',
  });

  const reported = JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [dir, '--json']).stdout);

  assert.ok(reported.length >= 1, 'the deferral is a candidate');
  assert.ok(
    reported.some((candidate) => /RFC-SEED\.md/.test(candidate.artifact)),
    'the artifact carrying the deferral is named',
  );
  assert.ok(
    reported.every((candidate) => typeof candidate.hint === 'string' && candidate.hint.length > 0),
    'every candidate carries a hint, because the script does not decide',
  );
});

test('C005 postcondition: a settled explanation resting on a chosen default is reported', () => {
  const dir = makePackage({
    'RFC.md': '# RFC\n\n## 3. Design\n',
    'EXPLAIN-RFC-SEED.md':
      '## Settled items\n\n- the scan range is inclusive\n  ground: chosen default, not fixed by the specification\n',
  });

  const reported = JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [dir, '--json']).stdout);

  assert.ok(
    reported.some((candidate) => /EXPLAIN-RFC-SEED\.md/.test(candidate.artifact)),
    'a default the seed admits it does not fix is not a ground',
  );
});

test('C005 postcondition: a seed assertion that the specification is silent is reported', () => {
  const dir = makePackage({
    'RFC.md': '# RFC\n\n## 3. Design\n',
    'RFC-SEED.md': '## 5. Boundary\n\nThe specification does not fix the scan range inclusivity.\n',
  });

  const reported = JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [dir, '--json']).stdout);

  assert.ok(
    reported.some((candidate) => /specification does not/i.test(candidate.says)),
    'the assertion is surfaced so the specification can be searched for a counterexample',
  );
});

test('C005 postcondition: an INFO seed older than a neighbour RFC is reported as a pair', () => {
  const root = mkdtempSync(join(tmpdir(), 'px239-scan-'));
  const stale = join(root, 'pkg');
  const neighbour = join(root, 'neighbour');
  mkdirSync(stale, { recursive: true });
  mkdirSync(neighbour, { recursive: true });

  writeFileSync(join(stale, 'RFC.md'), '# RFC\n\n## 3. Design\n', 'utf8');
  writeFileSync(
    join(stale, 'INFO-RFC-SEED.md'),
    '## 10. Neighbours\n\nNo neighbouring package has settled a question this package shares.\n',
    'utf8',
  );
  writeFileSync(join(neighbour, 'RFC.md'), '# RFC\n\n## 3.9.4 Atomic batch\n', 'utf8');

  const informationRecordPath = join(stale, 'INFO-RFC-SEED.md');
  const later = new Date(Date.now() + 60_000);
  utimesSync(informationRecordPath, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  utimesSync(join(neighbour, 'RFC.md'), later, later);

  const reported = JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [stale, '--json']).stdout);

  assert.ok(
    reported.some((candidate) => /INFO-RFC-SEED\.md/.test(candidate.artifact)),
    'a stage-one snapshot cannot see an upstream RFC published after it',
  );
});

test('C005 boundary: a name used but defined nowhere is reported', () => {
  const dir = makePackage({
    'RFC.md':
      '# RFC\n\n## 3. Design\n\nThe store returns a `ScanPage` and a `ScanLimit`.\n' +
      'The operation is `read_objects`.\n',
  });

  const reported = JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [dir, '--json']).stdout);

  assert.ok(
    reported.some((candidate) => /ScanPage|ScanLimit/.test(candidate.says)),
    'a name used and defined nowhere is the deficiency class',
  );
});

test('C005 precondition: a directory with no artifacts reports nothing and exits 0', () => {
  const empty = mkdtempSync(join(tmpdir(), 'px239-scan-'));
  const result = runCommand(GRILL_SCAN_DEFECTS, [empty]);

  assert.equal(result.status, 0);
  assert.equal(JSON.parse(runCommand(GRILL_SCAN_DEFECTS, [empty, '--json']).stdout).length, 0);
});
