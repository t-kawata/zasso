/**
 * claude-root-anchoring — the scan behind PX-341's "no omission" gate.
 *
 * A bare `.claude/scripts/...` reference works only from one working directory. The scan
 * reports the forms that assume one: a cwd-relative join, a nested-copy __dirname inside a
 * spawn, a relative `cd ../..`, and a command line that invokes a `.claude` script without
 * naming the git root. The rule and its allowlist live here rather than in the test so the
 * inventory can be produced, reviewed and re-run without registering test cases.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SCRIPT_SUFFIXES = Object.freeze(['.js', '.cjs', '.mjs', '.sh']);
const TEST_SUFFIXES = Object.freeze(['.js', '.cjs', '.mjs']);
const SKIP_DIRECTORIES = Object.freeze(['node_modules', 'archive', '.git', 'dist', 'fixtures']);

/** Files whose whole purpose is to name the anchor, or whose subject is another project. */
export const FILE_ALLOWLIST = Object.freeze([
  {
    prefix: '.claude/scripts/utils/repo-root.cjs',
    reason: 'the anchor helper itself defines the .claude path segment',
  },
  {
    prefix: '.claude/scripts/workspacify-reverse/lib/forward-surface-baseline.mjs',
    reason: 'projectRoot is the analysed subject, not the tool repository',
  },
  {
    prefix: '.claude/scripts/conver/conver.js',
    reason: 'esbuild bundle; the source is scanned and the bundle is checked separately',
  },
  {
    prefix: 'tests/rfc-graph/header-anchor.integration.test.mjs',
    reason: 'the negative fixture deliberately builds the old relative form to prove it fails',
  },
  {
    prefix: 'tests/regeneration/staging-toolchain.test.mjs',
    reason: 'the constant is a module path the test spawns from the repository root, not a command written for a reader',
  },
  {
    prefix: 'tests/smooth-sequences/portability.test.mjs',
    reason: 'the constant names the directory the test inspects, not a command written for a reader',
  },
  {
    prefix: 'tests/smooth-sequences/vocabulary.test.mjs',
    reason: 'the constant names the directory the test inspects, not a command written for a reader',
  },
]);

/** Values that name the global or plugin namespace rather than the repository anchor. */
const GLOBAL_NAMESPACE = /~\/\.claude|\.claude-plugin|CLAUDE_PLUGIN_ROOT|install-targets|resolve-ecc-root|mcp-health-check/;

const ANCHOR = /\$\(git rev-parse --show-toplevel\)|\$CLAUDE_DIR|\$REPO_ROOT|\$HOME|~\//;

