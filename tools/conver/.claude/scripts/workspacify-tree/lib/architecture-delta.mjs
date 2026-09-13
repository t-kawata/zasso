// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
/**
 * T5 — the separation of the logical architecture from the physical layout (§6.3).
 *
 * The physical layout is preserved, but it is not canonised as the design. The
 * candidate logical model and the measured layout are compared, and every
 * disagreement is written into `ARCHITECTURE-DELTA.json`.
 *
 * Agreement is deliberately *not* the pass condition. If it were, an existing
 * project's technical debt would be frozen into the canonical record as if it
 * had been designed, which is failure mode F14. What T5 passes on is that every
 * mismatch was recorded — including the case of no mismatch, which still
 * requires the record to exist.
 *
 * This module also builds the **layer-structure seam** a pattern-2 or pattern-3
 * subject carries. §3.4 left open whether that discontinuity belongs in the
 * `.delta.json` family the evolution loop writes, or in this record. The answer
 * recorded here, and asserted by the tests, is this record:
 *
 *   The `.delta.json` family records how an artefact changed across one drill
 *   round, which presupposes that the artefact continued to exist as the same
 *   artefact. The layer-structure change of pattern 2 is the case where it did
 *   not: the four-layer cycle is interrupted, its artefacts stop being the live
 *   cycle, and a new partition is measured over the tree. That is a
 *   discontinuity, and a receptacle whose shape is "an increment to something
 *   still running" cannot hold it without misdescribing it.
 *
 * A later ticket that measures a real discontinuity may overturn this. What would
 * overturn it is a subject on which the old artefacts demonstrably continue as the
 * live cycle across the act — which is the opposite of what §3.1 describes.
 *
 * The one rule the seam holds to is that a difference is only a difference if both
 * sides were measured the same way. §7.4 records the sub-error that makes this
 * necessary: `measureExistingDirectories` (A1, allocate) excludes the workspace
 * root while `measureDirectoryTree` (T1/T2, tree) includes it as `.`, and reading
 * the first as evidence about the second produced a wrong conclusion about root
 * ownership. Comparing the two here would report the root as both new and gone.
 */
import { readFileSync } from 'node:fs';

import { sha256Hex } from './hash.mjs';
import { GATE_STATUS, WorkSpacifyTreeError } from './errors.mjs';

/** The artefact this gate judges and the operator authors. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
export const ARCHITECTURE_DELTA_FILE_NAME = 'ARCHITECTURE-DELTA.json';

/** The gate identifier, named once so report, tests and design cannot disagree. */
export const ARCHITECTURE_DELTA_GATE_ID = 'T5';

/** The section the seam is published under, beside the mismatches T5 already reads. */
export const LAYER_STRUCTURE_CHANGE_KEY = 'layerStructureChange';

/** The five classes a package can be given. Frozen, so the count and its assertion agree. */
export const SEAM_DIFFERENCE_CLASSES = Object.freeze(['unchanged', 'split', 'merged', 'new', 'disappeared']);

/** What each side of the seam is, so a reader cannot mistake the prior for the answer. */
export const PARTITION_ROLES = Object.freeze({ PRIOR: 'prior', MEASURED: 'measured' });

/** The package path that names the whole tree. Compared for presence, never for relation. */
export const ROOT_PACKAGE_PATH = '.';

/**
 * The one measurement, named.
 *
 * A partition is a set of package paths, and the seam compares two of them. The pair is
 * only comparable when one rule produced both, so the rule travels with the record and
 * a mixed pair is refused rather than reported.
 */
export const MEASUREMENTS = Object.freeze({
  ROOT_INCLUDING: Object.freeze({ rule: 'package-path-set', rootPackagePath: ROOT_PACKAGE_PATH, includesRoot: true }),
  ROOT_EXCLUDING: Object.freeze({ rule: 'package-path-set', rootPackagePath: null, includesRoot: false }),
});

/** The F1 statement the record makes when the act changed no boundary (§2.4). */
export const ZERO_DIFFERENCE_SIGNAL = 'the act produced no boundary change; a difference of zero is a signal rather than health (F1)';

/**
 * §7.3's open question, answered here rather than left to the next reader.
 *
 * `reason` names what the other receptacle records, so the choice can be checked
 * rather than taken on trust.
 */
