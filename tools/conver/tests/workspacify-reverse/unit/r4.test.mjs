// @verifies C001
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
// R4 reconstructs history and decision provenance from git, and refuses to read a
// commit message as proof of intent while doing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_CAVEAT,
  HISTORY_QUALITY_FACTORS,
  TRANSITION_KINDS,
  reconstructHistory,
  renderHistoryRecord,
} from '../../../.claude/scripts/workspacify-reverse/lib/history.mjs';
import { createGitBackedTree, createNonRepositoryTree, GIT_ENV, runGit, commitAll } from '../helpers/scratch.mjs';

const FIXTURE_FILES = Object.freeze({
  'Cargo.toml': '[package]\nname = "history-fixture"\nversion = "0.1.0"\n',
  'src/lib.rs': 'pub fn parse() -> u32 {\n    1\n}\n',
});

/** A history exercising a co-change group and a commit that weighed an alternative. */
const FIXTURE_COMMITS = Object.freeze([
  {
    files: { 'src/api.rs': 'pub fn handle() -> u32 {\n    2\n}\n' },
    message: 'add the api module',
  },
  {
    files: { 'tests/api_test.rs': 'use history_fixture::api;\n\n#[test]\nfn handles() {}\n' },
    message: 'add the api test, considered a guard instead of the default',
  },
]);

