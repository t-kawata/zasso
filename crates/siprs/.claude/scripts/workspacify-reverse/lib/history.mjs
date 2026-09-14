// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
/**
 * R4 — the archaeology of intent.
 *
 * History answers two questions and refuses a third. It says what changed, and
 * what changed together. It does not say why: a commit message is a record a
 * developer wrote for a reviewer, not a design document, and reading one as
 * proof of intent is the mistake this module is shaped to prevent. Every
 * provenance entry is therefore a candidate carrying the question a human still
 * has to answer, and the caveat travels as a field rather than as a sentence a
 * later report format could drop.
 *
 * The reading is one `git log` pass, not one per file. The subject corpus holds
 * 934 commits, and a process per file would make R4 the slowest stage by orders
 * of magnitude while returning nothing the single pass does not already carry.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative } from 'node:path';

import { compareText } from './holdout-ledger.mjs';

/**
 * The claim history evidence is allowed to make about intent.
 *
 * It is a constant rather than a sentence built per run because a caveat that
 * varies with the data invites reading it as a finding rather than as the
 * standing limitation of the method.
 */
export const HISTORY_CAVEAT =
  'A commit records what changed, never why. It is not proof of design intent. Co-change is evidence '
  + 'that two artefacts are not independent; it is never evidence that they are. Every provenance '
  + 'entry below is a candidate for a human to decide, and the message that carries it is evidence '
  + 'about the change, never about the reason for it.';

/** What lowers the confidence of history evidence, per the design's `history_quality_profile`. */
export const HISTORY_QUALITY_FACTORS = Object.freeze([
  'squash',
  'mass_reformat',
  'vendoring',
  'port',
  'private_conversation',
]);

/**
 * The whole-file transitions the design names.
 *
 * A plain modification is deliberately absent. "The file changed" is not a
 * transition a reader can act on; creation, movement and deletion are the three
 * that change where a thing lives.
 */
export const TRANSITION_KINDS = Object.freeze(['created', 'moved', 'deleted']);

/** The profiles a history can carry, including the three that are not a clean read. */
export const HISTORY_PROFILES = Object.freeze(['clean', 'contaminated', 'empty', 'absent', 'unreadable']);

/** The confidence a proposition resting on this history may claim. */
export const HISTORY_CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'none']);

/** The question every provenance candidate leaves open. */
export const UNDECIDED_DECISION_QUESTION =
  'whether the change was made deliberately, and whether the reason for it survives in the current '
  + 'design — the commit says what changed, and a human has to say whether it still holds';

/**
 * The separators the log is read with, spelled as character codes rather than as
 * the bytes they name. A literal control character would make this file binary to
 * grep and to `file`, which is how a reader loses the ability to search it.
 *
 * ASCII record and unit separators were chosen because no commit subject can
 * contain them: a separator that could appear in a message would allow a line of
 * prose to be read as a file name.
 */
const ASCII_RECORD_SEPARATOR = 30;
const ASCII_UNIT_SEPARATOR = 31;
const RECORD_SEPARATOR = String.fromCharCode(ASCII_RECORD_SEPARATOR);
const UNIT_SEPARATOR = String.fromCharCode(ASCII_UNIT_SEPARATOR);

/**
 * Every change git names, including the plain modification.
 *
 * `modified` is not one of `TRANSITION_KINDS` — a reader cannot act on "the file
 * changed" — but it must still be *parsed*. The log is requested with
 * `--diff-filter=ADMR` and would otherwise hand back an `M` line the map does
 * not know, which `parseHistoryLog` skips; a commit made only of modifications
 * would then have no changes at all and be dropped, taking its co-changes, its
 * provenance anchor and its place in the commit count with it.
 */
const CHANGE_KIND_BY_STATUS_LETTER = Object.freeze({
  A: 'created',
  D: 'deleted',
  R: 'moved',
  M: 'modified',
});

/** A commit touching this many files is a mass change, and pairing its files says nothing. */
const MASS_CHANGE_FILE_THRESHOLD = 200;

/** A commit whose changed paths are mostly vendored is vendoring, not development. */
const VENDORED_PATH_PREFIX = 'vendor/';
const VENDORED_PATH_SHARE = 0.5;