export const SEAM_RECEPTACLE = Object.freeze({
  file: ARCHITECTURE_DELTA_FILE_NAME,
  reason:
    'the layer-structure change is a discontinuity, not an incremental change to an artefact that continued to '
    + 'exist; the `.delta.json` family the evolution loop writes records how an artefact changed across one drill '
    + 'round, which presupposes that continuation, so the record belongs in this delta where the reverse rotation '
    + '(T5) already records what the new structure could not absorb',
});

/** The digest of a file's bytes, so a prior can be proved untouched. */
export function digestFile(absPath) {
  return sha256Hex(readFileSync(absPath));
}

/**
 * A partition's paths, in one coordinate system.
 *
 * The empty string and `./` are the root as a naive walk writes it; `.` is the root as
 * the tree measurement writes it. Folding them together here is what stops the root from
 * appearing as a disappeared/new pair in every seam ever taken.
 */
export function normalizePartitionPaths(paths) {
  const normalized = new Set();

  for (const entry of Array.isArray(paths) ? paths : []) {
    const trimmed = String(entry).replace(/^\.\//, '').replace(/\/+$/, '');
    normalized.add(trimmed === '' ? ROOT_PACKAGE_PATH : trimmed);
  }

  return [...normalized].sort();
}

/**
 * Refuse a pair that two measurements produced.
 *
 * A side may carry the measurement it was taken under. When two sides disagree, the
 * difference between them is a difference of instruments, and reporting it as a
 * difference of partitions is the §7.4 sub-error repeated with the record's authority
 * behind it.
 */
export function assertSingleMeasurement({ measurement, partitions }) {
  for (const partition of partitions ?? []) {
    if (partition?.measurement === undefined || partition.measurement === null) continue;
    if (partition.measurement === measurement) continue;
    throw new WorkSpacifyTreeError(
      `the seam's two partitions were measured under two rules: ${measurement.rule} (root `
      + `${measurement.rootPackagePath ?? 'excluded'}) for the seam, and ${partition.measurement.rule} (root `
      + `${partition.measurement.rootPackagePath ?? 'excluded'}) for ${partition.source ?? 'a partition'}. `
      + 'Two measurements answer two different questions, and the difference between them is not a boundary change',
      { gateId: ARCHITECTURE_DELTA_GATE_ID },
    );
  }
}

/** True when `candidate` lies strictly beneath `packagePath`, the root excluded. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function isStrictlyBeneath(candidate, packagePath) {
  if (packagePath === ROOT_PACKAGE_PATH) return false;
  const normalized = String(packagePath).replace(/\/+$/, '');
  return normalized.length > 0 && candidate.startsWith(`${normalized}/`);
}

/**
 * Classify every path in the union of two partitions, exactly once.
 *
 *   unchanged    present in both, with no package drawn beneath it since
 *   split        a boundary that was drawn finer: the path gained new sub-packages, or
 *                an old package vanished and packages now stand where it stood, or this
 *                package was carved out of an old one that no longer holds it alone
 *   merged       several old boundaries collapsed into one new package that is not the root
 *   new          a package with no old boundary containing it
 *   disappeared  an old package with no package standing in its place
 *
 * The root is compared for presence only. Every path in a partition lies beneath the
 * root, so counting that relation would report every seam ever taken as a merge.
 */
export function classifyPartitionDifference({ oldPaths, newPaths }) {
  const oldSet = new Set(normalizePartitionPaths(oldPaths));
  const newSet = new Set(normalizePartitionPaths(newPaths));
  const union = [...new Set([...oldSet, ...newSet])].sort();

  const difference = { unchanged: [], split: [], merged: [], new: [], disappeared: [] };
  const lists = {
    unchanged: difference.unchanged,
    split: difference.split,
    merged: difference.merged,
    new: difference.new,
    disappeared: difference.disappeared,
  };

  for (const path of union) {
    const inOld = oldSet.has(path);
    const inNew = newSet.has(path);
    const newBeneath = [...newSet].filter((candidate) => isStrictlyBeneath(candidate, path));
    const oldBeneath = [...oldSet].filter((candidate) => isStrictlyBeneath(candidate, path));

    if (inOld && inNew) {
      const drawnFiner = newBeneath.some((candidate) => !oldSet.has(candidate));
      lists[drawnFiner ? 'split' : 'unchanged'].push(path);
      continue;
    }
    if (inOld) {
      lists[newBeneath.length > 0 ? 'split' : 'disappeared'].push(path);
      continue;
    }

    const vanishedBeneath = oldBeneath.filter((candidate) => !newSet.has(candidate));
    if (path !== ROOT_PACKAGE_PATH && vanishedBeneath.length >= 2) {
      lists.merged.push(path);
    } else if (vanishedBeneath.length === 1) {
      lists.split.push(path);
    } else {
      lists.new.push(path);
    }
  }

  return difference;
}

/** The count of each class, so the report and the assertion read one arithmetic. */
export function countPartitionDifference(difference) {
  return Object.fromEntries(SEAM_DIFFERENCE_CLASSES.map((kind) => [kind, difference[kind].length]));
}

/** The mismatches the seam contributes to T5, in the shape the gate already reads. */
export function seamMismatches(difference) {
  return SEAM_DIFFERENCE_CLASSES
    .filter((kind) => kind !== 'unchanged')
    .flatMap((kind) => difference[kind].map((path) => ({ kind, path })));
}

/**
 * The prior partition, read from the subject's old Dirs-Tree.
 *
 * The artefact is read as material and never as the answer (§3.2). An absent one is
 * reported as absent rather than substituted with an empty partition: an empty prior
 * would make the new partition look like a wholly new one, which is a different claim.
 */
export function readPriorPartition(dirsTreePath) {
  let text;
  try {
    text = readFileSync(dirsTreePath, 'utf8');
  } catch {
    return {
      present: false,
      source: dirsTreePath,
      paths: [],
      reason: `no prior partition existed at ${dirsTreePath}`,
    };
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new WorkSpacifyTreeError(`${dirsTreePath} is not valid JSON: ${error.message}`, {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
    });
  }

  const paths = [];
  for (const tree of Object.values(document?.trees ?? {})) {
    collectDirectoryPaths(tree, '', paths);
  }

  return {
    present: true,
    source: dirsTreePath,
    paths: normalizePartitionPaths(paths),
    reason: null,
  };
}

/** Every directory node of a Dirs-Tree, as a root-relative path. */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
function collectDirectoryPaths(node, prefix, found) {
  if (!node || typeof node !== 'object') return;

  const name = typeof node.name === 'string' ? node.name : '';
  const here = prefix === '' ? name : `${prefix}/${name}`;
  if (node.type === 'directory' && here.length > 0) found.push(here);

  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectDirectoryPaths(child, here, found);
  }
}