/** A command that runs a repository script from whatever directory the reader stands in. */
const BARE_COMMAND = /\bnode\s+["'`]?\.claude\/scripts\//;

/**
 * A directory constant emitted into a generated command.
 *
 * The name is constrained to *_DIR / *_COMMAND / *_SCRIPT so a data literal that
 * merely names a directory for a scan or a digest is not mistaken for an emitter.
 */
const BARE_SCRIPT_DIR_CONSTANT =
  /^\s*(?:const|let|var)\s+\w+_(?:DIR|DIRECTORY|COMMAND|COMMANDS|SCRIPT|SCRIPTS)\s*=\s*['"]\.claude\/(?:scripts|commands)\//;

// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function isComment(line, suffix) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  return suffix === '.sh' && trimmed.startsWith('#');
}

// [::TICKET::] PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-341 --for-spec --no-implementation-order`.
function isFileAllowed(file) {
  return FILE_ALLOWLIST.some((entry) => file === entry.prefix);
}

/** The findings the source scan makes on one line, or an empty array. */
export function scanSourceLine(line, { suffix = '.js', file = '' } = {}) {
  if (isFileAllowed(file)) return [];
  // A provenance annotation is a runnable command written into the source, so it is
  // held to the same anchor. It is checked before the comment skip for that reason.
  if (line.includes('[::TICKET::]')) return BARE_COMMAND.test(line) ? ['bare-annotation'] : [];
  if (isComment(line, suffix)) return [];
  if (GLOBAL_NAMESPACE.test(line)) return [];

  const findings = [];
  if (BARE_COMMAND.test(line)) findings.push('bare-command');
  if (BARE_SCRIPT_DIR_CONSTANT.test(line)) findings.push('bare-script-dir');
  if (/cd\s+\.\.\/\.\.\s*&&\s*node\s+\.claude/.test(line)) findings.push('relative-cd');
  if (/path\.(?:join|resolve)\(\s*process\.cwd\(\),?\s*['"]\.claude['"]/.test(line)) findings.push('cwd-claude');
  if (/(?:execFileSync|execSync|spawnSync|spawn|execFile|exec)\([^)]*__dirname[^)]*['"]\.claude['"]/.test(line)) {
    findings.push('dirname-claude-spawn');
  }
  if (findings.length > 0) return findings;

  // A module import names the module under test, not a script to execute.
  if (/\b(?:require|import)\b[^\n]*\.claude\/scripts/.test(line)) return [];
  // A bare `.claude` literal is a directory name (a skip list or a config directory).
  if (/['"]\.claude['"]/.test(line) && !/\.claude\/scripts/.test(line)) return [];
  return [];
}

/** The findings the command scan makes on one line, or an empty array. */
export function scanCommandLine(line) {
  const executable =
    /^\s*(?:\w+=\$\()?\s*(?:node|bash)\s/.test(line) ||
    /\|\s*node\s/.test(line) ||
    /\$\(\s*node\s/.test(line);
  if (!executable) return [];
  if (!/\.claude\/(?:scripts|commands)/.test(line)) return [];
  if (ANCHOR.test(line)) return [];
  return ['unanchored-command'];
}

/**
 * The findings a command document makes as a unit.
 *
 * The document is a procedure an AI runs block by block. A preflight resolves the
 * absolute .claude path once; every later block reuses that literal path. The scan
 * therefore asks three things of the document as a whole: it has the preflight, it
 * resolves the root only once, and the preflight precedes the first use.
 *
 * @param {string} text — the whole command document
 * @returns {string[]} findings
 */
export function scanCommandDocument(text) {
  const findings = [];
  if (/\b(?:node|bash)[ \t]+["']?\.claude\/scripts\//.test(text)) findings.push('bare-claude-command');
  if (/^[ \t]*["']?\.claude\/scripts\//m.test(text)) findings.push('bare-claude-command');
  const gitRootCalls = (text.match(/git rev-parse --show-toplevel/g) ?? []).length;
  const firstUse = text.indexOf('$CLAUDE_DIR');
  const firstPreflight = text.indexOf('git rev-parse --show-toplevel');

  if (firstUse >= 0 && firstPreflight === -1) {
    findings.push('missing-preflight');
  } else if (firstUse >= 0 && firstPreflight > firstUse) {
    findings.push('preflight-after-use');
  }
  if (gitRootCalls > 1) findings.push(`repeated-git-root(${gitRootCalls})`);
  return findings;
}

function filesUnder(root, suffixes) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.includes(entry.name)) continue;
        walk(join(directory, entry.name));
      } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(join(directory, entry.name));
      }
    }
  };
  if (statSync(root).isDirectory()) walk(root);
  return found.sort();
}

/**
 * Scan the active trees under a project root.
 *
 * @param {{ projectRoot: string, selfPath?: string }} options
 * @returns {{ findings: string[], inspected: number }}
 */
export function scanTree({ projectRoot, selfPath = null }) {
  const findings = [];
  const inspected = [];

  const scriptFiles = filesUnder(join(projectRoot, '.claude', 'scripts'), SCRIPT_SUFFIXES)
    .filter((file) => !file.includes(`${join('scripts', 'tickets', 'tests')}`))
    .filter((file) => !file.includes(`${join('scripts', 'rfc-graph', 'phasify-omissions.test.js')}`));
  const commandFiles = filesUnder(join(projectRoot, '.claude', 'commands'), ['.md']);
  const sourceFiles = filesUnder(join(projectRoot, 'src'), ['.ts']);
  const testFiles = filesUnder(join(projectRoot, 'tests'), TEST_SUFFIXES).filter((file) => file !== selfPath);

  for (const file of scriptFiles) {
    inspected.push(file);
    const suffix = file.endsWith('.sh') ? '.sh' : '.js';
    const relativeFile = relative(projectRoot, file).split('\\').join('/');
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const form of scanSourceLine(line, { suffix, file: relativeFile })) {
        findings.push(`${relativeFile}:${index + 1}: ${form}`);
      }
    });
  }

  for (const file of commandFiles) {
    inspected.push(file);
    const relativeFile = relative(projectRoot, file).split('\\').join('/');
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, index) => {
      for (const form of scanCommandLine(line)) findings.push(`${relativeFile}:${index + 1}: ${form}`);
    });
    for (const form of scanCommandDocument(text)) findings.push(`${relativeFile}: ${form}`);
  }

  for (const file of [...sourceFiles, ...testFiles]) {
    inspected.push(file);
    const relativeFile = relative(projectRoot, file).split('\\').join('/');
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const form of scanSourceLine(line, { file: relativeFile })) {
        findings.push(`${relativeFile}:${index + 1}: ${form}`);
      }
    });
  }

  return { findings, inspected: inspected.length };
}
