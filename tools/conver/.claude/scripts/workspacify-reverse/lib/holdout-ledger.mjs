// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * The holdout ledger: which projects generality is measured against.
 *
 * The reverse rotation was developed against siprs. A method that only handles
 * siprs's single-crate Rust layout with a `vendor/` directory would pass every
 * existing test while being useless in general, so generality has to be
 * measured on a project the method has never seen. This module freezes those
 * projects before any analysis code is written, because an analysis adjusted
 * after seeing a holdout's results invalidates those results.
 *
 * Two rules shape everything here.
 *
 * Eligibility is a human's decision. `evaluateEligibility` therefore emits a
 * capability, observability, falsifiability and risk profile and never a
 * verdict; a field named `eligible` would quietly move that decision to the
 * machine, so the profile schema does not contain one and a test asserts it.
 *
 * A frozen digest cannot be rewritten. Freezing the same holdout again with
 * different content is refused rather than overwritten, so a drift is always
 * visible as a mismatch against the value that was recorded first.
 *
 * Nothing here writes to a holdout tree; freezing reads it and writes only the
 * ledger.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const LEDGER_RELATIVE_PATH = 'tests/workspacify-reverse/holdout/HOLDOUTS.json';
export const CANDIDATES_RELATIVE_PATH = 'tests/workspacify-reverse/holdout/CANDIDATES.json';
export const LEDGER_SCHEMA_VERSION = 1;
export const PROTOCOL_VERSION = 1;

/**
 * Directories that are never walked at all. Build output and version-control
 * metadata are not project content, so counting them would make a digest
 * depend on whether anyone had compiled.
 */
export const NEVER_WALKED_DIRECTORY_NAMES = Object.freeze(['target', '.git']);

/**
 * Directories that are walked but are somebody else's source. A vendored
 * dependency's files are part of the frozen bytes, but they are not evidence of
 * what the project itself is written in: measured on siprs-for-reverse, C
 * headers in `vendor/` outnumber the project's own Rust 1172 to 150 and would
 * make a naive detector call a Rust project a C project.
 */
export const DEPENDENCY_DIRECTORY_NAMES = Object.freeze(['vendor', 'node_modules']);

/** The walk used when reading the project's own source. */
const PROJECT_SOURCE_EXCLUSIONS = Object.freeze([...NEVER_WALKED_DIRECTORY_NAMES, ...DEPENDENCY_DIRECTORY_NAMES]);

export const LANGUAGE_BY_EXTENSION = Object.freeze({
  '.rs': 'rust',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.go': 'go',
  '.py': 'python',
  '.c': 'c',
  '.h': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
});

/**
 * The comment forms each language uses.
 *
 * A comment character is not universal, and treating one set as universal hides
 * real code changes: `#` begins an attribute in Rust (`#[test]`) and a comment
 * in Python, and `;` begins a comment in an ini file and a statement in Rust.
 * So a `.rs` line beginning `#[` is code: calling it a comment would hide a
 * stripped `#[test]` behind "no production line changed".
 */
/**
 * C-family comments. The block-comment continuation forms require the space or
 * the closing slash: a bare `*` would also match `*x = 1;`, a dereference
 * assignment, and stripping that would file a changed line as "no production
 * line changed" — which the delta would then hand to a human as expected.
 */
const C_FAMILY_COMMENTS = Object.freeze(['//', '/*', '* ', '*/']);
const HASH_COMMENTS = Object.freeze(['#']);
const SEMICOLON_COMMENTS = Object.freeze([';', '#']);

/** The comment forms each classified language uses. */
export const LINE_COMMENT_PREFIXES_BY_LANGUAGE = Object.freeze({
  rust: C_FAMILY_COMMENTS,
  typescript: C_FAMILY_COMMENTS,
  javascript: C_FAMILY_COMMENTS,
  go: C_FAMILY_COMMENTS,
  c: C_FAMILY_COMMENTS,
  cpp: C_FAMILY_COMMENTS,
  java: C_FAMILY_COMMENTS,
  php: Object.freeze(['//', '#', '/*', '*']),
  python: HASH_COMMENTS,
  ruby: HASH_COMMENTS,
});