/**
 * The seam: the old partition, the new partition, and the difference between them.
 *
 * The old column is labelled as the prior whose coarseness is the reason for the act, and
 * the new one as measured, because a record permitting the old column to be read as the
 * answer would freeze the too-coarse boundaries into the new canon — F3, in the form §3.2
 * calls the one that bites.
 */
export function buildLayerStructureSeam({ oldPartition, newPartition, measurement }) {
  if (!oldPartition || oldPartition.present === undefined) {
    // Presence has to be declared, not inferred from an empty path list. A prior that
    // was never read and a prior that read as empty are different findings, and the
    // second would report a wholly new partition where the first reports no seam.
    throw new WorkSpacifyTreeError(
      'the old partition must declare whether a prior was present: pass the result of readPriorPartition, or an '
      + 'object carrying present: true or present: false',
      { gateId: ARCHITECTURE_DELTA_GATE_ID },
    );
  }

  const prior = oldPartition;
  const measured = newPartition ?? { source: null, paths: [] };

  assertSingleMeasurement({ measurement, partitions: [prior, measured] });

  if (prior.present !== true) {
    return {
      receptacle: SEAM_RECEPTACLE.file,
      receptacleReason: SEAM_RECEPTACLE.reason,
      priorPresent: false,
      measurement: { ...measurement, appliesTo: 'both partitions' },
      oldPartition: { role: PARTITION_ROLES.PRIOR, source: prior.source, paths: [], priorPresent: false },
      newPartition: { role: PARTITION_ROLES.MEASURED, source: measured.source, paths: normalizePartitionPaths(measured.paths) },
      difference: null,
      counts: null,
      mismatches: [],
      boundaryChanged: false,
      signal: `${prior.reason ?? 'no prior partition was present'}; there is no seam to take against nothing`,
    };
  }

  const oldPaths = normalizePartitionPaths(prior.paths);
  const newPaths = normalizePartitionPaths(measured.paths);
  const difference = classifyPartitionDifference({ oldPaths, newPaths });
  const counts = countPartitionDifference(difference);
  const mismatches = seamMismatches(difference);
  const boundaryChanged = mismatches.length > 0;

  return {
    receptacle: SEAM_RECEPTACLE.file,
    receptacleReason: SEAM_RECEPTACLE.reason,
    priorPresent: true,
    measurement: { ...measurement, appliesTo: 'both partitions' },
    oldPartition: { role: PARTITION_ROLES.PRIOR, source: prior.source, paths: oldPaths, priorPresent: true },
    newPartition: { role: PARTITION_ROLES.MEASURED, source: measured.source, paths: newPaths },
    difference,
    counts,
    mismatches,
    boundaryChanged,
    signal: boundaryChanged ? null : ZERO_DIFFERENCE_SIGNAL,
  };
}