/** Materialise the fixture repository and hand it to `body`, disposing afterwards. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function withHistoryRepository(body) {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: [] });
  try {
    return body(root);
  } finally {
    dispose();
  }
}

// --- C001 precondition: git history exists for the target ----------------------

test('C001 precondition: a git-backed target yields a repository identity and a commit', () => {
  withHistoryRepository((root) => {
    const history = reconstructHistory(root, { paths: ['src/lib.rs'] });

    assert.equal(history.isRepository, true);
    assert.equal(typeof history.commit, 'string');
    assert.equal(history.commit.length, 40, 'the commit is the full object name, not an abbreviation');
    assert.ok(history.commitCount >= 1);
  });
});

// --- C001 postcondition --------------------------------------------------------

test('UT-1: reconstructHistory records transitions, co-changes, decision provenance and history quality', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: FIXTURE_COMMITS });
  try {
    runGit(root, ['mv', 'src/api.rs', 'src/handler.rs']);
    commitAll(root, 'move the api module to handler');
    runGit(root, ['rm', 'tests/api_test.rs']);
    commitAll(root, 'delete the superseded api test');

    const history = reconstructHistory(root, {
      paths: ['Cargo.toml', 'src/lib.rs', 'src/handler.rs', 'tests/api_test.rs'],
    });

    // Every transition names the commit that caused it and the file it landed on.
    assert.ok(history.transitions.length > 0, 'a history with moves and deletions records transitions');
    for (const transition of history.transitions) {
      assert.ok(TRANSITION_KINDS.includes(transition.kind), `unexpected transition kind: ${transition.kind}`);
      assert.equal(typeof transition.file, 'string');
      assert.equal(typeof transition.commit, 'string');
      assert.ok(Number.isInteger(transition.line) && transition.line > 0);
    }
    const kinds = new Set(history.transitions.map((transition) => transition.kind));
    assert.ok(kinds.has('created'), 'the initial import created files');
    assert.ok(kinds.has('moved'), 'the rename is a move, not a delete plus a create');
    assert.ok(kinds.has('deleted'), 'the removal is recorded');

    // A move keeps both ends of the rename, so the lineage is not lost.
    const moved = history.transitions.find((transition) => transition.kind === 'moved');
    assert.equal(typeof moved.from, 'string');
    assert.notEqual(moved.from, moved.file);

    // Co-changes are logical coupling: which files moved together, under which commits.
    assert.ok(history.coChanges.length > 0, 'files committed together are recorded as coupled');
    for (const group of history.coChanges) {
      assert.ok(Array.isArray(group.files) && group.files.length > 1);
      assert.ok(Array.isArray(group.commits) && group.commits.length > 0);
      assert.ok(Number.isInteger(group.count) && group.count > 0);
    }

    // Decision provenance exists and anchors at a commit and a location.
    assert.ok(Array.isArray(history.decisionProvenance));
    assert.ok(history.decisionProvenance.length > 0);
    for (const decision of history.decisionProvenance) {
      assert.equal(typeof decision.commit, 'string');
      assert.equal(typeof decision.file, 'string');
      assert.ok(Number.isInteger(decision.line) && decision.line > 0);
    }

    // History quality is a profile plus the factors that produced it.
    assert.equal(typeof history.historyQuality.profile, 'string');
    assert.ok(Array.isArray(history.historyQuality.factors));
    for (const factor of history.historyQuality.factors) {
      assert.ok(HISTORY_QUALITY_FACTORS.includes(factor.factor), `unknown quality factor: ${factor.factor}`);
      assert.equal(typeof factor.effect, 'string');
    }
    // The two counts are different questions and must not be collapsed: the
    // repository holds commits that say nothing about the analysed population.
    assert.ok(Number.isInteger(history.historyQuality.commitsInScope));
    assert.ok(history.historyQuality.commitsInScope > 0);
    assert.ok(history.historyQuality.commitsInScope <= history.commitCount);
  } finally {
    dispose();
  }
});

test('UT-1: a co-change group names the commit that coupled the files, not a message', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['Cargo.toml', 'src/lib.rs'] });

    const group = history.coChanges.find((entry) => entry.files.includes('Cargo.toml'));
    assert.ok(group, 'the initial import coupled the manifest and the library root');
    assert.ok(group.files.includes('src/lib.rs'));
    assert.equal(group.count, 1);
    assert.equal(typeof group.commits[0], 'string');
    assert.equal(group.commits[0].length, 40);
  } finally {
    dispose();
  }
});

// --- C001 invariant: a commit message is never proof of design intent ----------

test('UT-1: a commit of pure modifications is not dropped from the reading', () => {
  // `modified` is not a transition a reader can act on, but it must still be
  // parsed: a commit made only of modifications would otherwise have no changes,
  // be dropped entirely, and take its co-changes, its provenance anchor and its
  // place in the commit count with it.
  const { root, dispose } = createGitBackedTree(
    { 'src/a.rs': 'fn a() {}\n', 'src/b.rs': 'fn b() {}\n' },
    { commits: [{ files: { 'src/a.rs': 'fn a() { /* x */ }\n', 'src/b.rs': 'fn b() { /* x */ }\n' }, message: 'modify both together' }] },
  );
  try {
    const history = reconstructHistory(root, { paths: ['src/a.rs', 'src/b.rs'] });

    assert.equal(history.commitCount, 2);
    assert.equal(history.historyQuality.commitsInScope, 2, 'the modification commit is a commit');
    // The provenance anchor is the newest commit that touched the file, not the
    // one that created it.
    assert.deepEqual(
      [...new Set(history.decisionProvenance.map((entry) => entry.subject))],
      ['modify both together'],
    );
    // Both commits coupled the pair, so the coupling has two commits behind it.
    const group = history.coChanges.find((entry) => entry.files.includes('src/a.rs'));
    assert.equal(group.count, 2);
    // A modification is still not a transition.
    assert.ok(history.transitions.every((transition) => TRANSITION_KINDS.includes(transition.kind)));
    assert.equal(history.transitions.filter((transition) => transition.kind === 'created').length, 2);
  } finally {
    dispose();
  }
});

test('UT-1: a path git would quote is read as the path it names', () => {
  // git escapes non-ASCII bytes unless `core.quotepath` is off, and a quoted
  // path does not match the population — the commit is mis-read silently,
  // because the escaped string is still a well-formed path line.
  const { root, dispose } = createGitBackedTree({ 'src/café.rs': 'fn c() {}\n', 'src/plain.rs': 'fn p() {}\n' }, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['src/café.rs', 'src/plain.rs'] });

    assert.deepEqual(history.transitions.map((transition) => transition.file).sort(), ['src/café.rs', 'src/plain.rs']);
    assert.equal(history.coChanges.length, 1, 'the co-change pair survives the non-ASCII member');
  } finally {
    dispose();
  }
});

test('UT-1: two co-change pairs whose names need a separator to tell apart are not merged', () => {
  // A key built by joining two paths with a character merges `["a", "b c"]` with
  // `["a b", "c"]` whenever a path contains that character.
  const { root, dispose } = createGitBackedTree({ a: '', 'b c': '', 'a b': '', c: '' }, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['a', 'b c', 'a b', 'c'] });

    const pairs = history.coChanges.map((entry) => entry.files.join(' + ')).sort();
    assert.equal(pairs.length, 6, 'four files that moved together make six distinct pairs');
    assert.ok(pairs.includes('a + b c'));
    assert.ok(pairs.includes('a b + c'));
    assert.ok(history.coChanges.every((entry) => entry.count === 1));
  } finally {
    dispose();
  }
});