/** Types whose comment character the language table above does not imply. */
const CONFIG_LINE_COMMENT_PREFIXES = Object.freeze({
  '.conf': SEMICOLON_COMMENTS,
  '.ini': SEMICOLON_COMMENTS,
  '.cfg': SEMICOLON_COMMENTS,
  '.yml': HASH_COMMENTS,
  '.yaml': HASH_COMMENTS,
  '.toml': HASH_COMMENTS,
  '.sh': HASH_COMMENTS,
});

/** The extension of a path, lower-cased and with its dot, or '' when it has none. */
export function extensionOf(filePath) {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

/**
 * The comment prefixes a file's type uses, and none when the type is unknown.
 *
 * An unknown type has no prefixes because nothing is known to be a comment
 * there. Treating every line as code reports differences that are only
 * comment-shaped, which is the direction that cannot hide a real change.
 */
export function commentPrefixesFor(filePath) {
  const extension = extensionOf(filePath);
  const configured = CONFIG_LINE_COMMENT_PREFIXES[extension];
  if (configured) return configured;
  const language = LANGUAGE_BY_EXTENSION[extension];
  return (language && LINE_COMMENT_PREFIXES_BY_LANGUAGE[language]) ?? [];
}

/**
 * Declared build manifests, in the order they are looked for. The first one
 * found names the ecosystem; the machine does not claim the build succeeds.
 */
export const BUILD_MANIFESTS = Object.freeze([
  'Cargo.toml',
  'package.json',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'CMakeLists.txt',
  'Makefile',
]);

/** The test command a declared manifest implies, once test files exist. */
export const TEST_COMMAND_BY_MANIFEST = Object.freeze({
  'Cargo.toml': 'cargo test',
  'package.json': 'npm test',
  'go.mod': 'go test ./...',
  'pyproject.toml': 'pytest',
  'setup.py': 'pytest',
  'CMakeLists.txt': 'ctest',
  Makefile: 'make test',
});

/** A project above this many files makes mechanical analysis impractical. */
export const LARGE_TREE_FILE_COUNT = 20000;

/**
 * Test files are recognised by directory or by name, never by a single convention.
 *
 * Exported because R0's eligibility assessment reads the same population, and a
 * second copy of the two rules would let the ledger and the assessment disagree
 * about what a test file is — the drift that made the capability matrix's Rust
 * row false.
 */
// [::TICKET::] P23-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-4 --for-spec --no-implementation-order`.
export const TEST_DIRECTORY_NAMES = Object.freeze(['test', 'tests', '__tests__']);
export const TEST_FILE_PATTERN = /(^|[._-])(test|spec)[._-]|_test\.|\.test\.|\.spec\./;

/**
 * Order two strings by code unit, not by locale.
 *
 * Sorting that depends on the host's locale would make a digest, a report and
 * a test expectation disagree between machines for the same input. Every
 * ordering in this module is therefore explicit and portable.
 */
export function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** SHA-256 of a string, lowercase hex. */
function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** SHA-256 of a file's bytes, lowercase hex. Never decoded, so binary files hash too. */
function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Every file beneath a root, depth first and name-sorted, as paths relative to
 * that root. Excluded directories are not descended into.
 */
export function listTreeFiles(root, { excludedDirectoryNames = NEVER_WALKED_DIRECTORY_NAMES, onUnreadable = null } = {}) {
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
  const excluded = new Set(excludedDirectoryNames);
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch (error) {
      // A directory whose own contents cannot be listed is unreadable in the
      // same sense a file is, so it travels the same route: a caller that can
      // carry the fact forward receives it, and the default refuses rather than
      // returning a shorter walk that reads as a smaller tree.
      if (onUnreadable === null) {
        throw new Error(`cannot read ${relative(root, dir) || '.'} under ${root}: ${error.message}`);
      }
      onUnreadable(relative(root, dir) || '.', error);
      return;
    }
    for (const entry of entries) {
      if (excluded.has(entry)) continue;
      const full = join(dir, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch (error) {
        // A bare errno does not say what was being measured or why it stopped,
        // and a walk that cannot finish cannot support a digest. A caller that
        // can carry the fact forward supplies `onUnreadable` and receives the
        // path; the default still refuses rather than quietly shrinking the walk.
        if (onUnreadable === null) {
          throw new Error(`cannot read ${relative(root, full)} under ${root}: ${error.message}`);
        }
        onUnreadable(relative(root, full), error);
        continue;
      }
      if (stats.isDirectory()) {
        walk(full);
      } else {
        files.push(relative(root, full));
      }
    }
  };
  walk(root);
  return files;
}

/**
 * A content digest of a whole tree, plus the file count it was taken over.
 *
 * Each file contributes `path` and its own digest, so a rename and an edit are
 * distinguishable, and the result is one value that can be compared cheaply.
 */
export function digestTree(root, { excludedDirectoryNames = NEVER_WALKED_DIRECTORY_NAMES, tolerateUnreadable = false } = {}) {
// [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
  const unreadable = [];
  const files = listTreeFiles(root, {
    excludedDirectoryNames,
    onUnreadable: tolerateUnreadable ? (relativePath) => unreadable.push(relativePath) : null,
  });
  const lines = files.map((file) => `${file}\0${sha256File(join(root, file))}`);
  // `unreadable` is reported rather than concealed: a digest that covered fewer
  // files than the tree holds must say so, or a reader would take the shorter
  // walk for the whole of it.
  return { fileCount: files.length, sha256: sha256(lines.join('\n')), unreadable };
}

/**
 * The language most of the project's own source is written in, or `unknown`.
 *
 * Dependency directories are excluded: a project's primary language is what its
 * own authors wrote, not what it vendors. When no declared extension is
 * present the answer is `unknown` with the reason, never a guess and never a
 * throw — an unanalysable candidate is still a candidate a human may weigh.
 */
export function detectPrimaryLanguage(root, { excludedDirectoryNames = PROJECT_SOURCE_EXCLUSIONS } = {}) {
  const fileCounts = {};
  const files = listTreeFiles(root, { excludedDirectoryNames });
  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[extensionOf(file)];
    if (!language) continue;
    fileCounts[language] = (fileCounts[language] ?? 0) + 1;
  }

  const ranked = Object.entries(fileCounts).sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]));
  if (ranked.length === 0) {
    return {
      language: 'unknown',
      fileCounts,
      reason: `no file under ${root} has an extension this project can classify, so the primary language cannot be determined`,
    };
  }
  const [language, count] = ranked[0];
  const extensions = Object.entries(LANGUAGE_BY_EXTENSION)
    .filter(([, name]) => name === language)
    .map(([extension]) => extension)
    .sort(compareText);
  const classified = ranked.reduce((sum, entry) => sum + entry[1], 0);
  return {
    language,
    fileCounts,
    reason: `${count} of ${classified} classified source files are ${language} (${extensions.join(', ')})`,
  };
}

