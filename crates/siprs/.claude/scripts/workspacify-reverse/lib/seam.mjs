/**
 * The seam: where the partition already on disk differs from the one the analysis fixed.
 *
 * Step 6 records the discontinuity on the subjects that have one. Both directions are
 * named — an entry only the prior partition carries, and an entry only the fixed one
 * does — because the two answer different questions: the first is work the old
 * partition owns and the new one must place, the second is structure the analysis found
 * that the old partition never named. Netted into one number they are a count nobody can
 * act on, which is why the render never produces one.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RESERVED_ORIGIN_SPEC_FILE_NAME } from '../../workspacify-tree/lib/reserved-root.mjs';
import { reservedReverseDirectory } from './holdout-ledger.mjs';

/** The partition the analysis fixed, as the origin spec carries it. */
const SPEC_PARTITION_KEY = 'partition';

/**
 * Every `path` a partition document names, at any depth.
 *
 * The two documents are written by different producers — a `Dirs-Tree.json` from the
 * forward rotation and a partition from this analysis — and both nest their package
 * entries differently. Walking for the paths rather than reading one shape keeps the
 * comparison from silently finding nothing when the other shape arrives.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function collectPartitionPaths(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectPartitionPaths(entry, found);
    return found;
  }
  if (value === null || typeof value !== 'object') return found;

  if (typeof value.path === 'string') found.add(value.path);
  for (const nested of Object.values(value)) collectPartitionPaths(nested, found);
  return found;
}

/** Read the partition a prior cycle left, if the subject carries one. */
export function readPriorPartitionPaths(root) {
  return readPartitionPaths(join(root, 'RFC-ROOT-Dirs-Tree.json'));
}

/** Read the partition the analysis fixed, from the origin spec it published. */
export function readFixedPartitionPaths(root) {
  const specPath = join(reservedReverseDirectory(root), RESERVED_ORIGIN_SPEC_FILE_NAME.replace(/\.md$/, '.json'));
  return readPartitionPaths(specPath, SPEC_PARTITION_KEY);
}

/**
 * A partition document's paths, or why it could not be read.
 *
 * Absence and unreadability are kept apart because they are different findings. A
 * subject with no prior partition is pattern 1, and Step 6 skips to Step 7. A prior
 * partition that is present and corrupt is a different fact, and one the reader has
 * to act on. Returning null for both would allow a broken prior to pass as a project that
 * never had one — the substitution `scope.mjs` names as failure mode F3 in its most
 * expensive form.
 */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function readPartitionPaths(path, partitionKey = null) {
  if (!existsSync(path)) return { paths: null, finding: null };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { paths: collectPartitionPaths(partitionKey === null ? parsed : parsed[partitionKey] ?? parsed), finding: null };
  } catch (error) {
    return { paths: null, finding: `${path} is present and could not be read (${error.message})` };
  }
}

/**
 * The difference between two partitions, both directions kept apart.
 *
 * @returns {{prior: string[]|null, fixed: string[]|null, onlyPrior: string[], onlyFixed: string[], shared: string[], findings: string[]}}
 */
export function computeSeam({ prior, fixed } = {}) {
  const findings = [prior?.finding, fixed?.finding].filter((finding) => finding !== null && finding !== undefined);
  const priorPaths = prior?.paths ?? null;
  const fixedPaths = fixed?.paths ?? null;

  if (priorPaths === null || fixedPaths === null) {
    return { prior: priorPaths === null ? null : [...priorPaths].sort(), fixed: fixedPaths === null ? null : [...fixedPaths].sort(), onlyPrior: [], onlyFixed: [], shared: [], findings };
  }
  const onlyPrior = [...priorPaths].filter((path) => !fixedPaths.has(path)).sort();
  const onlyFixed = [...fixedPaths].filter((path) => !priorPaths.has(path)).sort();
  const shared = [...priorPaths].filter((path) => fixedPaths.has(path)).sort();
  return { prior: [...priorPaths].sort(), fixed: [...fixedPaths].sort(), onlyPrior, onlyFixed, shared, findings };
}

/** The findings as the advice an operator acts on, naming what could not be read. */
export function renderSeamAdvice(findings) {
  const lines = ['The seam cannot be reported: a partition document could not be read.'];
  for (const finding of findings) lines.push(`  Which: ${finding}`);
  lines.push('What to do: repair the document or move it aside, and run the same command again. A');
  lines.push('  partition that is present and unreadable is not a subject without one.');
  return `${lines.join('\n')}\n`;
}

/** The seam as Markdown, or the statement that there is none to record. */
export function renderSeam(seam, { root }) {
  if (seam.prior === null) {
    return `# Seam\n\nSubject: \`${root}\`\n\nNo seam: the subject carries no prior partition, so there is no discontinuity to record. This is pattern 1, and Step 6 skips to Step 7.\n`;
  }
  if (seam.fixed === null) {
    return `# Seam\n\nSubject: \`${root}\`\n\nNo seam yet: the analysis has not published a partition, so there is nothing to compare the prior one against. Record the seam after Step 2 has run.\n`;
  }

  const lines = [
    '# Seam',
    '',
    `Subject: \`${root}\``,
    `Prior partition: ${seam.prior.length} entries. Fixed partition: ${seam.fixed.length} entries.`,
    '',
    '| Direction | Package path |',
    '|---|---|',
  ];
  for (const path of seam.onlyPrior) lines.push(`| only in the prior partition | \`${path}\` |`);
  for (const path of seam.onlyFixed) lines.push(`| only in the fixed partition | \`${path}\` |`);
  if (seam.onlyPrior.length === 0 && seam.onlyFixed.length === 0) {
    lines.push('| — | the two partitions name the same paths |');
  }
  lines.push('', `Shared: ${seam.shared.length} paths.`);
  return `${lines.join('\n')}\n`;
}
