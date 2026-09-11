/**
 * module-convention — which module system each script directory uses, decided from
 * the filesystem rather than from a document's memory.
 *
 * `.claude/rules/node.md` claimed four things this repository contradicts: that the
 * scripts tree is CommonJS, that ESM requires a `.mjs` extension, that the test
 * runner is `node tests/run-all.js`, and that Node 18 is the floor. A reviewer
 * reading only that file reported a convention violation in fourteen correct
 * files. The filesystem is therefore the authority and the document is checked
 * against it, never the other way round: rewriting correct source to match an
 * incorrect record would be the exact inversion of the Boy Scout rule.
 *
 * Two decisions are load-bearing:
 *
 *   - `resolveModuleSystem` reads only the extension and the nearest `package.json`
 *     `type` field, never a file's contents. Node decides the same way, and a
 *     verdict that consulted contents would disagree with the runtime it describes.
 *   - Reading contents is a *separate* step, used only to ask whether a file's
 *     syntax contradicts the declaration that governs it. Keeping the two apart is
 *     what lets a contradiction be reported against the file rather than silently
 *     resolved by whichever answer the reader happened to compute first.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';

/** The systems a file can resolve to. `unknown` is a verdict, not a failure. */
export const MODULE_SYSTEM = Object.freeze({ ESM: 'esm', COMMONJS: 'commonjs', UNKNOWN: 'unknown' });

/** What settled the verdict, so a reader can tell a declaration from an extension. */
export const DECIDED_BY = Object.freeze({ EXTENSION: 'extension', PACKAGE_JSON: 'package.json' });

/** The tree whose conventions this module measures. */
export const SCRIPT_ROOT = '.claude/scripts';

/** The document that states the conventions, checked against the measurement. */
export const CONVENTION_RULE_PATH = '.claude/rules/node.md';

/**
 * Extensions that settle the module system on their own.
 *
 * `.js` is deliberately absent: it is the one extension whose meaning comes from a
 * declaration, which is why it is the only one that can be misdeclared.
 */
export const DECISIVE_EXTENSIONS = Object.freeze({ '.mjs': MODULE_SYSTEM.ESM, '.cjs': MODULE_SYSTEM.COMMONJS });

/** Extensions this module measures at all. */
export const SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);

/** Directories never descended into. `__pycache__` is a build cache, not a module tree. */
const EXCLUDED_DIRECTORIES = Object.freeze(['node_modules', '.git', '__pycache__']);

/**
 * The `type` field of the nearest ancestor `package.json`, or null when none
 * declares one.
 *
 * @param {string} startDirectory — absolute directory to search upward from
 * @returns {'module'|'commonjs'|null}
 */
export function readNearestPackageType(startDirectory) {
  let directory = startDirectory;
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      try {
        const declared = JSON.parse(readFileSync(manifest, 'utf8')).type;
        if (declared === 'module' || declared === 'commonjs') return declared;
      } catch {
        // An unreadable or malformed manifest declares nothing. Continuing upward
        // would attribute its files to a different package's declaration, so this
        // directory's absence of a declaration is the answer.
        return null;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/**
 * The module system a file resolves to, and what decided it.
 *
 * @param {string} filePath — absolute path to a source file
 * @returns {{ system: string, decidedBy: string }}
 */
export function resolveModuleSystem(filePath) {
  const extension = extname(filePath);
  const decisive = DECISIVE_EXTENSIONS[extension];
  if (decisive !== undefined) return { system: decisive, decidedBy: DECIDED_BY.EXTENSION };
  if (extension !== '.js') return { system: MODULE_SYSTEM.UNKNOWN, decidedBy: DECIDED_BY.EXTENSION };

  // A `.js` file with no ancestor declaration is CommonJS, which is what Node
  // does with the absence of a `type` field.
  const declared = readNearestPackageType(dirname(filePath));
  return {
    system: declared === 'module' ? MODULE_SYSTEM.ESM : MODULE_SYSTEM.COMMONJS,
    decidedBy: DECIDED_BY.PACKAGE_JSON,
  };
}

/**
 * The module system a file's syntax actually uses.
 *
 * A line beginning with `import` or `export` is ESM; a top-level `require` or
 * `module.exports` is CommonJS. A file with neither — a script that only defines
 * and calls things — is `unknown` and is never reported as a contradiction, because
 * having no module-level construct is not a disagreement with anything.
 *
 * @param {string} sourceText
 * @returns {string} one of MODULE_SYSTEM
 */
export function syntaxOf(sourceText) {
  const text = String(sourceText);
  if (/^[^\S\n]*(import|export)[^\S\n]/m.test(text)) return MODULE_SYSTEM.ESM;
  if (/^[^\S\n]*(module\.exports|exports\.)/m.test(text)) return MODULE_SYSTEM.COMMONJS;
  if (/^[^\S\n]*(const|let|var)[^\S\n][^\n=]*=[^\n]*\brequire\s*\(/m.test(text)) return MODULE_SYSTEM.COMMONJS;
  return MODULE_SYSTEM.UNKNOWN;
}

/**
 * Every source file beneath a directory, as absolute paths, sorted.
 *
 * @param {string} directory
 * @returns {string[]}
 */
// [::TICKET::] PX-205, PX-206, PX-207 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-205|PX-206|PX-207) --for-spec --no-implementation-order`.
function listSourceFiles(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.includes(entry.name)) walk(join(current, entry.name));
      } else if (SOURCE_EXTENSIONS.includes(extname(entry.name))) {
        found.push(join(current, entry.name));
      }
    }
  };
  walk(directory);
  return found;
}