/** True when any file under the tree matches one of the given names. */
function hasFileNamed(root, names) {
  return names.find((name) => existsSync(join(root, name))) ?? null;
}

/**
 * How much history the candidate itself carries, read from git rather than assumed.
 *
 * A candidate placed inside another repository resolves that repository's work
 * tree, so `rev-list --count HEAD` would report the enclosing project's history
 * for every candidate at once. ABOUT-REVERSE 3.6 asks whether *this* project has
 * history, which is only answerable when the project is its own repository.
 */
function readHistory(root) {
  const owner = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (owner.status !== 0) {
    return { isRepository: false, commitCount: null, reason: 'the tree is not inside a git work tree, so intent cannot be read from history' };
  }
  const workTreeRoot = realpathSync(owner.stdout.trim());
  if (workTreeRoot !== realpathSync(root)) {
    return {
      isRepository: false,
      commitCount: null,
      reason: `the tree is not its own repository: it is a subdirectory of ${workTreeRoot}, so its commit history would be that of a larger project and would say nothing about this candidate`,
    };
  }
  const probe = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (probe.status !== 0) {
    return { isRepository: false, commitCount: null, reason: 'the tree is a git work tree but has no commits reachable from HEAD' };
  }
  const commitCount = Number.parseInt(probe.stdout.trim(), 10);
  return {
    isRepository: true,
    commitCount: Number.isNaN(commitCount) ? null : commitCount,
    reason: `${commitCount} commit(s) reachable from HEAD`,
  };
}