test('UT-1: the mass-change signal is measured over the commit, not over the population', () => {
  // A vendored path is out of scope by construction, so a signal counting only
  // the in-scope changes could never observe vendoring at all.
  const wide = {};
  for (let index = 0; index < 250; index += 1) wide[`vendor/crate_${index}.rs`] = '// vendored\n';
  wide['src/lib.rs'] = 'pub fn f() {}\n';

  const { root, dispose } = createGitBackedTree(wide, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['src/lib.rs'] });

    const vendoring = history.historyQuality.factors.find((factor) => factor.factor === 'vendoring');
    const mass = history.historyQuality.factors.find((factor) => factor.factor === 'mass_reformat');
    assert.ok(vendoring, 'a commit that is almost entirely vendored is a vendoring commit');
    assert.ok(mass, 'a commit this wide is a mass change whatever the population is');
    assert.equal(history.historyQuality.profile, 'contaminated');
  } finally {
    dispose();
  }
});

test('UT-10: a commit message is never emitted as proof of intent — the output carries an explicit caveat', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: FIXTURE_COMMITS });
  try {
    const history = reconstructHistory(root, { paths: ['src/lib.rs', 'src/handler.rs'] });

    assert.equal(history.caveat, HISTORY_CAVEAT);
    assert.match(history.caveat, /not proof of design intent/i);

    // Every provenance item is a candidate that names its own undecided question.
    for (const decision of history.decisionProvenance) {
      assert.equal(decision.classification, 'candidate');
      assert.equal(decision.requires_human_approval, true);
      assert.equal(typeof decision.undecided, 'string');
      assert.ok(decision.undecided.length > 0, 'a candidate that cannot say what is undecided is not a candidate');
    }

    // The message is carried as evidence about what changed; the record says so.
    const withSubject = history.decisionProvenance.find((decision) => decision.subject.length > 0);
    assert.ok(withSubject, 'a commit subject is retained as evidence');
    assert.equal(withSubject.subject_is_proof_of_intent, false);
  } finally {
    dispose();
  }
});

test('UT-10: an alternative the commit mentions is recorded as considered, never as rejected design', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: FIXTURE_COMMITS });
  try {
    const history = reconstructHistory(root, { paths: ['tests/api_test.rs'] });

    const decision = history.decisionProvenance.find((entry) => entry.alternatives.length > 0);
    assert.ok(decision, 'the commit that said "considered a guard instead of the default" is recorded');
    assert.match(decision.alternatives.join(' '), /instead of/i);
    assert.equal(decision.alternatives_are_candidates, true);
  } finally {
    dispose();
  }
});

// --- C001 error cases ----------------------------------------------------------

test('UT-4: a tree that is not a repository is reported as having no history, not as a clean result', () => {
  const { root, dispose } = createNonRepositoryTree(FIXTURE_FILES);
  try {
    const history = reconstructHistory(root, { paths: ['src/lib.rs'] });

    assert.equal(history.isRepository, false);
    assert.equal(history.commit, null);
    assert.equal(history.commitCount, 0);
    assert.equal(history.transitions.length, 0);
    assert.equal(history.coChanges.length, 0);
    assert.equal(history.decisionProvenance.length, 0);

    // The distinction that matters: absent history is never reported as clean history.
    assert.notEqual(history.historyQuality.profile, 'clean');
    assert.equal(history.historyQuality.profile, 'absent');
    assert.equal(history.caveat, HISTORY_CAVEAT);
    assert.ok(history.unavailable.length > 0, 'a missing history says so in a field rather than by staying empty');
    assert.match(history.unavailable.join(' '), /not a git repository/i);
  } finally {
    dispose();
  }
});

test('UT-4: a repository with no commits is reported as an empty history, not as a clean result', () => {
  // An initialised repository with nothing committed: the working tree holds files,
  // but no commit has ever recorded them, so there is genuinely no history.
  const { root, dispose } = createGitBackedTree({}, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['src/lib.rs'] });

    assert.equal(history.isRepository, true);
    assert.equal(history.commitCount, 0);
    assert.equal(history.commit, null);
    assert.notEqual(history.historyQuality.profile, 'clean');
    assert.equal(history.historyQuality.profile, 'empty');
    assert.ok(history.unavailable.length > 0);
    assert.match(history.unavailable.join(' '), /no commits/i);
  } finally {
    dispose();
  }
});