/** How many commit hashes and subjects a quality factor keeps as its evidence. */
const QUALITY_EVIDENCE_LIMIT = 20;

/**
 * A history this shallow has collapsed the steps between its states.
 *
 * This is the structural half of the squash signal, and it is the half that
 * matters most in practice. A corpus imported as one commit carries no message
 * saying "squashed" — the message describes the import, not the collapse — so a
 * detector reading only messages would report a history that cannot answer "how
 * did this come to be" as clean.
 */
const SHALLOW_HISTORY_COMMIT_LIMIT = 1;

const MASS_CHANGE_EFFECT =
  'a commit this wide is a bulk operation rather than a design step, so co-change among its files '
  + 'records the tool that ran, not a coupling a reader should trust';

const VENDORING_EFFECT =
  'vendored code is copied rather than designed, so its history describes an upstream release and '
  + 'not a decision taken here';

/**
 * The signals a commit message offers about the quality of its own history.
 *
 * These read the message to judge the *history*, which is the opposite of
 * reading it to judge the *design*. A message saying "squashed" is evidence
 * that intermediate commits were destroyed; it is never evidence about what the
 * code was meant to do.
 */
const QUALITY_SIGNALS = Object.freeze([
  Object.freeze({
    factor: 'squash',
    pattern: /\bsquash(ed|ing)?\b/i,
    effect: 'intermediate commits were collapsed, so the steps between two states are not recoverable',
  }),
  Object.freeze({
    factor: 'mass_reformat',
    pattern: /\b(rustfmt|reformat|reformatting|clippy|prettier|whitespace-only)\b/i,
    effect: 'a formatting pass rewrote lines it did not otherwise change, so blame points at the formatter',
  }),
  Object.freeze({
    factor: 'vendoring',
    pattern: /\b(vendor(ed|ing)?|third[- ]party|dependency bump|deps?:? (bump|upgrade))\b/i,
    effect: 'the change originated upstream, so its history describes someone else\'s decision',
  }),
  Object.freeze({
    factor: 'port',
    pattern: /\b(port(ed|ing)?|migrat(e|ed|ion)|re-?writ(e|ten))\b/i,
    effect: 'the code was carried over from elsewhere, so its history starts after the decision was made',
  }),
  Object.freeze({
    factor: 'private_conversation',
    pattern: /\b(as discussed|per our (conversation|call)|offline|out of band)\b/i,
    effect: 'the reasoning was recorded somewhere this analysis cannot read, so the message is a pointer rather than a reason',
  }),
]);

/** A clause of a commit subject that names an option the author did not take. */
const ALTERNATIVE_PATTERN = /\b(instead of|rather than|considered|rejected|alternative|as opposed to)\b/i;

/** The clause boundaries a commit subject is divided along before alternatives are looked for. */
const CLAUSE_SEPARATOR = /[,;]|\band\b/;