/** The lines of a file that carry code rather than comments or blank space. */
export function nonCommentLines(text, filePath) {
  const prefixes = commentPrefixesFor(filePath);
  return text
    .split('\n')
    .filter((line) => !prefixes.some((prefix) => line.trimStart().startsWith(prefix)))
    .filter((line) => line.trim() !== '');
}

/** Files matching the project's own source, excluding dependencies and build output. */
function sourceFiles(root) {
  return listTreeFiles(root, { excludedDirectoryNames: PROJECT_SOURCE_EXCLUSIONS });
}

function countTestFiles(files) {
  return files.filter((file) => {
    const segments = file.split('/');
    if (segments.some((segment) => TEST_DIRECTORY_NAMES.includes(segment))) return true;
    return TEST_FILE_PATTERN.test(segments.at(-1));
  }).length;
}

/** Where a project keeps the bulk of its own source, which is what structure means. */
function measureStructure(files) {
  const perTop = {};
  for (const file of files) {
    const top = file.includes('/') ? file.split('/')[0] : '(root)';
    perTop[top] = (perTop[top] ?? 0) + 1;
  }
  const counts = Object.values(perTop);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const largest = counts.length > 0 ? Math.max(...counts) : 0;
  return {
    distinctSourceDirectories: Object.keys(perTop).length,
    dominantDirectoryShare: total === 0 ? 0 : Number((largest / total).toFixed(4)),
  };
}

/**
 * The material a human weighs when deciding whether a project can be reverse
 * rotated at all.
 *
 * ABOUT-REVERSE 3.6 lists the conditions and 7.7.2 forbids a fixed threshold,
 * so each dimension reports what was found and why it matters. No field
 * combines them into a verdict, and a test asserts that no such field exists.
 */
export function evaluateEligibility(candidate, { projectRoot }) {
  const root = join(projectRoot, candidate.path);
  if (!existsSync(root)) {
    throw new Error(`candidate "${candidate.id}" is declared at ${candidate.path}, which does not exist under ${projectRoot}`);
  }

  const files = sourceFiles(root);
  const manifest = hasFileNamed(root, BUILD_MANIFESTS);
  const detected = detectPrimaryLanguage(root);
  const history = readHistory(root);
  const testFileCount = countTestFiles(files);
  const structure = measureStructure(files);
  const documentation = files.filter((file) => file.endsWith('.md'));
  const excludedCount = listTreeFiles(root).length - files.length;

  const testCommand = testFileCount > 0 && manifest ? TEST_COMMAND_BY_MANIFEST[manifest] : null;

  const capability = {
    buildManifestPresent: manifest !== null,
    historyIsRepository: history.isRepository,
    documentationPresent: documentation.length > 0,
    primaryLanguageAnalysable: detected.language !== 'unknown',
    structureCarriesMeaning: structure,
    evidence: [
      manifest === null
        ? 'no declared build manifest was found, so the dependency and public surface cannot be fixed mechanically'
        : `build manifest: ${manifest}`,
      `${documentation.length} markdown file(s) in the project's own source`,
      `${structure.distinctSourceDirectories} source-bearing top-level path(s), largest holding ${structure.dominantDirectoryShare} of them`,
    ],
  };

  const observability = {
    sourceFileCount: files.length,
    excludedFileCount: excludedCount,
    languagesPresent: Object.keys(detected.fileCounts).sort(),
    testFileCount,
    testCommand,
    evidence: [
      `${files.length} file(s) in the project's own source, ${excludedCount} more under dependency or build directories`,
      detected.reason,
      testCommand === null
        ? 'no test files were found, so no test command can be declared'
        : `test command implied by ${manifest}: ${testCommand}`,
    ],
  };

  const falsifiability = {
    testFileCount,
    historyCommitCount: history.commitCount,
    designDocumentPresent: documentation.length > 0,
    evidence: [
      `${testFileCount} test file(s): a reconstruction can be refuted by running them`,
      history.reason,
    ],
  };

  const signals = [];
  if (!capability.buildManifestPresent) signals.push('no-build-manifest');
  if (testFileCount === 0) signals.push('no-test-files');
  if (!history.isRepository || history.commitCount === 0) signals.push('no-git-history');
  if (excludedCount > files.length) signals.push('generated-code-dominant');
  if (files.length > LARGE_TREE_FILE_COUNT) signals.push('very-large');

  const risk = {
    signals,
    evidence: signals.length === 0
      ? ['none of the danger signals in ABOUT-REVERSE 3.6 were detected']
      : signals.map((signal) => `detected: ${signal}`),
  };

  const reasons = [
    `capability: ${capability.evidence.join('; ')}`,
    `observability: ${observability.evidence.join('; ')}`,
    `falsifiability: ${falsifiability.evidence.join('; ')}`,
    `risk: ${risk.evidence.join('; ')}`,
    'readiness, observability, falsifiability and risk are reported as material; which of them a project can tolerate is a human decision',
  ];

  return { capability, observability, falsifiability, risk, reasons };
}

