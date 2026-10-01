/**
 * path-emission — a path that leaves the process names no machine.
 *
 * A path is the one value in this repository that can carry the identity of the machine
 * that produced it into an artefact another machine reads: the two seed documents, the
 * ticket records, the status files and the specifications are all committed, and a path
 * naming one home directory makes each of them a function of the machine as well as of its
 * inputs. The rule is therefore that a path leaving the process passes through the
 * converter in `path-utils`, while a path used inside the process stays absolute, because
 * neither the filesystem nor a subprocess expands a tilde.
 *
 * Two checks, because the rule has two observable ends and neither one alone is enough.
 *
 * `scanCommittedArtefacts` reads the tracked tree and asks the question the rule is about:
 * does any committed file name this machine's home directory. It is exact — a finding is a
 * literal occurrence, with nothing inferred — and it cannot see an emission before the
 * command that produces it has run.
 *
 * `scanPathEmissions` reads the sources and asks the question one step earlier: does a sink
 * interpolate a name this file has proved to hold an absolute path, without a converter.
 * It is also exact, and it is incomplete, which is the trade this module makes deliberately.
 * An earlier draft tried to close the gap by reporting every interpolation whose expression
 * merely looked like a path — a name containing `path`, `dir`, `root` or `file` — and it
 * reported 195 sites across the tree, almost all of them counts, ids and file lists. A gate
 * that fails on `stagedFiles.length` is a gate people learn to route around, and the sites
 * it would have buried are the ones worth seeing. So the scan keeps its precision and gives
 * up the reach, and the shape it cannot see — an absolute path arriving as a property of an
 * object rather than through an assignment in the file that prints it — is covered by the
 * tests that exercise those renderers rather than by this scan.
 *
 * Read a clean verdict as "no committed artefact names this machine, and no source emits a
 * path the scan can prove is absolute". Never as "no emission at all".
 *
 * A zero inspected count is a defect of the scan, not a clean tree, and the caller is
 * expected to say so: the two look identical in a report that only prints findings.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';

/** Extensions the source scan reads. A path emitted from a shell script is out of reach. */
const MODULE_SUFFIXES = Object.freeze(['.js', '.mjs', '.cjs']);

/**
 * Directories never descended into.
 *
 * `conver` holds an esbuild bundle: it is generated from `src/`, so a finding inside it is
 * a finding about a build artefact rather than about a source file, and the build would
 * overwrite what was fixed here.
 */
const EXCLUDED_DIRECTORIES = Object.freeze(['node_modules', '.git', 'dist', 'conver']);

/**
 * Paths the artefact scan does not read.
 *
 * `tests/` holds fixtures whose bytes the tests assert on. They are inputs the repository
 * wrote down rather than artefacts the tooling emits, and converting one would edit an
 * expectation rather than a behaviour. The exclusion is a prefix and not a pattern, so it
 * cannot quietly widen.
 */
const FIXTURE_PREFIXES = Object.freeze(['tests/']);

/**
 * The assignment forms that make a name hold an absolute path.
 *
 * `join` and `dirname` are absent deliberately: they inherit absoluteness from their first
 * argument, and the transitive pass below propagates that, which is more exact than
 * treating every join as absolute and then reporting arithmetic on relative paths.
 */