test('UT-5: an unreadable commit is reported with its hash rather than dropped', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: FIXTURE_COMMITS });
  try {
    const corruptHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
    // The seam exists so that a defective object store can be described without
    // corrupting one: what is under test is this module's reading of git's
    // complaint, not git's ability to produce it.
    const readLog = () => ({
      ok: false,
      stdout: '',
      stderr: `fatal: bad object ${corruptHash}\nfatal: could not read commit object\n`,
    });

    const history = reconstructHistory(root, { paths: ['src/lib.rs'], readLog });

    assert.ok(history.unreadableCommits.length > 0, 'an unreadable commit is recorded');
    assert.equal(history.unreadableCommits[0].hash, corruptHash);
    assert.equal(typeof history.unreadableCommits[0].reason, 'string');
    assert.notEqual(history.historyQuality.profile, 'clean');
    assert.ok(
      history.unavailable.some((reason) => reason.includes(corruptHash)),
      'the unavailable channel names the hash it could not read',
    );
  } finally {
    dispose();
  }
});

// --- C001 boundary cases -------------------------------------------------------

test('UT-8: a single-commit repository is analysable', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['Cargo.toml', 'src/lib.rs'] });

    assert.equal(history.commitCount, 1);
    assert.equal(typeof history.commit, 'string');
    assert.equal(history.transitions.filter((transition) => transition.kind === 'created').length, 2);
    assert.equal(history.coChanges.length, 1, 'one commit coupling two files is one group');
    assert.ok(history.decisionProvenance.length > 0, 'the single commit still carries provenance');
    assert.equal(history.caveat, HISTORY_CAVEAT);
  } finally {
    dispose();
  }
});

test('UT-1: a population that arrived in one commit is reported as a collapsed history', () => {
  // The structural half of the squash signal. A corpus imported as one commit
  // carries no message saying "squashed", so a detector reading only messages
  // would call a history that cannot answer "how did this come to be" clean.
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: [] });
  try {
    const history = reconstructHistory(root, { paths: ['Cargo.toml', 'src/lib.rs'] });

    assert.equal(history.historyQuality.commitsInScope, 1);
    assert.equal(history.historyQuality.profile, 'contaminated');
    const squash = history.historyQuality.factors.find((factor) => factor.factor === 'squash');
    assert.ok(squash, 'a one-commit history is a collapsed history');
    assert.match(squash.evidence, /never recorded/);
    assert.notEqual(history.historyQuality.confidence, 'high');
    // The confidence the provenance entries carry is lowered with it.
    assert.ok(history.decisionProvenance.every((entry) => entry.confidence !== 'high'));
  } finally {
    dispose();
  }
});

test('C001 boundary: a history that is missing is never summarised as high confidence', () => {
  const { root, dispose } = createNonRepositoryTree(FIXTURE_FILES);
  try {
    const history = reconstructHistory(root, { paths: ['src/lib.rs'] });

    assert.equal(history.historyQuality.confidence, 'none');
    assert.equal(renderHistoryRecord(history).includes('no history'), true);
  } finally {
    dispose();
  }
});

// --- The Markdown a reader consumes --------------------------------------------

test('the history record is Markdown a reader can read, and it carries the caveat in the text', () => {
  const { root, dispose } = createGitBackedTree(FIXTURE_FILES, { commits: FIXTURE_COMMITS });
  try {
    const markdown = renderHistoryRecord(reconstructHistory(root, { paths: ['src/lib.rs'] }));

    assert.equal(typeof markdown, 'string');
    assert.match(markdown, /^## History and decision provenance/m);
    assert.ok(markdown.includes(HISTORY_CAVEAT), 'the caveat travels with the report rather than beside it');
  } finally {
    dispose();
  }
});

test('the environment a test-run git command uses is fixed, not inherited', () => {
  // The helper exists so that no R4 test depends on the operator's git config.
  assert.equal(GIT_ENV.GIT_COMMITTER_EMAIL, 'test@example.invalid');
  assert.equal(GIT_ENV.GIT_CONFIG_GLOBAL, '/dev/null');
});
