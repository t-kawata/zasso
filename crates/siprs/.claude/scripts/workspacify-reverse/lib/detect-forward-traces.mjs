// [::TICKET::] PX-203 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-203 --for-spec --no-implementation-order`.
/**
 * Detection of forward-rotation traces in an existing project.
 *
 * This module answers one question only: "what in this tree came from the
 * forward rotation?" It never writes. The scrubber consumes its findings, and
 * the verifier re-runs it after a scrub to prove the residue reached zero.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  TRACE_PATTERNS,
  TRACE_LAYERS,
  L1_PATTERNS,
  L2_PATTERNS,
  L3_PATTERN,
  isCommentLine,
} from './trace-patterns.mjs';

const DEFAULT_EXCLUDED_DIRS = ['.git', 'node_modules', 'vendor'];
const DEFAULT_EXTENSIONS = ['.rs', '.toml', '.yml', '.conf', '.h'];
const TICKET_KEYED_FILENAME = /p\d+_\d+/;

/** A compile-time file embedding: the file must exist or the crate will not build. */
const INCLUDE_MACRO = /\binclude_(?:str|bytes)!\s*\(\s*"([^"]+)"\s*\)/;

/**
 * A line is an L3 trace when it embeds a file the tree does not contain.
 *
 * The forward rotation produced documents (the RFC, the graph, the crystalized
 * README) and left code that reads them. Once those documents are stripped the
 * dependency becomes a broken build, which is both a leak and a defect. Testing
 * for the missing file — rather than for a hardcoded list of names — keeps the
 * rule correct for any project.
 */
function embedsMissingFile(line, filePath) {
  if (isCommentLine(line)) return false;
  const match = INCLUDE_MACRO.exec(line);
  if (!match) return false;
  return !existsSync(path.resolve(path.dirname(filePath), match[1]));
}

/**
 * Enumerate every file worth analysing under a root.
 *
 * A missing root is reported, never thrown: callers must distinguish
 * "nothing to scrub" from "the target was wrong".
 *
 * @param {string} rootPath — directory to analyse
 * @param {{ excludedDirs?: string[], extensions?: string[] }} [options]
 * @returns {{ root: string, exists: boolean, excludedDirs: string[], files: Array<{path: string, relative: string, ext: string}> }}
 */
export function resolveTargetRoot(rootPath, options = {}) {
  const excludedDirs = options.excludedDirs ?? DEFAULT_EXCLUDED_DIRS;
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const files = [];

  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    return { root: rootPath, exists: false, excludedDirs, files };
  }

  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      if (excludedDirs.includes(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (extensions.includes(path.extname(entry))) {
        files.push({
          path: full,
          relative: path.relative(rootPath, full),
          ext: path.extname(entry),
        });
      }
    }
  };
  walk(rootPath);

  return { root: rootPath, exists: true, excludedDirs, files };
}

/**
 * Tag every line of every analysed file with the trace layers it belongs to.
 * A line is counted at most once per layer.
 *
 * @param {string} rootPath
 * @param {object} [options]
 * @returns {{ layers: Record<string, {count: number, removable: boolean, findings: Array<{file: string, line: number, text: string}>}>, markdown: string }}
 */
export function detectForwardTraces(rootPath, options = {}) {
  const target = resolveTargetRoot(rootPath, options);
  const layers = {};
  for (const layer of Object.values(TRACE_LAYERS)) {
    layers[layer.id] = { count: 0, removable: layer.removable, findings: [] };
  }

  for (const file of target.files) {
    const lines = readFileSync(file.path, 'utf8').split('\n');
    lines.forEach((text, index) => {
      const record = (layerId) => {
        layers[layerId].count += 1;
        layers[layerId].findings.push({ file: file.relative, line: index + 1, text });
      };
      if (L1_PATTERNS.some((pattern) => pattern.test(text))) record('L1');
      if (L2_PATTERNS.some((pattern) => pattern.test(text))) record('L2');
      if (L3_PATTERN.test(text) || embedsMissingFile(text, file.path)) record('L3');
    });
  }

  // L4 carries no findings: it is the structure we deliberately keep.
  layers.L4.count = target.files.length;

  return { layers, markdown: renderDetection(layers, target) };
}

/**
 * Test files whose NAME leaks a ticket key (e.g. verify_spec_p9_1.rs).
 * @param {string} rootPath
 * @param {object} [options]
 * @returns {string[]} root-relative paths
 */
export function detectTicketKeyedFilenames(rootPath, options = {}) {
  return resolveTargetRoot(rootPath, options)
    .files.filter((file) => TICKET_KEYED_FILENAME.test(path.basename(file.relative)))
    .map((file) => file.relative);
}

/**
 * How many findings of a layer the report lists before summarising.
 *
 * The report is read to decide what to scrub, and a layer can hold hundreds of
 * findings; listing them all buries the layer's meaning in its instances. The
 * remainder is always stated as a count, so nothing is silently dropped.
 */
const FINDINGS_PREVIEW_LIMIT = 10;

/**
 * Render the detection as Markdown: the AI reads this to decide what to scrub,
 * so it states what each layer means rather than dumping a data structure.
 */
function renderDetection(layers, target) {
  const lines = ['## Forward-rotation traces', ''];
  if (!target.exists) {
    lines.push(`Target root not found: ${target.root}`, '');
    return lines.join('\n');
  }
  lines.push(`Root: \`${target.root}\``, `Files analysed: ${target.files.length}`, '');
  for (const layer of Object.values(TRACE_LAYERS)) {
    const entry = layers[layer.id];
    const verdict = layer.removable ? 'removable' : '**keep**';
    lines.push(`### ${layer.id} — ${entry.count} finding(s) (${verdict})`);
    lines.push(layer.description, '');
    for (const finding of entry.findings.slice(0, FINDINGS_PREVIEW_LIMIT)) {
      lines.push(`- \`${finding.file}:${finding.line}\` ${finding.text.trim()}`);
    }
    const summarised = entry.findings.length - FINDINGS_PREVIEW_LIMIT;
    if (summarised > 0) {
      lines.push(`- … and ${summarised} more`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** The predicate shared with the verifier. */
detectForwardTraces.patterns = TRACE_PATTERNS;