/**
 * The prior must still be the artefact the seam was taken against.
 *
 * A run that rewrote the old Dirs-Tree and then measured a difference against it would
 * be reporting agreement with itself. The digest is the check, and the failure names the
 * path so the artefact is locatable rather than merely suspected.
 */
export function assertPriorUnchanged({ path, beforeDigest, afterDigest }) {
  if (beforeDigest !== afterDigest) {
    throw new WorkSpacifyTreeError(
      `${path} changed while the seam was being taken: its digest was ${beforeDigest} before the run and `
      + `${afterDigest} after it. The old partition is a prior, so a seam measured against a modified one is a `
      + 'comparison with the run itself',
      { gateId: ARCHITECTURE_DELTA_GATE_ID },
    );
  }
}

/**
 * The delta document, with the seam added and the operator's mismatches kept.
 *
 * The seam's differences are appended to `mismatches` because that list is what T5
 * judges: a boundary the act redrew is a logical/physical mismatch of exactly the kind
 * the gate records, and putting it only in the structured section would leave T5 passing
 * over a document that did not mention it. The structured section is kept beside it, so
 * a reader can see the two partitions the mismatches were taken between.
 *
 * The append is keyed, so re-running over the same pair adds nothing: a record that grew
 * by four every run would be a record nobody could compare across runs.
 */
export function mergeSeamIntoDelta(delta, seam) {
  const existing = [...(delta?.mismatches ?? [])];
  const alreadyRecorded = new Set(existing.map(mismatchKey));
  const fromSeam = (seam?.mismatches ?? []).filter((mismatch) => !alreadyRecorded.has(mismatchKey(mismatch)));

  return {
    ...(delta ?? {}),
    mismatches: [...existing, ...fromSeam],
    [LAYER_STRUCTURE_CHANGE_KEY]: seam,
  };
}

/** The seam as Markdown, for the operator who decides what to do about it. */
export function renderLayerStructureSeam(seam) {
  const lines = ['', `## Layer-structure change — ${seam.receptacle}`, ''];

  if (!seam.priorPresent) {
    lines.push(`- ${seam.signal}.`, '');
    return lines.join('\n');
  }

  lines.push(
    `- old partition, the prior: \`${seam.oldPartition.source}\` — ${seam.oldPartition.paths.length} package(s)`,
    `- new partition, measured: \`${seam.newPartition.source}\` — ${seam.newPartition.paths.length} package(s)`,
    '- The old partition is the prior whose coarseness is the reason for the act, and it is never the answer the '
    + 'new partition was meant to match.',
    '- Both columns were measured under one rule '
    + `(\`${seam.measurement.rule}\`, root \`${seam.measurement.rootPackagePath ?? 'excluded'}\`), because two `
    + 'measurements answering two different questions produce a difference that is not a boundary change.',
    `- Recorded here rather than in the \`.delta.json\` family: ${seam.receptacleReason}.`,
    '',
  );

  if (!seam.boundaryChanged) {
    lines.push(`- ${seam.signal}.`, '');
    return lines.join('\n');
  }

  for (const kind of SEAM_DIFFERENCE_CLASSES) {
    const paths = seam.difference[kind];
    lines.push(`- ${kind}: ${paths.length}${paths.length > 0 ? ` — ${paths.map((path) => `\`${path}\``).join(', ')}` : ''}`);
  }
  lines.push('');

  return lines.join('\n');
}

