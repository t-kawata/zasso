// @verifies C002
// @verifies C003
// @verifies C004
/**
 * The reverse rotation's decisions document, and the destination between rounds.
 *
 * Two behaviours this ticket adds are destructive if they are wrong, and both are
 * driven here rather than through the entrance, so each is seen to fail for its own
 * reason rather than for the reason the entrance happened to fail:
 *
 *   - the six judgement items the procedure's Step 5 must leave behind, read and
 *     reported by name rather than thrown on, so all six are named at once;
 *   - the replacement of the destination, which removes a subtree beneath a
 *     reserved root shared with two other rotations.
 *
 * The second is why the sibling test exists at all: `workspacify/` holds the tree
 * rotation's and the allocate rotation's decisions documents, and a clearing that
 * reached them would delete another command's staged input.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DECISIONS_MATERIAL,
  JUDGEMENT_ITEMS,
  assertReverseDecisionsSchema,
  findSchemaViolations,
  readReverseDecisions,
  renderDecisionsAdvice,
  renderDecisionsVerdict,
  verifyReverseDecisions,
} from '../../../.claude/scripts/workspacify-reverse/lib/reverse-decisions.mjs';
import { replacePublishedDocuments } from '../../../.claude/scripts/workspacify-reverse/lib/scope.mjs';
import {
  RESERVED_DECISIONS_FILE_NAME,
  RESERVED_REVERSE_SUBDIRECTORY,
  RESERVED_ROOT_NAME,
  RESERVED_TREE_SUBDIRECTORY,
  reservedReverseDecisionsPath,
} from '../../../.claude/scripts/workspacify-tree/lib/reserved-root.mjs';
import { sectionText } from '../helpers/command-file.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const COMMAND_PATH = join(PROJECT_ROOT, '.claude/commands/workspacify-reverse.md');
const TEXT = readFileSync(COMMAND_PATH, 'utf8');

/** The path a gate failure is reported against, spelled as the reserved root derives it. */
const DECISIONS_PATH = join('/tmp/subject', RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);

/** A throwaway directory, so nothing here writes into the project or a subject. */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function scratchDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'wsp-reverse-decisions-'));
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

/** Every judgement item, answered. The fixture a complete document is built from. */
// [::TICKET::] P26-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-2 --for-spec --no-implementation-order`.
function completeDecisions() {
  return {
    package_boundary: { packages: [{ path: '.', name: 'root' }], rationale: 'the measured layout, not the prior' },
    owner_assignment: [{ package: '.', owns: ['src/api/login.rs'] }],
    layer_estimation: [{ package: '.', layer: 'application' }],
    contract_meaning: [{ contract: 'login rejects an empty name', meaning: 'a precondition, not an error path' }],
    over_splitting: { decision: 'not split', rationale: 'one boundary crossing does not make a package' },
    proposition_classification: [{ claim: 'the surface is 12 functions', class: 'observed' }],
  };
}

// --- C004: the path is derived from the subject ------------------------------

test('C004 precondition: the decisions path is derived from the subject and is not selectable', () => {
  assert.equal(
    reservedReverseDecisionsPath('/tmp/subject'),
    join('/tmp/subject', RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME),
  );
  assert.notEqual(
    reservedReverseDecisionsPath('/tmp/subject'),
    join('/tmp/subject', RESERVED_ROOT_NAME, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME),
    'the reverse rotation reads its own document, not the tree rotation’s',
  );
});

// --- C004: the six items are read, not thrown on -----------------------------

test('C004/UT: a complete document is reported as recorded and validates against the schema', () => {
  const scratch = scratchDirectory();
  try {
    const path = join(scratch.root, RESERVED_DECISIONS_FILE_NAME);
    writeFileSync(path, `${JSON.stringify(completeDecisions(), null, 2)}\n`);

    const { decisions, findings } = readReverseDecisions(path);
    assert.deepEqual(findings, [], 'every item is answered, so nothing is reported');
    assert.deepEqual(assertReverseDecisionsSchema(decisions), { ok: true, errors: [] });

    const verdict = renderDecisionsVerdict({ path });
    for (const item of JUDGEMENT_ITEMS) {
      assert.ok(verdict.includes(item.label), `the verdict states ${item.label} is recorded`);
    }
  } finally {
    scratch.dispose();
  }
});

test('C004/UT: an unreadable document is reported by path rather than thrown', () => {
  const scratch = scratchDirectory();
  try {
    const { decisions, findings } = readReverseDecisions(join(scratch.root, 'absent.json'));
    assert.equal(decisions, null, 'an unreadable document yields no decisions');
    assert.deepEqual(findings.map((finding) => finding.kind), ['unreadable-decisions']);
    assert.match(findings[0].detail, /absent\.json/, 'the report names the file it could not read');
  } finally {
    scratch.dispose();
  }
});

test('C004/UT: a document that is present but unparseable is its own finding, not an absence', () => {
  const scratch = scratchDirectory();
  try {
    const path = join(scratch.root, RESERVED_DECISIONS_FILE_NAME);
    writeFileSync(path, '{ not json\n');

    const { decisions, findings } = readReverseDecisions(path);
    assert.equal(decisions, null);
    assert.deepEqual(
      findings.map((finding) => finding.kind),
      ['unparseable-decisions'],
      'a broken document is present, which is a different fact from absent',
    );
  } finally {
    scratch.dispose();
  }
});

// --- C002: a failing gate names what, what to do, and where to go back -------

