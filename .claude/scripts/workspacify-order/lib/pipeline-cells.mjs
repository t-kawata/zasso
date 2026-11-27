// [::TICKET::] PX-309 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-309 --for-spec --no-implementation-order`.
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
// pipeline-cells.mjs — one package's pipeline fields as data, and the marks they rest on.
//
// The text plan and the conver header read the same cells here. This module imports only
// the readers that produce those marks; it deliberately does not import levels.mjs, whose
// implementation-order derivation is not needed to answer a stage question and whose
// dynamic require cannot be bundled into the conver command.

import { join } from 'node:path';

import {
  SEQUENCE_VERDICT_COMPLETE,
  SEQUENCE_VERDICT_FAILED,
} from '../../sequences-slice/lib/package-verdict.mjs';
import {
  readBoundifyGeneration,
  readDistributionGeneration,
  readGraphGeneration,
  readGrillGeneration,
  readRootEduceGeneration,
  readRootSmoothGeneration,
  readSplitGeneration,
} from './counters.mjs';
import { readSequenceVerdicts } from './verdicts.mjs';
import {
  artifactStem,
  holdsAllocateManifest,
  holdsBoundifyArtifact,
  holdsExplanation,
  holdsGraphArtifact,
  holdsRfc,
  holdsSplitArtifact,
  holdsTreeManifest,
} from './workspace.mjs';

/** The full-width glyphs the pipeline fields carry, in pipeline order. */
export const EDU_GLYPH = '🟤';
export const EXPLANATION_GLYPH = '🔴';
export const GRILL_GLYPH = '🟠';
export const SEQUENCE_GLYPH = '🟡';
export const FAILED_SEQUENCE_GLYPH = '❌';
export const SMOOTH_GLYPH = '🟢';
export const GRAPH_GLYPH = '🔵';
export const BOUNDIFY_GLYPH = '🟣';
export const SPLIT_GLYPH = '⚫️';

/** The two workspace-stage marks: the root manifests the first two commands wrote. */
export const WTR_GLYPH = '◻️';
export const WTR_TEXT = 'WTR';
export const WAL_GLYPH = '◻️';
export const WAL_TEXT = 'WAL';

/** The word the explanation field carries: a document mark, not a count. */
export const EXPLANATION_TEXT = 'EXP';

/** The three downstream fields are document marks: the artifact each command wrote. */
export const GRAPH_TEXT = 'GRA';
export const BOUNDIFY_TEXT = 'BOU';
export const SPLIT_TEXT = 'SPL';

/**
 * The four counted fields whose labels were literals inside their cell builders.
 *
 * They are named here so `PIPELINE_LABELS` can state the key -> label rule for every
 * field, including a field a package has not reached yet, without a second spelling.
 */
export const EDUCATION_TEXT = 'EDU';
export const GRILL_TEXT = 'GRI';
export const SEQUENCE_TEXT = 'SEQ';
export const SMOOTH_TEXT = 'SMO';

/**
 * The value a numeric field prints when no record exists.
 *
 * A question mark keeps the `KEY:VALUE` shape on every line and, unlike 0 or 1, does not
 * assert a number the workspace never recorded.
 */
export const UNKNOWN_COUNT = '?';

/** The field order is the pipeline order, so a line reads left to right as the work happened. */
export const FIELD_SEQUENCE = Object.freeze(['wtr', 'wal', 'edu', 'exp', 'gri', 'seq', 'smo', 'gra', 'bou', 'spl']);

/**
 * The canonical label of every pipeline field, keyed by the FIELD_SEQUENCE key.
 *
 * A present cell already carries its label in the rendered text; an absent cell has no
 * text, so the label must be stated here. Both forms then answer the same question.
 */
export const PIPELINE_LABELS = Object.freeze({
  wtr: WTR_TEXT,
  wal: WAL_TEXT,
  edu: EDUCATION_TEXT,
  exp: EXPLANATION_TEXT,
  gri: GRILL_TEXT,
  seq: SEQUENCE_TEXT,
  smo: SMOOTH_TEXT,
  gra: GRAPH_TEXT,
  bou: BOUNDIFY_TEXT,
  spl: SPLIT_TEXT,
});

/** Five columns, two rows; the paired rows share every column's width. */
export const FIELD_COLUMNS = 5;
export const FIELD_ROWS = FIELD_SEQUENCE.length / FIELD_COLUMNS;
/** Emoji presentation occupies two terminal columns. */
export const EMOJI_COLUMNS = 2;