/**
 * Run the one history query R4 needs, reporting failure rather than raising it.
 *
 * Exposed as a seam for the same reason the grammar is: how this module reads a
 * defective object store is a behaviour worth testing, and a test that had to
 * corrupt a real repository to reach it would be testing git rather than this
 * module.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function readHistoryLog(root) {
  const format = `${RECORD_SEPARATOR}%H${UNIT_SEPARATOR}%P${UNIT_SEPARATOR}%s`;
  const result = spawnSync(
    'git',
    // `core.quotepath=false` stops git from escaping non-ASCII bytes in a path.
    // Without it a Japanese or accented filename arrives as an octal escape, does
    // not match the population, and the commit that touched it is mis-read —
    // silently, because the quoted string is still a well-formed path line.
    ['-c', 'core.quotepath=false', 'log', '--name-status', '--diff-filter=ADMR', `--format=${format}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) return { ok: false, stdout: '', stderr: result.error.message };
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * A path as git wrote it, with git's C-style quoting undone.
 *
 * `core.quotepath=false` stops the escaping of non-ASCII bytes, but a path
 * holding a quote, a backslash or a control character is still quoted. Those are
 * rare and exactly the ones a reader would never think to check, so they are
 * decoded rather than left to look like a filename that begins with a quote.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function unquoteGitPath(raw) {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;

  const body = raw.slice(1, -1);
  const bytes = [];
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '\\') {
      bytes.push(...Buffer.from(body[index], 'utf8'));
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1));
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8));
      index += octal[0].length;
      continue;
    }
    const simple = { n: 10, t: 9, r: 13, '"': 34, '\\': 92 };
    const escaped = body[index + 1];
    bytes.push(...(escaped in simple ? [simple[escaped]] : Buffer.from(escaped ?? '', 'utf8')));
    index += 1;
  }
  return Buffer.from(bytes).toString('utf8');
}

/** The commit identity and location of a target inside its work tree. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function readRepositoryIdentity(root) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    return { isRepository: false, workTreeRoot: null, pathWithinWorkTree: '', commit: null, commitCount: 0 };
  }

  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  const workTreeRoot = top.status === 0 ? resolveRealPath(top.stdout.trim()) : resolveRealPath(root);
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const count = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' });

  return {
    isRepository: true,
    workTreeRoot,
    // Resolved on both sides: macOS reports a temporary directory through a
    // symlink, and an unresolved comparison would put every path out of scope.
    pathWithinWorkTree: relative(workTreeRoot, resolveRealPath(root)),
    commit: head.status === 0 ? head.stdout.trim() : null,
    commitCount: count.status === 0 ? Number.parseInt(count.stdout.trim(), 10) : 0,
  };
}

/** A path resolved as far as it exists, so two spellings of one directory compare equal. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function resolveRealPath(target) {
  try {
    return realpathSync(target);
  } catch {
    return target;
  }
}

/**
 * The commits git could not read, named by hash.
 *
 * An unreadable commit is reported with its hash rather than dropped: its
 * history is missing from every reading below, and a run that stayed silent
 * would present a hole in the evidence as an absence of change.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function unreadableCommitsFrom(stderr) {
  const found = new Map();
  for (const line of String(stderr ?? '').split('\n')) {
    const match = /\b(?:bad object|not a valid object name|unable to read|invalid commit)\s+([0-9a-f]{7,40})\b/i.exec(line);
    if (match) found.set(match[1], line.trim());
  }
  return [...found.entries()]
    .map(([hash, reason]) => ({ hash, reason }))
    .sort((left, right) => compareText(left.hash, right.hash));
}

/** The target-relative form of a work-tree path, or null when it lies outside the target. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function relativeToTarget(path, prefix) {
  if (prefix === '' || prefix === '.') return path;
  if (path === prefix) return '';
  if (!path.startsWith(`${prefix}/`)) return null;
  return path.slice(prefix.length + 1);
}

/**
 * The commits a log names, with every path made relative to the target.
 *
 * Two readings come out of this. `changes` is the population the coupling and
 * provenance readings are taken over, so a tree inside a larger repository is
 * measured over its own files rather than over its neighbour's. `declaredPaths`
 * is everything the commit touched, in or out of the population, because the
 * mass-change and vendoring signals are properties of the commit itself.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function parseHistoryLog(text, prefix, scopedPaths) {
  const inScope = (targetPath) => targetPath !== null && targetPath.length > 0
    && (scopedPaths.size === 0 || scopedPaths.has(targetPath));

  const commits = [];
  for (const record of String(text).split(RECORD_SEPARATOR)) {
    const trimmed = record.replace(/^\n+|\n+$/g, '');
    if (trimmed.length === 0) continue;

    const [hash, parents, rest] = trimmed.split(UNIT_SEPARATOR);
    if (!hash || rest === undefined) continue;
    const [subject, ...changeLines] = rest.split('\n');

    // Every change the commit made, in scope or not. The mass-change and
    // vendoring signals are properties of the commit rather than of the
    // population, and a vendored path is out of scope by construction — so
    // counting only the in-scope changes would make those signals unable to fire.
    const declaredPaths = [];
    // The changes inside the analysed population. A modification is kept here
    // even though it is not a transition: it is what couples two files and what
    // anchors a file's provenance, and dropping it would make a commit of pure
    // modifications invisible and date every file to its creation.
    const changes = [];
    for (const line of changeLines) {
      if (line.length === 0) continue;
      const [status, first, second] = line.split('\t');
      const kind = CHANGE_KIND_BY_STATUS_LETTER[String(status ?? '')[0]];
      if (kind === undefined) continue;

      const firstRelative = relativeToTarget(unquoteGitPath(first), prefix);
      const secondRelative = kind === 'moved' ? relativeToTarget(unquoteGitPath(second), prefix) : null;
      const file = kind === 'moved' ? secondRelative : firstRelative;
      if (firstRelative !== null && firstRelative.length > 0) declaredPaths.push(firstRelative);
      if (!inScope(file) && !inScope(firstRelative)) continue;
      // A change kept because one end is in the population carries both ends: the
      // former name is the lineage the move exists to preserve, and dropping it
      // because it is no longer in scope would lose exactly what was recorded.
      changes.push({ kind, file, from: kind === 'moved' ? firstRelative : null });
    }
    if (changes.length === 0) continue;

    commits.push({
      hash,
      parents: parents.length === 0 ? [] : parents.split(' '),
      subject,
      changes,
      declaredPaths,
    });
  }
  return commits;
}

/** The anchors a reader can open, one per change, with the commit that caused it. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function transitionsFrom(commits) {
  const transitions = [];
  for (const commit of commits) {
    for (const change of commit.changes) {
      if (!TRANSITION_KINDS.includes(change.kind)) continue;
      transitions.push({
        kind: change.kind,
        file: change.file ?? change.from,
        from: change.kind === 'moved' ? change.from : null,
        commit: commit.hash,
        // A whole-file transition anchors at the file's first line. The commit is
        // the evidence; the line is where a reader opens. A finer anchor would be
        // one this instrument did not read, which is to say an invented one.
        line: 1,
      });
    }
  }
  return transitions;
}

/**
 * The files that moved together, and the commits that coupled them.
 *
 * A commit wider than the mass-change threshold contributes no pairs. Everything
 * in a bulk import touches everything else, so the pairs would record the tool
 * that ran rather than a relationship anyone should act on — and enumerating
 * them would cost quadratic time to say nothing.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function coChangesFrom(commits) {
  // Keyed by the two paths as a nested map rather than by a joined string. A key
  // built by joining with a character would merge two different pairs whenever a
  // path contains that character — `["a", "b c"]` and `["a b", "c"]` are not the
  // same pair, and one would silently absorb the other's commits.
  const byFirstFile = new Map();
  for (const commit of commits) {
    const files = [...new Set(commit.changes.map((change) => change.file ?? change.from))]
      .filter((file) => file !== null && file.length > 0)
      .sort(compareText);
    if (files.length < 2 || files.length > MASS_CHANGE_FILE_THRESHOLD) continue;

    for (let left = 0; left < files.length; left += 1) {
      for (let right = left + 1; right < files.length; right += 1) {
        const pairs = byFirstFile.get(files[left]) ?? new Map();
        byFirstFile.set(files[left], pairs);
        const couplingCommits = pairs.get(files[right]) ?? [];
        couplingCommits.push(commit.hash);
        pairs.set(files[right], couplingCommits);
      }
    }
  }

  const groups = [];
  for (const [first, pairs] of byFirstFile.entries()) {
    for (const [second, hashes] of pairs.entries()) {
      groups.push({ files: [first, second], commits: hashes, count: hashes.length });
    }
  }

  return groups
    .sort((left, right) => right.count - left.count || compareText(left.files.join(' '), right.files.join(' ')));
}

/** The options a commit subject mentions having passed over, kept as candidates. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function alternativesFrom(subject) {
  return String(subject ?? '')
    .split(CLAUSE_SEPARATOR)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0 && ALTERNATIVE_PATTERN.test(clause));
}

/**
 * The decision provenance of the target: one candidate per file that history
 * touches, anchored at the newest commit that touched it.
 *
 * The entry carries the author's subject as evidence and says, in the same
 * record, that the subject is not proof. A reader who took the candidate for a
 * settled fact would have to ignore a field that is right beside it.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function decisionProvenanceFrom(commits, confidence) {
  const newestByFile = new Map();
  // `git log` yields newest first, so the first commit that mentions a file is
  // the last one that changed it.
  for (const commit of commits) {
    for (const change of commit.changes) {
      const file = change.file ?? change.from;
      if (file === null) continue;
      if (!newestByFile.has(file)) newestByFile.set(file, commit);
    }
  }

  return [...newestByFile.entries()]
    .sort((left, right) => compareText(left[0], right[0]))
    .map(([file, commit]) => ({
      file,
      line: 1,
      commit: commit.hash,
      subject: commit.subject,
      subject_is_proof_of_intent: false,
      alternatives: alternativesFrom(commit.subject),
      alternatives_are_candidates: true,
      classification: 'candidate',
      requires_human_approval: true,
      undecided: UNDECIDED_DECISION_QUESTION,
      confidence,
    }));
}

/**
 * What this history can be trusted for, per factor, with the commits that showed it.
 *
 * The confidence is per history rather than per commit because the design lowers
 * it proposition by proposition: a proposition resting on a squashed history
 * rests on less, and the entry that carries it says so through this value.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function qualityFrom(commits) {
  const byFactor = new Map();
  const record = (factor, commit, evidence, effect) => {
    const seen = byFactor.get(factor);
    if (seen === undefined) {
      byFactor.set(factor, {
        factor,
        occurrences: 1,
        commits: [commit.hash],
        subjects: [commit.subject],
        evidence,
        effect,
      });
      return;
    }
    seen.occurrences += 1;
    if (seen.commits.length < QUALITY_EVIDENCE_LIMIT) {
      seen.commits.push(commit.hash);
      seen.subjects.push(commit.subject);
    }
  };

  for (const commit of commits) {
    for (const signal of QUALITY_SIGNALS) {
      if (signal.pattern.test(commit.subject)) {
        record(signal.factor, commit, `the commit subject matches ${signal.pattern}`, signal.effect);
      }
    }
    // Measured over every path the commit declared, not over the in-scope ones.
    // A vendored path is out of scope by construction, so the vendoring factor
    // could never fire if it counted only what survived the population filter.
    const declared = commit.declaredPaths;
    if (declared.length > MASS_CHANGE_FILE_THRESHOLD) {
      record('mass_reformat', commit, `${declared.length} files changed in one commit`, MASS_CHANGE_EFFECT);
    }
    const vendored = declared.filter((declaredPath) => declaredPath.startsWith(VENDORED_PATH_PREFIX)).length;
    if (declared.length > 0 && vendored / declared.length >= VENDORED_PATH_SHARE) {
      record('vendoring', commit, `${vendored} of ${declared.length} changed paths are vendored`, VENDORING_EFFECT);
    }
  }

  // The structural squash signal: a population that arrived in one commit has no
  // recoverable steps between its states, whatever its message happens to say.
  const changedFiles = new Set();
  for (const commit of commits) {
    for (const change of commit.changes) changedFiles.add(change.file ?? change.from);
  }
  if (commits.length > 0 && commits.length <= SHALLOW_HISTORY_COMMIT_LIMIT && changedFiles.size > 1
    && !byFactor.has('squash')) {
    byFactor.set('squash', {
      factor: 'squash',
      occurrences: 1,
      commits: commits.map((commit) => commit.hash).slice(0, QUALITY_EVIDENCE_LIMIT),
      subjects: commits.map((commit) => commit.subject).slice(0, QUALITY_EVIDENCE_LIMIT),
      evidence: `${changedFiles.size} path(s) arrived in ${commits.length} commit(s), so the steps `
        + 'between them were never recorded',
      effect: 'intermediate commits were collapsed, so the steps between two states are not recoverable',
    });
  }

  const factors = [...byFactor.values()].sort((left, right) => compareText(left.factor, right.factor));
  const profile = factors.length === 0 ? 'clean' : 'contaminated';
  const confidence = profile === 'clean' ? 'high' : (factors.length <= 2 ? 'medium' : 'low');
  // `commitsInScope` is the commits that touched the analysed population, which
  // is not the repository's commit count: a history is judged on the commits
  // that bear on what was measured, not on commits about something else.
  return { profile, factors, confidence, commitsInScope: commits.length };
}

/**
 * Reconstruct what the history of a target says, and what it does not.
 *
 * A tree that is not a repository, and a repository with no commits, both take
 * the same shape as a populated one and differ in their profile. That is the
 * point: a consumer that read an empty list as "nothing changed" would be
 * reading a hole in the evidence as a fact about the project.
 */