/**
 * Freeze one holdout: its content digest, its language and the profile a human
 * reads. The candidate's tree is only read.
 */
export function freezeHoldout({ candidate, projectRoot, frozenAt }) {
  const root = join(projectRoot, candidate.path);
  if (!existsSync(root)) {
    throw new Error(`holdout "${candidate.id}" is declared at ${candidate.path}, which does not exist under ${projectRoot}`);
  }
  if (!statSync(root).isDirectory()) {
    throw new Error(`holdout "${candidate.id}" is declared at ${candidate.path}, which is not a directory`);
  }

  const digest = digestTree(root);
  const detected = detectPrimaryLanguage(root);
  return {
    id: candidate.id,
    path: candidate.path,
    domain: candidate.domain,
    language: detected.language,
    languageReason: detected.reason,
    fileCount: digest.fileCount,
    sha256: digest.sha256,
    frozenAt: frozenAt ?? null,
    rule: 'sha256 over the sorted tree listing of relative path and per-file digest, target/ and .git/ excluded',
    profile: evaluateEligibility(candidate, { projectRoot }),
  };
}

/**
 * Freeze every declared candidate, append-only.
 *
 * A candidate that is not present is reported as not selected with its path,
 * rather than quietly dropped: "none were selected" and "the declaration is
 * wrong" look identical otherwise. A candidate whose digest differs from the
 * frozen value is a refusal, not an update.
 */