/**
 * One field of a package line, or null when the directory carries no answer for it.
 *
 * The field order follows the pipeline: the root generations bracket the work, the
 * explanation precedes the grill, and the grill precedes the distribution. The first two
 * per-directory fields are documents; the third is a verdict with two spellings. A counter
 * is used when the producer recorded one; when it did not, the field prints `?` so the line
 * keeps one shape and never invents a number.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function generationCell(generation, glyph, label) {
  return generation === null || generation === undefined
    ? null
    : { glyph, text: `${label}:${generation}` };
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function artifactCell(present, glyph, label, generation) {
  if (!present) return null;
  return generationCell(generation, glyph, label) ?? { glyph, text: `${label}:${UNKNOWN_COUNT}` };
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function educationCell(model) {
  return generationCell(model.rootCounters.edu, EDU_GLYPH, EDUCATION_TEXT);
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function explanationCell(model, id) {
  return model.explainedIds.has(id) ? { glyph: EXPLANATION_GLYPH, text: EXPLANATION_TEXT } : null;
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function grillCell(model, id) {
  const generation = generationCell(model.grillGenerations.get(id), GRILL_GLYPH, GRILL_TEXT);
  if (generation !== null) return generation;
  return model.grilledIds.has(id) ? { glyph: GRILL_GLYPH, text: `${GRILL_TEXT}:${UNKNOWN_COUNT}` } : null;
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function sequenceCell(model, id) {
  const verdict = model.sequenceVerdicts.get(id);
  const judged = verdict?.state === SEQUENCE_VERDICT_COMPLETE || verdict?.state === SEQUENCE_VERDICT_FAILED;
  const generation = model.distributionGenerations.get(id) ?? null;
  if (generation === null && !judged) return null;
  const value = generation === null ? UNKNOWN_COUNT : String(generation);
  const glyph = verdict?.state === SEQUENCE_VERDICT_FAILED ? FAILED_SEQUENCE_GLYPH : SEQUENCE_GLYPH;
  return { glyph, text: `${SEQUENCE_TEXT}:${value}` };
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function smoothCell(model) {
  return generationCell(model.rootCounters.smo, SMOOTH_GLYPH, SMOOTH_TEXT);
}

/**
 * A workspace-stage mark, or null when the workspace root lacks that manifest.
 *
 * The mark carries a label and no count: the manifest is either there or not, so an
 * absent mark is omitted rather than printed as zero. The pair is workspace-level, so
 * every package prints the same answer.
 */
// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function manifestCell(present, glyph, label) {
  return present ? { glyph, text: label } : null;
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function treeManifestCell(model) {
  return manifestCell(model.rootManifests.tree, WTR_GLYPH, WTR_TEXT);
}

// [::TICKET::] PX-460 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-460 --for-spec --no-implementation-order`.
function allocateManifestCell(model) {
  return manifestCell(model.rootManifests.allocate, WAL_GLYPH, WAL_TEXT);
}

/** The single resolver from a field key to its cell; both surfaces read through it. */
export function cellFor(model, id, key) {
  switch (key) {
    case 'wtr': return treeManifestCell(model);
    case 'wal': return allocateManifestCell(model);
    case 'edu': return educationCell(model);
    case 'exp': return explanationCell(model, id);
    case 'gri': return grillCell(model, id);
    case 'seq': return sequenceCell(model, id);
    case 'smo': return smoothCell(model);
    case 'gra': return artifactCell(model.graphifiedIds.has(id), GRAPH_GLYPH, GRAPH_TEXT, model.graphGenerations.get(id));
    case 'bou': return artifactCell(model.boundifiedIds.has(id), BOUNDIFY_GLYPH, BOUNDIFY_TEXT, model.boundifyGenerations.get(id));
    case 'spl': return artifactCell(model.splitIds.has(id), SPLIT_GLYPH, SPLIT_TEXT, model.splitGenerations.get(id));
    default: return null;
  }
}

/**
 * The packages a tree manifest names, reduced to the identity the pipeline marks need.
 *
 * `buildModel` validates the manifest in full; a display-only caller still needs the same
 * id/path pairs, so this is the one tolerant reading of that list rather than a second
 * parser per surface. A malformed entry is skipped, never guessed.
 *
 * @param {unknown} treeManifest
 * @returns {Array<{ id: string, path: string }>}
 */