test('C002/UT: an unanswered item is reported by name, with the Step that must supply it', () => {
  const decisions = completeDecisions();
  delete decisions.layer_estimation;
  delete decisions.proposition_classification;

  const findings = verifyReverseDecisions({ decisions, present: DECISIONS_MATERIAL });
  assert.deepEqual(
    findings.map((finding) => finding.item).filter(Boolean).sort(),
    ['layer_estimation', 'proposition_classification'],
    'every unanswered item is reported, not only the first',
  );

  const advice = renderDecisionsAdvice(findings, { path: '/tmp/subject/workspacify/reverse/DECISIONS.json' });
  assert.match(advice, /layer estimation/, 'the advice names the item in words a reader uses');
  assert.match(advice, /## Step 5: decide the partition/, 'and the Step to return to');
  assert.match(advice, /fix|write/i, 'and says what to do');
  assert.doesNotMatch(advice, /\n\s+at\s/, 'a stack frame is not an instruction');
  assert.doesNotMatch(advice, /\?$/, 'a question is not an instruction');
});

test('C002/UT: a document that answers a different six is not accepted as this six', () => {
  const decisions = completeDecisions();
  decisions.some_other_decision = { answer: 'yes' };

  assert.equal(
    assertReverseDecisionsSchema(decisions).ok,
    false,
    'an unknown key is a document that answers a question nobody asked',
  );
  assert.deepEqual(
    verifyReverseDecisions({ decisions, present: DECISIONS_MATERIAL }),
    [],
    'and it is the schema, not the item list, that reports it: six answers are present',
  );

  const advice = renderDecisionsAdvice(findSchemaViolations(decisions), { path: DECISIONS_PATH });
  assert.match(advice, /some_other_decision/, 'the advice names the key that is not licensed');
  assert.match(advice, /## Step 5: decide the partition/, 'and the Step to return to');
});

test('C002 boundary: material that was never published outranks an unanswered item', () => {
  // A decision cannot be made from material the run never produced, so the earlier
  // failure is the one to go back for. Sending the reader to Step 5 to answer questions
  // whose material is absent would have them decide without it.
  const decisions = completeDecisions();
  delete decisions.layer_estimation;
  const findings = verifyReverseDecisions({ decisions, present: [] });
  const advice = renderDecisionsAdvice(findings, { path: DECISIONS_PATH });

  assert.match(advice, /## Step 2: fix the boundary and the scope/, 'the entrance is the return Step');
  assert.match(advice, /layer estimation/, 'and the unanswered item is still named');
});

// --- C002 invariant: the six come from one declaration -----------------------

test('C002 invariant: the schema names exactly the six the command file enumerates', () => {
  const enumerated = sectionText(TEXT, '## What the machine decides, and what you decide')
    .split('\n')
    .filter((line) => /^\s*\d+\. /.test(line))
    .map((line) => line.replace(/[`*]/g, '').trim());

  assert.equal(JUDGEMENT_ITEMS.length, 6, 'the design licenses exactly six');
  for (const item of JUDGEMENT_ITEMS) {
    assert.ok(
      enumerated.some((line) => line.includes(item.token)),
      `the file must enumerate ${item.label}, and no line carries "${item.token}"`,
    );
  }
});

// --- C003: the destination between rounds ------------------------------------

test('C003/UT: the destination holds exactly what the run published', () => {
  const scratch = scratchDirectory();
  try {
    const out = join(scratch.root, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY);
    mkdirSync(out, { recursive: true });
    // The document a previous round published and this one may not produce: the
    // four `publishWhenPresent` documents are conditional, so this is reachable.
    writeFileSync(join(out, 'R7-ADJUDICATION.md'), 'a previous round’s document\n');
    writeFileSync(join(out, 'ANALYSIS-SCOPE.json'), '{"stale":true}\n');

    replacePublishedDocuments(out, { 'ANALYSIS-SCOPE.json': { run: 'this one' } });

    assert.deepEqual(
      readdirSync(out).sort(),
      ['ANALYSIS-SCOPE.json'],
      'a document this run did not produce is absent afterwards',
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(out, 'ANALYSIS-SCOPE.json'), 'utf8')),
      { run: 'this one' },
      'and the documents it did produce are the ones it wrote',
    );
  } finally {
    scratch.dispose();
  }
});

test('C003 invariant: the clearing is scoped to the reverse directory alone', () => {
  const scratch = scratchDirectory();
  try {
    const reserve = join(scratch.root, RESERVED_ROOT_NAME);
    const treeDecisions = join(reserve, RESERVED_TREE_SUBDIRECTORY, RESERVED_DECISIONS_FILE_NAME);
    const allocateDecisions = join(reserve, 'allocate', RESERVED_DECISIONS_FILE_NAME);
    const out = join(reserve, RESERVED_REVERSE_SUBDIRECTORY);
    for (const path of [treeDecisions, allocateDecisions]) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, '{"workspace":[]}\n');
    }
    mkdirSync(out, { recursive: true });

    replacePublishedDocuments(out, {});

    assert.equal(readFileSync(treeDecisions, 'utf8'), '{"workspace":[]}\n', 'the tree rotation’s decisions are untouched');
    assert.equal(readFileSync(allocateDecisions, 'utf8'), '{"workspace":[]}\n', 'and so are the allocate rotation’s');
  } finally {
    scratch.dispose();
  }
});

test('C003 boundary: a destination that does not exist yet is created rather than refused', () => {
  const scratch = scratchDirectory();
  try {
    const out = join(scratch.root, RESERVED_ROOT_NAME, RESERVED_REVERSE_SUBDIRECTORY);
    replacePublishedDocuments(out, { 'R0-R2-REPORT.md': '# report\n' });
    assert.equal(readFileSync(join(out, 'R0-R2-REPORT.md'), 'utf8'), '# report\n');
  } finally {
    scratch.dispose();
  }
});
