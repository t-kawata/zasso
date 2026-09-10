// [::TICKET::] P22-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-2 --for-spec --no-implementation-order`.
/**
 * Ground-truth contamination.
 *
 * If the executor can read `RFC-ROOT-GRAPH.json`, `RFC-*.md`, `Tickets.json` or
 * the project readme out of the tree it is analysing, then a result that looks
 * like a reconstruction may only be a lookup, and the measurement means
 * nothing. Those four shapes are exactly what a forward rotation leaves behind,
 * so they are declared once, here, and every caller shares them.
 *
 * The check is read-only and reports by filename, never by count: a count
 * cannot be acted on, and a filename can.
 *
 * Dependency directories are treated differently from the project's own files.
 * `siprs-for-reverse` vendors PJSIP, and five of its `README.md` files belong
 * to that dependency rather than to the project. A check that called those
 * contaminations would be unusable on every vendored project, and one that
 * skipped them silently would hide a real one, so they are reported separately
 * and do not by themselves fail the check.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DEPENDENCY_DIRECTORY_NAMES, NEVER_WALKED_DIRECTORY_NAMES, compareText } from './holdout-ledger.mjs';

/**
 * The shapes the reverse rotation must not be able to read directly.
 *
 * `*-GRAPH.json` excludes the `.delta.json` sidecars: those describe how an
 * artefact changed and carry no design content.
 */
export const GROUND_TRUTH_PATTERNS = Object.freeze([
  Object.freeze({
    kind: 'graph',
    description: 'a graphify or boundify graph',
    matches: (name) => name.endsWith('-GRAPH.json') && !name.endsWith('.delta.json'),
  }),
  Object.freeze({
    kind: 'rfc-markdown',
    description: 'a design RFC',
    matches: (name) => /^RFC-.*\.md$/.test(name),
  }),
  Object.freeze({
    kind: 'tickets',
    description: 'the ticket ledger',
    matches: (name) => name === 'Tickets.json',
  }),
  Object.freeze({
    kind: 'readme',
    description: 'the project readme',
    matches: (name) => name === 'README.md',
  }),
]);

/**
 * The shapes that are evidence of a forward rotation, without the readme.
 *
 * A holdout is upstream source chosen for generality and has not been forward
 * rotated, so its own `README.md` is the project's documentation — exactly the
 * material the analysis is meant to read — and not a derived answer key. Only
 * the artefacts a forward rotation would have added are evidence of one, and
 * nothing is lost by the narrower vocabulary: a holdout that *had* been forward
 * rotated carries the graph, the RFC and the tickets as well, and all three are
 * still reported.
 */
export const FORWARD_ROTATION_PATTERNS = Object.freeze(
  GROUND_TRUTH_PATTERNS.filter((pattern) => pattern.kind !== 'readme'),
);

/** True when any segment of a relative path is a dependency directory. */
function isInsideDependency(relativePath) {
  return relativePath.split('/').slice(0, -1).some((segment) => DEPENDENCY_DIRECTORY_NAMES.includes(segment));
}

/**
 * Inspect a target root for reachable ground truth.
 *
 * Build output and version-control metadata are not walked: they are not
 * project content, and a compiled tree is not an answer key.
 *
 * @param {string} root - the directory a reverse rotation would run against
 * @param {object} [options]
 * @param {Array} [options.patterns] - the contamination vocabulary; a target root
 *   that a forward rotation stripped uses all four shapes, while a holdout that
 *   was never rotated uses `FORWARD_ROTATION_PATTERNS`
 * @returns {{root: string, clean: boolean, violations: Array, dependencyMatches: Array, filesScanned: number}}
 */
export function verifyIsolation(root, { excludedDirectoryNames = NEVER_WALKED_DIRECTORY_NAMES, patterns = GROUND_TRUTH_PATTERNS } = {}) {
  if (!existsSync(root)) {
    throw new Error(`no target root exists at ${root} — the isolation check needs a directory to inspect`);
  }
  if (!statSync(root).isDirectory()) {
    throw new Error(`the target root ${root} is not a directory`);
  }

  const excluded = new Set(excludedDirectoryNames);
  const violations = [];
  const dependencyMatches = [];
  let filesScanned = 0;

  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      if (excluded.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      filesScanned += 1;
      const relativePath = relative(root, full);
      const pattern = patterns.find((candidate) => candidate.matches(entry));
      if (!pattern) continue;
      const found = { file: relativePath, kind: pattern.kind, description: pattern.description };
      if (isInsideDependency(relativePath)) {
        dependencyMatches.push(found);
      } else {
        violations.push(found);
      }
    }
  };
  walk(root);

  const byFile = (left, right) => compareText(left.file, right.file);
  const sortedViolations = violations.sort(byFile);
  return {
    root,
    clean: sortedViolations.length === 0,
    violations: sortedViolations,
    dependencyMatches: dependencyMatches.sort(byFile),
    filesScanned,
  };
}

/** Render an isolation result as the Markdown a human reads. */
export function renderIsolationReport(result, root = result.root) {
  const lines = ['## Isolation check', '', `Target root: \`${root}\``, ''];

  if (result.clean) {
    lines.push(`**Clean.** No ground-truth artefact is reachable among the ${result.filesScanned} file(s) inspected.`);
  } else {
    lines.push(`**Contaminated.** ${result.violations.length} ground-truth artefact(s) are reachable, named below.`);
  }
  lines.push('');

  if (result.violations.length > 0) {
    lines.push('### Reachable ground truth', '');
    for (const violation of result.violations) {
      lines.push(`- \`${violation.file}\` — ${violation.description}`);
    }
    lines.push('');
  }

  if (result.dependencyMatches.length > 0) {
    lines.push('### A dependency\'s own files, which are not the answer key', '');
    for (const match of result.dependencyMatches) {
      lines.push(`- \`${match.file}\` — ${match.description}`);
    }
    lines.push('');
  }

  if (result.filesScanned === 0) {
    lines.push('**Nothing was inspected.** An empty target root proves nothing about isolation.');
    lines.push('');
  }

  return lines.join('\n');
}