export function readManifestPackages(treeManifest) {
  const list = treeManifest && typeof treeManifest === 'object'
    ? treeManifest.workspace?.packages
    : null;
  if (!Array.isArray(list)) return [];
  return list
    .filter((pkg) => pkg && typeof pkg.id === 'string' && typeof pkg.path === 'string')
    .map((pkg) => ({ id: pkg.id, path: pkg.path }));
}

/**
 * The marks every pipeline cell is derived from, read once for a workspace.
 *
 * `buildModel` spreads this result into its model, so the plan and the conver header
 * cannot disagree about whether a stage ran or how many times. The caller supplies the
 * package list; this function never re-derives the order.
 *
 * @param {{ root: string, packages: Array<{ id: string, path: string }> }} input
 */
export function readPipelineStageMarks({ root, packages }) {
  const explainedIds = new Set(
    packages.filter((pkg) => holdsExplanation({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const grilledIds = new Set(
    packages.filter((pkg) => holdsRfc({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const sequenceVerdicts = readSequenceVerdicts({ root, packages });
  // The counters are read once per package, beside the documents they qualify. A package
  // with no record answers null, which the renderer reads as unknown rather than zero.
  const rootCounters = {
    edu: readRootEduceGeneration(root),
    smo: readRootSmoothGeneration(root),
  };
  // The first two pipeline stages are root-level. Both manifests are required for the
  // command to run at all, so a runnable workspace prints both marks on every package.
  const rootManifests = {
    tree: holdsTreeManifest(root),
    allocate: holdsAllocateManifest(root),
  };
  const grillGenerations = new Map(
    packages.map((pkg) => [pkg.id, readGrillGeneration(join(root, pkg.path))]),
  );
  const distributionGenerations = new Map(
    packages.map((pkg) => [pkg.id, readDistributionGeneration(join(root, pkg.path))]),
  );
  const graphifiedIds = new Set(
    packages.filter((pkg) => holdsGraphArtifact({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const boundifiedIds = new Set(
    packages.filter((pkg) => holdsBoundifyArtifact({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const splitIds = new Set(
    packages.filter((pkg) => holdsSplitArtifact({ root, packagePath: pkg.path })).map((pkg) => pkg.id),
  );
  const graphGenerations = new Map(packages.map((pkg) => [pkg.id, readGraphGeneration(
    join(root, pkg.path),
    artifactStem({ root, packagePath: pkg.path }),
  )]));
  const boundifyGenerations = new Map(packages.map((pkg) => [pkg.id, readBoundifyGeneration(
    join(root, pkg.path),
    artifactStem({ root, packagePath: pkg.path }),
  )]));
  const splitGenerations = new Map(packages.map((pkg) => [pkg.id, readSplitGeneration(
    join(root, pkg.path),
    artifactStem({ root, packagePath: pkg.path }),
  )]));
  return {
    explainedIds,
    grilledIds,
    sequenceVerdicts,
    rootCounters,
    rootManifests,
    grillGenerations,
    distributionGenerations,
    graphifiedIds,
    boundifiedIds,
    splitIds,
    graphGenerations,
    boundifyGenerations,
    splitGenerations,
  };
}

/**
 * One package's pipeline cells as data rather than rendered text.
 *
 * Every field keeps its canonical label, whether it is present, its optional count and
 * whether the producer recorded an unknown count. The workspacify-order workspace is the
 * single source: a consumer that compacts these cells cannot disagree with the plan this
 * module's caller prints.
 *
 * @param {object} model — a built model or a `readPipelineStageMarks` result
 * @param {string} id — the package id
 * @returns {Array<{ key: string, label: string, glyph: string|null, count: number|null,
 *   present: boolean, unknownCount: boolean }>}
 */
export function readPipelineCells(model, id) {
  return FIELD_SEQUENCE.map((key) => {
    const label = PIPELINE_LABELS[key];
    const cell = cellFor(model, id, key);
    if (cell === null) {
      return { key, label, glyph: null, count: null, present: false, unknownCount: false };
    }
    const separator = cell.text.indexOf(':');
    const rawCount = separator === -1 ? null : cell.text.slice(separator + 1);
    const unknownCount = rawCount === UNKNOWN_COUNT;
    return {
      key,
      label,
      glyph: cell.glyph,
      count: rawCount === null || unknownCount ? null : Number(rawCount),
      present: true,
      unknownCount,
    };
  });
}