export function reconstructHistory(root, { paths = [], readLog = readHistoryLog } = {}) {
  const identity = readRepositoryIdentity(root);
  const base = {
    isRepository: identity.isRepository,
    commit: identity.commit,
    commitCount: identity.commitCount,
    pathWithinWorkTree: identity.pathWithinWorkTree,
    caveat: HISTORY_CAVEAT,
  };

  if (!identity.isRepository) {
    return {
      ...base,
      transitions: [],
      coChanges: [],
      decisionProvenance: [],
      historyQuality: { profile: 'absent', factors: [], confidence: 'none', commitsInScope: 0 },
      unreadableCommits: [],
      unavailable: [
        `${root} is not a git repository, so no history could be read. The absence of a history is `
        + 'not evidence that nothing changed: it is evidence that the change record is unavailable.',
      ],
    };
  }

  const log = readLog(root, identity);
  const unreadableCommits = unreadableCommitsFrom(log.stderr);
  const unavailable = unreadableCommits.length === 0
    ? []
    : [
      `${unreadableCommits.length} commit(s) could not be read and are named with their hash: `
      + `${unreadableCommits.map((entry) => entry.hash).join(', ')}. Their history is missing from every `
      + 'reading below, which is a gap in the evidence rather than an absence of change.',
    ];

  if (identity.commitCount === 0 || !log.ok) {
    return {
      ...base,
      transitions: [],
      coChanges: [],
      decisionProvenance: [],
      historyQuality: {
        profile: identity.commitCount === 0 ? 'empty' : 'unreadable',
        factors: [],
        confidence: 'none',
        commitsInScope: 0,
      },
      unreadableCommits,
      unavailable: unavailable.length > 0
        ? unavailable
        : [`${root} is a repository with no commits, so there is no history to read.`],
    };
  }

  const scopedPaths = new Set(paths);
  const commits = parseHistoryLog(log.stdout, identity.pathWithinWorkTree, scopedPaths);
  const historyQuality = qualityFrom(commits);

  return {
    ...base,
    transitions: transitionsFrom(commits),
    coChanges: coChangesFrom(commits),
    decisionProvenance: decisionProvenanceFrom(commits, historyQuality.confidence),
    historyQuality,
    unreadableCommits,
    unavailable,
  };
}