export function freezeLedger({ projectRoot, candidates, frozenAt }) {
  const ledgerPath = join(projectRoot, LEDGER_RELATIVE_PATH);
  const existing = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null;
  const frozenById = new Map((existing?.holdouts ?? []).map((entry) => [entry.id, entry]));

  const holdouts = [];
  const notSelected = [];
  const declaredIds = new Set(candidates.map((candidate) => candidate.id));
  for (const candidate of [...candidates].sort((left, right) => compareText(left.id, right.id))) {
    const root = join(projectRoot, candidate.path);
    const previous = frozenById.get(candidate.id);

    if (!existsSync(root)) {
      if (previous) {
        holdouts.push(previous);
        continue;
      }
      notSelected.push({
        id: candidate.id,
        path: candidate.path,
        reason: `declared but absent from this checkout under ${projectRoot}`,
      });
      continue;
    }

    const record = freezeHoldout({ candidate, projectRoot, frozenAt });
    if (previous && previous.sha256 !== record.sha256) {
      throw new Error(
        `the ledger is append-only: holdout "${candidate.id}" is already frozen as ${previous.sha256} and now measures `
        + `${record.sha256}. Re-freeze under a new id, or restore the tree as it was.`,
      );
    }
    // The digest is what a freeze fixes, and it is kept. Everything derived
    // from the tree is re-measured, so a profile cannot go stale behind a
    // digest that still matches: deepening a clone changes the readable history
    // without changing a working-tree byte.
    holdouts.push(previous ? { ...record, sha256: previous.sha256, frozenAt: previous.frozenAt } : record);
  }

  // A holdout that is no longer declared is still frozen. Rebuilding the list
  // from the candidate declaration alone would delete its recorded digest, and
  // a digest that can be removed by editing an unrelated file is not a freeze.
  for (const [id, previous] of [...frozenById].sort((left, right) => compareText(left[0], right[0]))) {
    if (!declaredIds.has(id)) holdouts.push(previous);
  }

  const ledger = {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    frozenAt: frozenAt ?? null,
    rule: 'a holdout is frozen by content digest; the ledger is append-only and never rewritten',
    holdouts: holdouts.sort((left, right) => compareText(left.id, right.id)),
    notSelected,
  };

  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

/**
 * Read the ledger and recompute every recorded digest. Read-only.
 *
 * A holdout that has changed, or is no longer present, is drift and is named by
 * id with both values. This is what makes "the holdout is frozen" mean
 * something after the first run.
 */
export function loadLedger({ projectRoot }) {
  const ledgerPath = join(projectRoot, LEDGER_RELATIVE_PATH);
  if (!existsSync(ledgerPath)) {
    throw new Error(
      `no holdout ledger is frozen at ${LEDGER_RELATIVE_PATH} — run "run.mjs holdout freeze" to write one`,
    );
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));

  const recomputed = [];
  const drifted = [];
  for (const entry of ledger.holdouts ?? []) {
    const root = join(projectRoot, entry.path);
    if (!existsSync(root)) {
      drifted.push({ id: entry.id, frozen: entry.sha256, observed: '(absent)', reason: 'the holdout tree is no longer present' });
      continue;
    }
    const digest = digestTree(root);
    recomputed.push({ id: entry.id, sha256: digest.sha256, fileCount: digest.fileCount, language: entry.language });
    if (digest.sha256 !== entry.sha256) {
      drifted.push({ id: entry.id, frozen: entry.sha256, observed: digest.sha256, reason: 'the holdout changed after it was frozen' });
    }
  }

  return {
    ledger,
    entryCount: (ledger.holdouts ?? []).length,
    recomputed,
    drifted,
    notSelected: ledger.notSelected ?? [],
    protocolVersion: ledger.protocolVersion,
  };
}

/** Render a ledger result as the Markdown a human reads. */
export function renderLedgerReport(result) {
  const lines = ['## Holdout ledger', ''];

  if (result.entryCount === 0) {
    lines.push('**None were selected.** No project is frozen as a holdout, so generality is not yet measured.');
    lines.push('');
    lines.push('Which projects qualify is a human decision (ABOUT-REVERSE 3.6 and 7.7.2). The machine supplies a capability profile and never a verdict, so this is a statement about the checkout, not a failure.');
    lines.push('');
  } else {
    lines.push(`**${result.entryCount} holdout(s) frozen**, protocol version ${result.protocolVersion}.`);
    lines.push('');
    const profilesById = new Map((result.ledger.holdouts ?? []).map((entry) => [entry.id, entry.profile]));
    for (const entry of result.recomputed) {
      lines.push(`- \`${entry.id}\` — ${entry.language}, ${entry.fileCount} file(s), digest \`${entry.sha256}\``);
      // The profile is the material a human weighs, so it is rendered rather
      // than left in the JSON: a decision made by reading the reason is the
      // only use this material has.
      for (const reason of profilesById.get(entry.id)?.reasons ?? []) {
        lines.push(`  - ${reason}`);
      }
    }
    lines.push('');
  }

  if (result.drifted.length > 0) {
    lines.push('### Drifted holdouts', '');
    for (const entry of result.drifted) {
      lines.push(`- \`${entry.id}\` — ${entry.reason}`);
      lines.push(`  - frozen \`${entry.frozen}\``);
      lines.push(`  - observed \`${entry.observed}\``);
    }
    lines.push('');
  }

  if (result.notSelected.length > 0) {
    lines.push('### Declared but not selected', '');
    for (const entry of result.notSelected) {
      lines.push(`- \`${entry.id}\` (\`${entry.path}\`) — ${entry.reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

