// @verifies C001
// @verifies C002
// @verifies C003
/**
 * The build database through a published run.
 *
 * The unit suite pins the discovery and the mode in memory. This one pins that
 * they survive a run: that a subject carrying `compile_commands.json` publishes
 * the records, the two counters and the stronger mode it earned, that a subject
 * without one publishes the lowered mode and the named limitation **and is not
 * refused**, and that neither run moved the subject.
 *
 * The second of those is the one that matters most. Most C/C++ trees carry no
 * database, so the absent path is the common path, and a subject that cannot
 * supply its configuration is still a subject.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_DATABASE_LIMITATION_CODES, BUILD_DATABASE_MARKER } from '../../../.claude/scripts/workspacify-reverse/lib/build-database.mjs';
import { analyzeProject } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import { createSyntheticTree, hashTree } from '../helpers/scratch.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REPRESENTATIVE = join(PROJECT_ROOT, 'tests', 'workspacify-reverse', 'fixtures', 'languages', 'c_cpp');

/** The last stage these facts are published by. R0.5 fixes the scope, R1 the structure. */
const THROUGH_R1 = 'r1';

/** A throwaway directory to publish into, so no test writes into the project. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function scratchOutput() {
  const root = mkdtempSync(join(os.tmpdir(), 'wsp-p24-6-it-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** A C/C++ subject whose database names the two units its sources form. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function subjectWithDatabase() {
  return createSyntheticTree({
    'include/widget.h': 'int widget();\n',
    'src/widget.cpp': '#include "widget.h"\nint widget() { return 1; }\n',
    'src/widget_extra.cpp': 'int extra() { return 2; }\n',
    'compile_commands.json': JSON.stringify([
      { directory: '.', command: 'c++ -Iinclude -c src/widget.cpp', file: 'src/widget.cpp' },
      { directory: '.', command: 'c++ -Iinclude -c src/widget_extra.cpp', file: 'src/widget_extra.cpp' },
    ]),
  }, { prefix: 'wsp-p24-6-it-db-' });
}

/** A C/C++ subject that carries no database, which is the common case. */
// [::TICKET::] P24-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-6 --for-spec --no-implementation-order`.
function subjectWithoutDatabase() {
  return createSyntheticTree({
    'include/widget.h': 'int widget();\n',
    'src/widget.cpp': '#include "widget.h"\nint widget() { return 1; }\n',
  }, { prefix: 'wsp-p24-6-it-nodb-' });
}

test('IT: a run publishes the records, the counters and the mode each subject earned, and refuses neither', async () => {
  const cases = [
    { build: subjectWithDatabase, expectedMode: 'partial_semantic', found: true },
    { build: subjectWithoutDatabase, expectedMode: 'syntax_only', found: false },
  ];

  for (const { build, expectedMode, found } of cases) {
    const tree = build();
    const before = hashTree(tree.root);
    const out = scratchOutput();

    await analyzeProject({ root: tree.root, out: out.root, through: THROUGH_R1 });

    const structure = JSON.parse(readFileSync(join(out.root, 'STRUCTURE.json'), 'utf8'));
    assert.equal(structure.analysis_mode, expectedMode, 'the run reports the mode it earned');

    if (found) {
      assert.equal(structure.coverage.configs_analyzed > 0, true, 'the configuration was used, not merely noted');
      assert.notEqual(structure.coverage.configs_enumerated, structure.coverage.configs_analyzed);
    } else {
      assert.equal(
        structure.limitations.some((entry) => entry.code === BUILD_DATABASE_LIMITATION_CODES.absent),
        true,
        'the absence is stated rather than degraded into silence',
      );
      assert.equal(structure.coverage.configs_analyzed, 0);
    }

    const scope = JSON.parse(readFileSync(join(out.root, 'ANALYSIS-SCOPE.json'), 'utf8'));
    assert.equal(typeof scope.buildDatabase.found, 'boolean', 'the scope document carries the database’s presence');
    assert.equal(scope.buildDatabase.found, found);
    assert.equal(Array.isArray(scope.buildDatabase.names), true);
    assert.equal(
      scope.buildDatabase.names.includes(BUILD_DATABASE_MARKER),
      true,
      'the names searched are published, not implied',
    );
    assert.equal(typeof scope.buildDatabase.translationUnitCount, 'number');
    assert.equal(
      Array.isArray(scope.buildDatabase.unusable),
      true,
      'an entry the run could not use is published by path, not held only in the record',
    );

    assert.deepEqual(hashTree(tree.root), before, 'the subject is byte-identical after the run');
    out.dispose();
    tree.dispose();
  }
});

test('IT: the C/C++ representative carries no database and is still analysed, with the boundary named', async () => {
  const before = hashTree(REPRESENTATIVE);
  const out = scratchOutput();

  await analyzeProject({ root: REPRESENTATIVE, out: out.root, through: THROUGH_R1 });

  const structure = JSON.parse(readFileSync(join(out.root, 'STRUCTURE.json'), 'utf8'));
  assert.equal(structure.analysis_mode, 'syntax_only', 'the frozen subject carries no build database');
  assert.equal(
    structure.limitations.some((entry) => entry.code === BUILD_DATABASE_LIMITATION_CODES.absent),
    true,
  );
  assert.equal(structure.publicItems.length > 0, true, 'the subject is reported, not refused');

  assert.deepEqual(hashTree(REPRESENTATIVE), before, 'the representative is frozen bytes');
  out.dispose();
});