/** A mismatch is identified by both its direction and the path it concerns. */
export function mismatchKey(mismatch) {
  return `${mismatch.kind}:${mismatch.path}`;
}

/**
 * Split a difference set into the part the record names and the part it does not.
 *
 * @param {{differences?: Array<object>, recorded?: Array<object>}} input
 * @returns {{differences: Array<object>, recorded: Array<object>, unrecorded: Array<object>}}
 */
export function recordArchitectureDelta({ differences, recorded }) {
  const differencesList = [...(differences ?? [])];
  const recordedList = [...(recorded ?? [])];
  const recordedKeys = new Set(recordedList.map(mismatchKey));
  const unrecorded = differencesList.filter((difference) => !recordedKeys.has(mismatchKey(difference)));
  return { differences: differencesList, recorded: recordedList, unrecorded };
}

/**
 * T5 — every mismatch between the logical model and the physical layout is recorded.
 *
 * @param {{differences?: Array<object>, recorded?: Array<object>, deltaFileExists?: boolean}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], unrecorded: string[]}}
 */
export function assertDeltaRecorded({ differences, recorded, deltaFileExists }) {
  const { unrecorded } = recordArchitectureDelta({ differences, recorded });
  const counts = { differences: (differences ?? []).length, unrecorded: unrecorded.length };

  if (!deltaFileExists) {
    return {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
      status: GATE_STATUS.FAIL,
      counts,
      reasons: [
        `${ARCHITECTURE_DELTA_FILE_NAME} does not exist. A run with zero mismatches still requires the record, because the record is the artefact that says the layout was examined rather than assumed`,
      ],
      unrecorded: unrecorded.map((mismatch) => mismatch.path),
    };
  }

  if (unrecorded.length > 0) {
    return {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
      status: GATE_STATUS.FAIL,
      counts,
      reasons: unrecorded.map(
        (mismatch) =>
          `${mismatch.path} is a ${mismatch.kind} mismatch that ${ARCHITECTURE_DELTA_FILE_NAME} does not record, so the difference would pass unnoticed`,
      ),
      unrecorded: unrecorded.map((mismatch) => mismatch.path),
    };
  }

  return {
    gateId: ARCHITECTURE_DELTA_GATE_ID,
    status: GATE_STATUS.PASS,
    counts,
    reasons: [
      counts.differences === 0
        ? `${ARCHITECTURE_DELTA_FILE_NAME} records that the logical model and the physical layout were compared and no mismatch was found`
        : `all ${counts.differences} mismatch(es) are recorded in ${ARCHITECTURE_DELTA_FILE_NAME}`,
    ],
    unrecorded: [],
  };
}

/**
 * Read the authored record.
 *
 * An absent file is reported as absent rather than substituted with an empty
 * record: inventing one would make T5 pass on a record nobody wrote.
 *
 * @param {string} absPath - absolute path to ARCHITECTURE-DELTA.json
 * @returns {{exists: boolean, mismatches: Array<object>}}
 */
export function loadArchitectureDelta(absPath) {
  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch {
    return { exists: false, mismatches: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new WorkSpacifyTreeError(`${ARCHITECTURE_DELTA_FILE_NAME} is not valid JSON: ${error.message}`, {
      gateId: ARCHITECTURE_DELTA_GATE_ID,
    });
  }

  if (!Array.isArray(parsed?.mismatches)) {
    throw new WorkSpacifyTreeError(
      `${ARCHITECTURE_DELTA_FILE_NAME} must carry a "mismatches" array; found ${JSON.stringify(parsed)}`,
      { gateId: ARCHITECTURE_DELTA_GATE_ID },
    );
  }

  return { exists: true, mismatches: parsed.mismatches };
}