/**
 * The history as the Markdown a human or an AI reads before deciding anything.
 *
 * The caveat is printed with the report rather than kept beside it, because a
 * reader who has the numbers and not the caveat has the wrong idea.
 */
export function renderHistoryRecord(history) {
  const lines = ['## History and decision provenance', '', `> ${HISTORY_CAVEAT}`, ''];

  if (history.historyQuality.profile === 'absent') {
    lines.push(
      'This target is not a git repository, so there is no history to record. That is a gap in the '
      + 'evidence, not a finding that nothing changed.',
      '',
    );
  } else if (history.historyQuality.profile === 'empty') {
    lines.push('This repository has no commits, so there is no history to record.', '');
  } else if (history.historyQuality.profile === 'unreadable') {
    lines.push(`This repository's history could not be read. ${history.unavailable.join(' ')}`, '');
  }

  lines.push(
    '| Reading | Count |',
    '|---|---|',
    `| commits in the repository | ${history.commitCount} |`,
    `| commits touching this population | ${history.historyQuality.commitsInScope} |`,
    `| transitions | ${history.transitions.length} |`,
    `| co-change groups | ${history.coChanges.length} |`,
    `| provenance candidates | ${history.decisionProvenance.length} |`,
    `| unreadable commits | ${history.unreadableCommits.length} |`,
    '',
    `**History quality**: \`${history.historyQuality.profile}\` at \`${history.historyQuality.confidence}\` confidence.`,
    '',
  );

  for (const factor of history.historyQuality.factors) {
    lines.push(`- **${factor.factor}** (${factor.occurrences} commit(s)) — ${factor.effect}`);
  }
  if (history.historyQuality.factors.length > 0) lines.push('');

  for (const reason of history.unavailable) lines.push(`> ${reason}`, '');
  return lines.join('\n');
}
