/**
 * bundle-freshness — the committed `conver.js` is provably the one its source
 * produces.
 *
 * Measured 2026-09-11, `npm run build` reproduces the committed artefact
 * byte-for-byte at 427,025 bytes, so nothing is stale. What was missing is the
 * guard: nothing compared the two, so the first person to edit `src/` without
 * running `make build-conver` would ship a stale bundle, and the shipped artefact
 * is what a conver project actually runs.
 *
 * The esbuild invocation is read from the `build` script in `package.json` rather
 * than re-spelled here. A second spelling is a second thing to drift, and a check
 * that ran its own build could disagree with the build it claims to be checking —
 * the same failure P22-21 refused when it exported `sha256Hex` rather than
 * writing a second digest.
 *
 * The build runs into a temporary directory and is removed on every exit path; the
 * check never writes into the tree it measures.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** The source entry the bundle is built from. */
export const BUNDLE_ENTRY = 'src/entry.ts';

/** The committed artefact every conver project runs. */
export const COMMITTED_BUNDLE_PATH = '.claude/scripts/conver/conver.js';

/** The bundler this check needs, resolved from the project rather than assumed. */
export const BUNDLER_PACKAGE = 'esbuild';

/**
 * The installed bundler's version, or null when it cannot be resolved.
 *
 * The version is recorded because it decides the output bytes: a build is only
 * comparable to the artefact it produced under the same toolchain.
 *
 * @returns {string|null}
 */
export function resolveEsbuildVersion(projectRoot) {
  try {
    return JSON.parse(readFileSync(join(projectRoot, 'node_modules', BUNDLER_PACKAGE, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

/**
 * The `build` script a project declares.
 *
 * @param {string} projectRoot
 * @returns {string|null}
 */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function readBuildScript(projectRoot) {
  try {
    return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).scripts?.build ?? null;
  } catch {
    return null;
  }
}

/**
 * The argv the declared build script describes, with its output redirected.
 *
 * Reading the script rather than re-spelling it means the check cannot drift from
 * the build it checks. Only the output path is replaced, and only because the check
 * must not overwrite the artefact it is measuring.
 *
 * @param {string} buildScript
 * @param {string} outputPath
 * @returns {{ command: string, args: string[] }}
 * @throws {Error} when the script cannot be redirected, naming what was found
 */
export function buildCommandFor(buildScript, outputPath) {
  const tokens = String(buildScript).trim().split(/\s+/);
  const redirected = tokens.map((token, index) => {
    if (token.startsWith('--outfile=')) return `--outfile=${outputPath}`;
    if (tokens[index - 1] === '--outfile') return outputPath;
    return token;
  });
  if (!redirected.some((token) => token.includes(outputPath))) {
    throw new Error(`the declared build script does not name an output path, so it cannot be redirected: ${buildScript}`);
  }
  return { command: redirected[0], args: redirected.slice(1) };
}

/**
 * The bundler as it can actually be run.
 *
 * A build script names its tool the way a shell would, and a shell finds it in
 * node_modules/.bin. spawnSync does not add that directory to PATH, so the bare
 * name fails with a null status that reads as a failed build rather than as a
 * missing executable.
 *
 * @param {string} projectRoot
 * @param {string} command
 * @returns {string}
 */
export function resolveBundlerCommand(projectRoot, command) {
  const local = join(projectRoot, "node_modules", ".bin", command);
  return existsSync(local) ? local : command;
}

/** Digest a file, or null when it is absent. */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function digestOf(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Compare a committed bundle against a fresh build of the same source.
 *
 * @param {{ projectRoot: string, committedPath?: string }} input
 * @returns {{ identical: boolean, committedDigest: string|null, builtDigest: string|null, byteSizeDelta: number|null, bundleEntry: string, unavailable: string|undefined }}
 * @throws {Error} naming the missing entry point when the tree has no source
 */
export function readBundleComparison({ projectRoot, committedPath = COMMITTED_BUNDLE_PATH }) {
  const entryPath = join(projectRoot, BUNDLE_ENTRY);
  // A caller may name the artefact relative to the tree or absolutely — a test
  // comparing against a copy outside the tree has no relative name for it, and
  // `join` would silently concatenate an absolute path onto the root and measure
  // nothing.
  const bundlePath = isAbsolute(committedPath) ? committedPath : join(projectRoot, committedPath);

  if (!existsSync(entryPath)) {
    throw new Error(`the bundle entry point is absent: ${BUNDLE_ENTRY} was not found under ${projectRoot}`);
  }

  const committedDigest = digestOf(bundlePath);
  const buildScript = readBuildScript(projectRoot);
  if (buildScript === null) {
    return {
      identical: false,
      committedDigest,
      builtDigest: null,
      byteSizeDelta: null,
      bundleEntry: BUNDLE_ENTRY,
      unavailable: 'no build script declared in package.json',
    };
  }
  if (resolveEsbuildVersion(projectRoot) === null) {
    return {
      identical: false,
      committedDigest,
      builtDigest: null,
      byteSizeDelta: null,
      bundleEntry: BUNDLE_ENTRY,
      unavailable: `${BUNDLER_PACKAGE} is not resolvable; install it with npm install`,
    };
  }

  const scratch = mkdtempSync(join(tmpdir(), 'px205-bundle-'));
  const outputPath = join(scratch, 'conver.js');
  try {
    const { command, args } = buildCommandFor(buildScript, outputPath);
    const result = spawnSync(resolveBundlerCommand(projectRoot, command), args, {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      throw new Error(`the declared build failed (${command} exited ${result.status}): ${(result.stderr ?? '').slice(0, 400)}`);
    }

    const builtDigest = digestOf(outputPath);
    const byteSizeDelta =
      committedDigest === null || builtDigest === null
        ? null
        : Math.abs(readFileSync(bundlePath).length - readFileSync(outputPath).length);

    return {
      identical: committedDigest !== null && committedDigest === builtDigest,
      committedDigest,
      builtDigest,
      byteSizeDelta,
      bundleEntry: BUNDLE_ENTRY,
      unavailable: undefined,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Render the comparison as the report a person reads.
 *
 * @param {ReturnType<typeof readBundleComparison>} comparison
 * @param {string} committedPath
 * @returns {string} Markdown
 */
export function renderFreshnessReport(comparison, committedPath = COMMITTED_BUNDLE_PATH) {
  const lines = ['## Bundle freshness', ''];
  if (comparison.unavailable !== undefined) {
    lines.push(`**unavailable** — ${comparison.unavailable}`, '', `_${committedPath} was not compared._`);
    return lines.join('\n');
  }
  lines.push(
    `- committed \`${committedPath}\`: ${comparison.committedDigest}`,
    `- freshly built from \`${comparison.bundleEntry}\`: ${comparison.builtDigest}`,
  );
  if (!comparison.identical) lines.push(`- byte-size difference: ${comparison.byteSizeDelta}`);
  lines.push('', comparison.identical ? '**pass**' : '**fail** — run make build-conver deliberately if the change is intended');
  return lines.join('\n');
}