const ABSOLUTE_PRODUCERS = Object.freeze([
  /\b(?:path\.)?(?:resolve|fileURLToPath|realpathSync)\s*\(/,
  /=\s*__dirname\b/,
  /=\s*process\.cwd\(\)/,
  /=\s*os\.homedir\(\)/,
]);

/** Functions that return a path which names no machine. */
const CONVERTERS = Object.freeze([
  'toHomeRelative(',
  'homeRelativeOrNull(',
  'relative(',
  'makeRelative(',
  'basename(',
]);

/** The forms that hand a value to something outside the process. */
const SINKS = Object.freeze([
  { pattern: /process\.stdout\.write\s*\(/, name: 'process.stdout.write' },
  { pattern: /process\.stderr\.write\s*\(/, name: 'process.stderr.write' },
  { pattern: /console\.(?:log|error|warn|info)\s*\(/, name: 'console' },
  { pattern: /(?:write|append)FileSync\s*\(/, name: 'writeFileSync' },
  { pattern: /throw new [A-Za-z]*Error\s*\(/, name: 'throw' },
]);

/** Every module file beneath `root`, as paths relative to it. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function moduleFilesUnder(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.includes(entry.name)) continue;
        walk(join(directory, entry.name));
      } else if (MODULE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(join(directory, entry.name));
      }
    }
  };
  if (statSync(root).isDirectory()) walk(root);
  return found.sort();
}

/**
 * The names in one file that hold an absolute path.
 *
 * Run to a fixed point because a name can be built from another: `const root = resolve(x)`
 * makes `root` absolute, and `const child = join(root, name)` makes `child` absolute too.
 */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function absoluteNamesIn(lines) {
  const absolute = new Set();
  for (let pass = 0; pass < 4; pass += 1) {
    for (const line of lines) {
      const assignment = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(line);
      if (assignment === null) continue;
      const [, name, rightHandSide] = assignment;
      if (ABSOLUTE_PRODUCERS.some((producer) => producer.test(line))) {
        absolute.add(name);
        continue;
      }
      const joined = /\b(?:path\.)?(?:join|dirname)\(\s*([A-Za-z_$][\w$]*)/.exec(rightHandSide);
      if (joined !== null && absolute.has(joined[1])) absolute.add(name);
    }
  }
  return absolute;
}

/** Every `${...}` expression on a line, as written. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function interpolationsIn(line) {
  const expressions = [];
  const pattern = /\$\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match;
  while ((match = pattern.exec(line)) !== null) expressions.push(match[1].trim());
  return expressions;
}

/** The sink a line writes to, or null when the line writes to nothing outside. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function sinkOf(line) {
  const sink = SINKS.find((candidate) => candidate.pattern.test(line));
  return sink === undefined ? null : sink.name;
}

/** Whether an interpolation reaches its sink through a converter. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function isConverted(expression) {
  return CONVERTERS.some((converter) => expression.includes(converter));
}

/**
 * Report every emission of a provably absolute path that did not pass through the converter.
 *
 * @param {{ root: string }} input — the directory to scan
 * @returns {{ root: string, files: number, inspected: number, bypassing: Array<{file: string, line: number, sink: string, expression: string}> }}
 */
export function scanPathEmissions({ root }) {
  const files = moduleFilesUnder(root);
  const bypassing = [];
  let inspected = 0;

  for (const filePath of files) {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    const absolute = absoluteNamesIn(lines);

    lines.forEach((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

      const sink = sinkOf(line);
      if (sink === null) return;

      const expressions = interpolationsIn(line);
      if (expressions.length === 0) return;
      inspected += 1;

      for (const expression of expressions) {
        if (isConverted(expression)) continue;
        const leadingName = expression.split(/[.[(]/)[0].trim();
        if (!absolute.has(leadingName)) continue;
        bypassing.push({
          file: relative(root, filePath).split(sep).join('/'),
          line: index + 1,
          sink,
          expression,
        });
      }
    });
  }

  return { root, files: files.length, inspected, bypassing };
}

/** The paths git tracks beneath `repositoryRoot`, relative to it. */
// [::TICKET::] PX-231 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-231 --for-spec --no-implementation-order`.
function trackedFilesUnder(repositoryRoot) {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' });
  if (listed.status !== 0) return null;
  return listed.stdout.split('\0').filter((path) => path !== '');
}

/**
 * Report every tracked file that names the home directory of the machine reading it.
 *
 * This is the rule itself rather than a proxy for it, which is why it is exact: a finding
 * is a literal occurrence in a committed file, and there is nothing to interpret. What it
 * cannot do is see an emission before the command that produces it has run, which is the
 * half `scanPathEmissions` covers.
 *
 * @param {{ repositoryRoot: string, home?: string }} input
 * @returns {{ home: string, files: number, naming: Array<{file: string, line: number, occurrences: number}>, unavailable: string|null }}
 */
export function scanCommittedArtefacts({ repositoryRoot, home = homedir() }) {
  const tracked = trackedFilesUnder(repositoryRoot);
  if (tracked === null) {
    return { home, files: 0, naming: [], unavailable: 'not-a-repository' };
  }
  if (!home) {
    return { home, files: 0, naming: [], unavailable: 'no-home-directory' };
  }

  const naming = [];
  let files = 0;
  for (const path of tracked) {
    if (FIXTURE_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    let text;
    try {
      text = readFileSync(join(repositoryRoot, path), 'utf8');
    } catch {
      continue;
    }
    files += 1;
    if (!text.includes(home)) continue;
    const lines = text.split('\n');
    naming.push({
      file: path,
      line: lines.findIndex((line) => line.includes(home)) + 1,
      occurrences: lines.filter((line) => line.includes(home)).length,
    });
  }

  return { home, files, naming, unavailable: null };
}

/**
 * The findings as the report a person reads, so a failing gate says which line moved.
 *
 * @param {{ files: number, inspected: number, bypassing: Array<object> }} report
 * @returns {string}
 */
export function renderEmissionReport(report) {
  const lines = [
    `scanned ${report.files} module(s), ${report.inspected} emission site(s)`,
  ];
  if (report.bypassing.length === 0) {
    lines.push('no emission of a provably absolute path bypassed the converter');
    return `${lines.join('\n')}\n`;
  }
  lines.push(`${report.bypassing.length} emission(s) bypass the converter:`);
  for (const finding of report.bypassing) {
    lines.push(`  ${finding.file}:${finding.line} ${finding.sink} ${finding.expression}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The artefacts that still name this machine, as the report a person reads.
 *
 * @param {{ home: string, files: number, naming: Array<object>, unavailable: string|null }} report
 * @returns {string}
 */
export function renderArtefactReport(report) {
  if (report.unavailable !== null) return `the scan is unavailable: ${report.unavailable}\n`;
  const lines = [`scanned ${report.files} tracked file(s) outside the fixtures, home ${report.home}`];
  if (report.naming.length === 0) {
    lines.push('no committed artefact names this machine');
    return `${lines.join('\n')}\n`;
  }
  lines.push(`${report.naming.length} committed artefact(s) name this machine:`);
  for (const finding of report.naming) {
    lines.push(`  ${finding.file}:${finding.line} (${finding.occurrences} line(s))`);
  }
  return `${lines.join('\n')}\n`;
}