/**
 * Measure every directory beneath a root.
 *
 * A directory's system is the one its files resolve to; a file whose syntax
 * disagrees with its own resolution is a contradiction and is named. A file with no
 * module-level construct conforms, because it makes no claim to contradict.
 *
 * @param {string} scriptRoot — absolute path to the root to measure
 * @returns {Array<{ dir: string, moduleSystem: string, decidedBy: string, fileCount: number, nonConforming: string[], conforms: boolean }>}
 */
export function scanScriptDirectories(scriptRoot) {
  const entries = [];

  // One entry per script directory — the granularity the convention is stated at.
  // Every source file *beneath* it is measured, so a contradiction in a nested
  // directory is still caught; it is attributed to the directory whose convention
  // it falls under rather than reported as a directory of its own. A rule table
  // enumerating every nested folder is one nobody maintains, and the first one it
  // would have had to name here is a Python bytecode cache.
  const directories = readdirSync(scriptRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !EXCLUDED_DIRECTORIES.includes(entry.name))
    .map((entry) => join(scriptRoot, entry.name))
    .sort();

  for (const directory of directories) {
    const files = listSourceFiles(directory);
    const resolutions = files.map((file) => resolveModuleSystem(file));
    const nonConforming = files.filter((file, index) => {
      const syntax = syntaxOf(readFileSync(file, 'utf8'));
      return syntax !== MODULE_SYSTEM.UNKNOWN && syntax !== resolutions[index].system;
    });

    entries.push({
      dir: relative(scriptRoot, directory),
      moduleSystem: resolutions.length > 0 ? resolutions[0].system : MODULE_SYSTEM.UNKNOWN,
      decidedBy: resolutions.length > 0 ? resolutions[0].decidedBy : DECIDED_BY.PACKAGE_JSON,
      fileCount: files.length,
      nonConforming,
      conforms: nonConforming.length === 0,
    });
  }

  return entries;
}

/**
 * Read the per-directory table out of the rule document.
 *
 * The table is the document's claim; `scanScriptDirectories` is the measurement.
 * Keeping the two as separate readings is what lets the test compare them rather
 * than trust either.
 *
 * @param {string} ruleText — the rule document's contents
 * @returns {Record<string, string>} directory name to module system
 */
export function parseConventionTable(ruleText) {
  const table = {};
  const row = /^\|\s*`([^`]+)`\s*\|\s*`?(esm|module|commonjs|unknown)`?\s*\|/gm;
  for (const match of String(ruleText).matchAll(row)) {
    if (match[2] === 'commonjs') table[match[1]] = MODULE_SYSTEM.COMMONJS;
    else if (match[2] === 'unknown') table[match[1]] = MODULE_SYSTEM.UNKNOWN;
    else table[match[1]] = MODULE_SYSTEM.ESM;
  }
  return table;
}

/**
 * Render the measurement as the report a person reads.
 *
 * @param {ReturnType<typeof scanScriptDirectories>} entries
 * @returns {string} Markdown
 */
export function renderConformanceReport(entries) {
  const lines = ['## Module convention', ''];
  for (const entry of entries) {
    const files = entry.fileCount === 0 ? 'no source files' : `${entry.fileCount} file(s)`;
    const verdict = entry.conforms ? 'conforms' : `**${entry.nonConforming.length} contradiction(s)**`;
    lines.push(`- **${entry.dir}** — ${entry.moduleSystem} (decided by ${entry.decidedBy}), ${files}, ${verdict}`);
    for (const file of entry.nonConforming) lines.push(`  - ${file}`);
  }
  const contradictions = entries.reduce((total, entry) => total + entry.nonConforming.length, 0);
  lines.push('', contradictions === 0 ? '**pass**' : `**fail** — ${contradictions} file(s) contradict their own declaration`);
  return lines.join('\n');
}

/** Whether a path is a directory, used by callers that must not descend into a file. */
export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
