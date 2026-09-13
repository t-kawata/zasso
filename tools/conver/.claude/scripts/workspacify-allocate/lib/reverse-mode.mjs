// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
/**
 * Reverse mode for /workspacify-allocate: the A1 to A6 gates and the safety inversion.
 *
 * The forward rotation guarantees that nothing pre-exists (`fresh-workspace only`)
 * and publishes by renaming each top-level directory into place. In the reverse
 * direction that same rename would move the very `src/` and `tests/` this phase
 * exists to preserve. So the guarantee is re-tensioned rather than dropped:
 * everything must pre-exist, every planned path must be on disk, and a single
 * extra path stops the run. The strength is the same; the direction is inverted.
 *
 * Nothing here can rename. That is not a rule the code follows carefully, it is a
 * property of the code: the module reaches no rename primitive and never calls the
 * staged publisher, and `safety-inversion.test.mjs` asserts that by reading this
 * file. A run that cannot rename cannot destroy a tree.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { GATE_STATUS, WorkSpacifyTreeError } from '../../workspacify-tree/lib/errors.mjs';
import { REVERSE_PROVENANCE_FIELD } from '../../workspacify-tree/lib/reverse-mode.mjs';
import { MEASURED_TREE_EXCLUSIONS } from '../../workspacify-tree/lib/structure-parity.mjs';
import { determineSeedFormat, parseSeed, reportSeedCompatibility, scanSeedHeadings, seedPackageName } from './seed-parse.mjs';
import { runSeedParity } from './seed-parity.mjs';
import {
  ALLOCATE_MANIFEST_FILE_NAME,
  SEED_COMPATIBILITY_FILE_NAME,
  SEED_FILE_NAME,
  SEED_REQUIRED_SECTIONS,
  currentSeedFormat,
  resolveSeedFormat,
} from './seed-model.mjs';

/** The two rotations. An input that names neither is forward. */
export const ALLOCATE_MODES = Object.freeze({ FORWARD: 'forward', REVERSE: 'reverse' });

/** Every gate of the reverse rotation, in the order they are judged. */
export const REVERSE_GATE_IDS = Object.freeze({ A1: 'A1', A2: 'A2', A3: 'A3', A4: 'A4', A5: 'A5', A6: 'A6' });

/** The only paths a reverse run may write. */
export const WRITE_ALLOW_LIST = Object.freeze([SEED_FILE_NAME, ALLOCATE_MANIFEST_FILE_NAME]);

/**
 * Directories the reverse measurement never reads as implementation.
 *
 * This is the *same* list the tree measurement uses, imported rather than
 * restated. A1 judges the plan against the tree the manifest was derived from, so
 * a second list here could only disagree with the first — and a disagreement in
 * the exclusions is not a smaller exclusion set, it is a false BLOCK on a project
 * whose only sin is having a `dist/` directory.
 */
export const EXCLUDED_DIRECTORY_NAMES = MEASURED_TREE_EXCLUSIONS;

/** The tree manifest a reverse run reads from its root. */
export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** One gate record, in the shape every gate in this repository reports. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function gateRecord(gateId, status, counts, reasons, extra = {}) {
  return { gateId, status, counts, reasons, ...extra };
}

/**
 * Which rotation an input belongs to.
 *
 * An absent mode, an unrecognised value and an explicit `forward` all mean forward:
 * the reverse additions appear only when the input has positively declared that it
 * came from the reverse rotation.
 *
 * @param {object} [input] - options object carrying `mode`
 * @returns {'forward'|'reverse'}
 */
export function resolveAllocateMode(input) {
  return input?.mode === ALLOCATE_MODES.REVERSE ? ALLOCATE_MODES.REVERSE : ALLOCATE_MODES.FORWARD;
}

/**
 * The packages that receive a seed.
 *
 * An absent `seed_required` means required: only an explicit `false` excludes a
 * package, which is how the conformance and test-support packages opt out.
 *
 * @param {Array<object>} packages - manifest packages
 * @returns {Array<object>} the packages that need a seed
 */
export function packagesRequiringSeed(packages = []) {
  return packages.filter((pkg) => pkg.seed_required !== false);
}

/**
 * A1 — the inverted safety guarantee.
 *
 * The planned and the existing directory sets must be the same set. This is the
 * exact dual of `fresh-workspace only`: forward refuses what exists, reverse
 * refuses what does not match, and both refuse to merge, overwrite or delete.
 *
 * @param {{ plannedPaths?: string[], existingPaths?: string[] }} input
 * @returns {object} gate record naming every extra and every missing path
 */
export function assertSafetyInversion({ plannedPaths = [], existingPaths = [] } = {}) {
  const planned = new Set(plannedPaths);
  const existing = new Set(existingPaths);
  const extraPaths = [...existing].filter((entry) => !planned.has(entry)).sort();
  const missingPaths = [...planned].filter((entry) => !existing.has(entry)).sort();
  const counts = { planned: planned.size, existing: existing.size, extra: extraPaths.length, missing: missingPaths.length };

  const reasons = [];
  if (extraPaths.length > 0) {
    reasons.push(`the tree holds path(s) no package claims: ${extraPaths.join(', ')}`);
  }
  if (missingPaths.length > 0) {
    reasons.push(`the plan names path(s) the tree does not hold: ${missingPaths.join(', ')}`);
  }
  const status = extraPaths.length === 0 && missingPaths.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED;
  if (status === GATE_STATUS.PASS) {
    reasons.push(`the ${planned.size} planned directories and the ${existing.size} existing directories are the same set`);
  }

  // The agreement gate authorises no write: agreeing is what lets the *seed* step
  // write, and this gate's own answer is only about the two sets.
  return gateRecord(REVERSE_GATE_IDS.A1, status, counts, reasons, { extraPaths, missingPaths, writes: [] });
}

/**
 * A2 — additions only.
 *
 * Two teeth, because the reverse direction's failure mode is destructive. Every
 * write must be on the allow-list, and the top-level directories must be exactly
 * the ones that were there before. A top-level entry that changed name is a rename,
 * and a rename is what moving `src/` out from under the project would look like.
 *
 * @param {{ writes?: Array<{path: string}>, topLevelDirectoriesBefore?: string[], topLevelDirectoriesAfter?: string[] }} input
 * @returns {object} gate record naming every forbidden write and every rename
 */
export function assertAdditionsOnly({ writes = [], topLevelDirectoriesBefore = [], topLevelDirectoriesAfter = [] } = {}) {
  const forbiddenWrites = writes
    .map((write) => write?.path)
    .filter((writePath) => typeof writePath !== 'string' || !isAllowedWrite(writePath))
    .sort();

  const before = [...topLevelDirectoriesBefore].sort();
  const after = [...topLevelDirectoriesAfter].sort();
  const vanished = before.filter((name) => !after.includes(name));
  const appeared = after.filter((name) => !before.includes(name));
  const renamedTopLevel = pairRenames(vanished, appeared);

  const reasons = [];
  if (forbiddenWrites.length > 0) {
    reasons.push(`write(s) outside the allow-list (${WRITE_ALLOW_LIST.join(', ')}): ${forbiddenWrites.join(', ')}`);
  }
  for (const rename of renamedTopLevel) {
    reasons.push(`top-level entry "${rename.before ?? '(nothing)'}" became "${rename.after ?? '(nothing)'}" — reverse mode never renames a top-level entry`);
  }
  const status = forbiddenWrites.length === 0 && renamedTopLevel.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED;
  if (status === GATE_STATUS.PASS) {
    reasons.push(`${writes.length} write(s), all inside the allow-list, and the ${before.length} top-level directories are unchanged`);
  }

  return gateRecord(
    REVERSE_GATE_IDS.A2,
    status,
    { writes: writes.length, forbidden_writes: forbiddenWrites.length, top_level_before: before.length, top_level_after: after.length, renames: renamedTopLevel.length },
    reasons,
    { forbiddenWrites, renamedTopLevel },
  );
}

/**
 * C002 — exactly one seed in every package that needs one.
 *
 * Placement is judged separately from the write allow-list: a seed written to
 * `vendor/pjsip/` is inside the allow-list by file name and still in the wrong
 * place, and only this check can say so.
 *
 * @param {{ packages?: Array<object>, placedSeedPaths?: string[] }} input
 * @returns {object} gate record naming every absent, duplicated and unplanned seed
 */
export function assertSeedPlacement({ packages = [], placedSeedPaths = [] } = {}) {
  const required = packagesRequiringSeed(packages);
  const requiredByPath = new Map(required.map((pkg) => [pkg.path, pkg]));
  const seedsPerPackage = new Map();
  const unplannedSeedPaths = [];

  for (const seedPath of placedSeedPaths) {
    const packagePath = path.posix.dirname(toPosix(seedPath));
    const pkg = requiredByPath.get(packagePath);
    if (!pkg) {
      unplannedSeedPaths.push(seedPath);
      continue;
    }
    seedsPerPackage.set(pkg.id, (seedsPerPackage.get(pkg.id) ?? 0) + 1);
  }

  const missingSeedPackages = required.filter((pkg) => !seedsPerPackage.has(pkg.id)).map((pkg) => pkg.id).sort();
  const duplicatedPackages = [...seedsPerPackage.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  const placedCount = placedSeedPaths.length - unplannedSeedPaths.length;

  const reasons = [];
  if (missingSeedPackages.length > 0) {
    reasons.push(`package(s) without a seed: ${missingSeedPackages.join(', ')}`);
  }
  if (duplicatedPackages.length > 0) {
    reasons.push(`package(s) carrying more than one seed: ${duplicatedPackages.join(', ')}`);
  }
  if (unplannedSeedPaths.length > 0) {
    reasons.push(`seed(s) placed outside any package: ${unplannedSeedPaths.join(', ')}`);
  }
  const status = reasons.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED;
  if (status === GATE_STATUS.PASS) {
    reasons.push(`each of the ${required.length} seed-bearing package(s) holds exactly one ${SEED_FILE_NAME}`);
  }

  return gateRecord(
    'C002',
    status,
    { expected: required.length, placed: placedCount },
    reasons,
    { missingSeedPackages, duplicatedPackages, unplannedSeedPaths },
  );
}

/**
 * A5 — the Allocation Index to ownership bijection, delegated not re-derived.
 *
 * `seed-parity.mjs` already decides this property with 0 missing, 0 duplicated and
 * 0 leaked. Re-deriving it for the reverse path would put two definitions of one
 * property in the codebase, and the second one would drift.
 *
 * @param {{ expectedByPackage: Map<string, object[]>, parsedByPackage: Map<string, object[]> }} input
 * @returns {object} gate record
 */
export function assertSeedParity({ expectedByPackage, parsedByPackage }) {
  const parity = runSeedParity({ expectedByPackage, parsedByPackage });
  const counts = {
    missing: parity.missing.length,
    extraneous: parity.extraneous.length,
    cross_package: parity.crossPackage.length,
    duplicate: parity.duplicate.length,
    unknown: parity.unknown.length,
  };

  const reasons = [];
  if (parity.ok) {
    reasons.push('the Allocation Index to ownership bijection holds: 0 missing, 0 duplicated, 0 leaked');
  }
  appendParityReason(reasons, parity.missing, 'allocated item(s) no seed claims');
  appendParityReason(reasons, parity.extraneous, 'item(s) claimed that the manifest does not allocate');
  appendParityReason(reasons, parity.crossPackage, 'item(s) claimed by the wrong package');
  appendParityReason(reasons, parity.duplicate, 'item(s) claimed twice');
  appendParityReason(reasons, parity.unknown, 'item(s) outside the manifest inventory');

  return gateRecord(
    REVERSE_GATE_IDS.A5,
    parity.ok ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED,
    counts,
    reasons,
    { parity },
  );
}

/**
 * A4 — the reverse index lives inside a section 1 the format declares, and the
 * heading count matches that format.
 *
 * A fifteenth heading is the one change that would reach the forward rotation: the
 * reverse index therefore extends the machine block of section 1 in place. The
 * expected count is read from the format the seed declares and never written as a
 * literal, so this check and the parser cannot disagree about it.
 *
 * A seed declaring a format this conver does not hold is *reported*, not refused.
 * Design 1.2 makes incompleteness the input rather than a refusal condition, so the
 * gap becomes a finding on this record and the run continues. What the finding must
 * never become is an acceptance: a seed whose declaration resolves to nothing is
 * still judged against the format this run reads, which is why the fifteenth
 * heading and the transposed title keep failing exactly as they did before.
 *
 * @param {{ seedText: string, mode?: string }} input
 * @returns {object} gate record
 */
export function assertSectionOneIndex({ seedText, mode } = {}) {
  const resolvedMode = resolveAllocateMode({ mode });
  const headings = scanSeedHeadings(seedText);
  const headingCount = headings.length;
  const requiredFormat = currentSeedFormat();

  let determinedFormat;
  try {
    determinedFormat = determineSeedFormat(seedText);
  } catch (error) {
    // A seed whose machine block is missing or malformed fails the parse that
    // already exists for it, and it fails *here* as a record rather than as an
    // exception: the run judges every gate even after one of them fails, and a
    // seed this broken must not take A5's verdict down with it.
    return gateRecord(
      REVERSE_GATE_IDS.A4,
      GATE_STATUS.BLOCKED,
      { headingCount, required_headings: requiredFormat.sections.length, mode: resolvedMode, compatible: false },
      [error.message],
      { headingCount, compatibilityFindings: [] },
    );
  }

  const declaredFormat = resolveSeedFormat(determinedFormat);
  const checkedFormat = declaredFormat ?? requiredFormat;
  const sectionsExpected = checkedFormat.sections.length;
  const formatLabel = declaredFormat === null
    ? `the format this run reads (${requiredFormat.version})`
    : `the declared format ${declaredFormat.version}`;
  const compatibilityFindings = declaredFormat?.version === requiredFormat.version
    ? []
    : [reportSeedCompatibility({
      determined: determinedFormat,
      required: requiredFormat,
      seed: seedPackageName(seedText),
    })];

  const reasons = [];
  let status = GATE_STATUS.PASS;

  if (headingCount !== sectionsExpected) {
    status = GATE_STATUS.BLOCKED;
    reasons.push(`the seed has ${headingCount} headings, but ${formatLabel} carries exactly ${sectionsExpected}`);
  }

  if (resolvedMode === ALLOCATE_MODES.REVERSE && !machineSectionCarriesReverseIndex(headings, checkedFormat)) {
    status = GATE_STATUS.BLOCKED;
    reasons.push('section 1 does not carry a reverse_index, so the reverse provenance has nowhere to be recorded');
  }

  if (compatibilityFindings.length > 0) {
    reasons.push(`recorded, not failed: this seed does not declare the format this run reads — the reconciliation is published as ${SEED_COMPATIBILITY_FILE_NAME}`);
  }

  if (status === GATE_STATUS.PASS) {
    reasons.push(`section 1 carries the reverse index inside the existing heading and the heading count is ${sectionsExpected}`);
  }

  return gateRecord(
    REVERSE_GATE_IDS.A4,
    status,
    { headingCount, required_headings: sectionsExpected, mode: resolvedMode, compatible: compatibilityFindings.length === 0 },
    reasons,
    { headingCount, compatibilityFindings },
  );
}

/**
 * A3, with A6 folded in — a packet never drops the incoming context it owes.
 *
 * The failure this catches is an omission: a package that declares consumers, whose
 * packet arrives with nothing from them. An author given that packet sees a
 * function with no visible callers and has to guess why it exists, and a guess is
 * what a ratification RFC is made of.
 *
 * A package the manifest declares nothing consumes is a different fact, and it is
 * reported rather than failed. Failing it would be a false positive on every leaf
 * of every dependency graph — and every finite graph has one — which would make a
 * reverse run unable to succeed at all.
 *
 * @param {{ packets?: Array<object>, mode?: string }} input
 * @returns {object} gate record naming every package whose excerpt was dropped
 */
export function assertIncomingDependencyExcerpt({ packets = [], mode } = {}) {
  if (resolveAllocateMode({ mode }) !== ALLOCATE_MODES.REVERSE) {
    return gateRecord(
      REVERSE_GATE_IDS.A3,
      GATE_STATUS.PASS,
      { mode: ALLOCATE_MODES.FORWARD, packets: packets.length, without_excerpt: 0 },
      ['forward mode: a packet carries no incoming-dependency excerpt, which is the normal state and not a failure'],
      { packagesWithoutExcerpt: [], packagesWithoutConsumers: [] },
    );
  }

  if (packets.length === 0) {
    return gateRecord(
      REVERSE_GATE_IDS.A3,
      GATE_STATUS.BLOCKED,
      { mode: ALLOCATE_MODES.REVERSE, packets: 0, without_excerpt: 0 },
      ['no packet was handed to the gate, so there is nothing to hand over to the author'],
      { packagesWithoutExcerpt: [], packagesWithoutConsumers: [] },
    );
  }

  // A packet says how many consumers the manifest declares for it, so the gate can
  // tell "the material was dropped" from "there was no material to carry".
  const declaredConsumers = (packet) => packet?.incoming_boundary_count ?? (packet?.incoming_dependency_excerpts ?? []).length;
  const packagesWithoutExcerpt = packets
    .filter((packet) => declaredConsumers(packet) > 0 && (packet?.incoming_dependency_excerpts ?? []).length === 0)
    .map((packet) => packet?.package?.id ?? 'unknown package')
    .sort();
  const packagesWithoutConsumers = packets
    .filter((packet) => declaredConsumers(packet) === 0)
    .map((packet) => packet?.package?.id ?? 'unknown package')
    .sort();

  const status = packagesWithoutExcerpt.length === 0 ? GATE_STATUS.PASS : GATE_STATUS.BLOCKED;
  const reasons = [];
  if (status === GATE_STATUS.PASS) {
    reasons.push(`every one of the ${packets.length} packet(s) carries the incoming-dependency excerpt it owes`);
  } else {
    reasons.push(`package(s) whose incoming-dependency excerpt was dropped, so the author cannot see why their functions exist: ${packagesWithoutExcerpt.join(', ')}`);
  }
  if (packagesWithoutConsumers.length > 0) {
    reasons.push(`recorded, not failed: nothing in the manifest consumes ${packagesWithoutConsumers.join(', ')}`);
  }

  return gateRecord(
    REVERSE_GATE_IDS.A3,
    status,
    { mode: ALLOCATE_MODES.REVERSE, packets: packets.length, without_excerpt: packagesWithoutExcerpt.length, without_consumers: packagesWithoutConsumers.length },
    reasons,
    { packagesWithoutExcerpt, packagesWithoutConsumers },
  );
}

/**
 * Judge the reverse gates over one reverse input.
 *
 * Five records, not six: A6 asks for the incoming-dependency excerpt, which is the
 * same material A3 already demands, so the acceptance table folds it in rather than
 * giving it a verdict of its own. A3's record is the verdict on both.
 *
 * Every gate is judged even after one of them fails: a run that reports only its
 * first problem hides the rest of the work the operator has to do.
 *
 * @param {object} input - the reverse input assembled by the entry point
 * @returns {Array<object>} five gate records, A1 to A5
 */
export function runReverseAllocateGates(input = {}) {
  return [
    assertSafetyInversion({ plannedPaths: input.plannedPaths, existingPaths: input.existingPaths }),
    assertAdditionsOnly({
      writes: input.writes,
      topLevelDirectoriesBefore: input.topLevelDirectoriesBefore,
      topLevelDirectoriesAfter: input.topLevelDirectoriesAfter,
    }),
    assertIncomingDependencyExcerpt({ packets: input.packets, mode: input.mode }),
    judgeEverySeed(input),
    assertSeedParity({ expectedByPackage: input.expectedByPackage ?? new Map(), parsedByPackage: input.parsedByPackage ?? new Map() }),
  ];
}

/**
 * A4 over every rendered seed: all must pass, and a single failure names itself.
 *
 * One record rather than one per seed, because the operator repairs the renderer
 * once, not each document: a fifteenth heading in any seed is the same defect.
 */
// [::TICKET::] P22-12, P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-12|P23-10) --for-spec --no-implementation-order`.
function judgeEverySeed(input) {
  const records = (input.seedTexts ?? []).map((seedText) => assertSectionOneIndex({ seedText, mode: input.mode }));
  const compatibilityFindings = records.flatMap((record) => record.compatibilityFindings ?? []);
  const counts = {
    headingCount: 0,
    required_headings: SEED_REQUIRED_SECTIONS.length,
    mode: resolveAllocateMode(input),
    requiring_reconciliation: compatibilityFindings.length,
  };

  if (records.length === 0) {
    return gateRecord(
      REVERSE_GATE_IDS.A4,
      GATE_STATUS.BLOCKED,
      counts,
      ['no seed was rendered, so there is no section 1 to carry the reverse index'],
      { headingCount: 0, compatibilityFindings: [] },
    );
  }

  const failing = records.filter((record) => record.status !== GATE_STATUS.PASS);
  const extra = { headingCount: (failing[0] ?? records[0]).headingCount, compatibilityFindings };
  if (failing.length === 0) {
    return gateRecord(
      REVERSE_GATE_IDS.A4,
      GATE_STATUS.PASS,
      { ...records[0].counts, seeds: records.length },
      [`all ${records.length} seed(s) carry the reverse index inside section 1, and every heading count matches the format it declares`],
      extra,
    );
  }

  return gateRecord(
    REVERSE_GATE_IDS.A4,
    GATE_STATUS.BLOCKED,
    { ...failing[0].counts, seeds: records.length, failing_seeds: failing.length },
    failing.flatMap((record) => record.reasons),
    extra,
  );
}

/**
 * Turn the six records into the single status the run publishes.
 *
 * `COMPLETE` keeps its forward meaning — the input packet and the artefacts met
 * the schema, the gates and the publication discipline — and does not mean the
 * reconstructed architecture is correct.
 *
 * @param {Array<object>} records
 * @returns {{status: string, records: Array<object>, failing: string[]}}
 */
export function summarizeReverseAllocateGates(records) {
  const failing = (records ?? []).filter((record) => record.status !== GATE_STATUS.PASS).map((record) => record.gateId);
  return {
    status: failing.length === 0 ? GATE_STATUS.COMPLETE : GATE_STATUS.BLOCKED,
    records: [...(records ?? [])],
    failing,
  };
}

/**
 * Render the gate outcomes as Markdown for the operator.
 *
 * The AI reads this to decide what to repair, so it is deliberately plain English
 * prose rather than a serialisation of the records.
 *
 * @param {Array<object>} records
 * @returns {string} a Markdown report
 */
export function renderReverseAllocateReport(records) {
  const summary = summarizeReverseAllocateGates(records);
  const lines = ['# Reverse-mode allocate gates', '', `Outcome: **${summary.status}**`, ''];

  for (const record of summary.records) {
    lines.push(`## ${record.gateId} — ${record.status}`);
    lines.push('');
    for (const reason of record.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  lines.push(...renderSeedCompatibilitySection(summary.records));

  if (summary.failing.length > 0) {
    lines.push(`Repair what ${summary.failing.join(', ')} reported, then run the step again. Nothing was published.`);
  } else {
    lines.push('Every gate answered PASS. The seeds and the allocate manifest were published, and no existing entry was moved.');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * The compatibility findings, published as the document they are named for.
 *
 * A seed that declares a format this conver does not hold is not refused — design
 * 1.2 makes incompleteness the input — so the reconciliation has to reach the
 * operator somewhere. It reaches them here, beside the allocate report and under
 * the finding's own published name, which is the only place the reverse rotation
 * may publish: its writes are the seeds and the manifest, and a third file would
 * be a write outside the allow-list A2 enforces.
 *
 * @param {Array<object>} records - the gate records, in the order they were judged
 * @returns {string[]} the report's lines for this section
 */
// [::TICKET::] P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-10 --for-spec --no-implementation-order`.
function renderSeedCompatibilitySection(records) {
  const findings = records.flatMap((record) => record.compatibilityFindings ?? []);
  const lines = [`## ${SEED_COMPATIBILITY_FILE_NAME}`, ''];
  if (findings.length === 0) {
    lines.push('Every seed declares the format this run reads, so there is nothing to reconcile.', '');
    return lines;
  }
  lines.push(
    `${findings.length} seed(s) do not declare the format this run reads. Each was parsed under the format it declares and the run continued; the change that would reconcile each one is stated below.`,
    '',
  );
  for (const finding of findings) {
    lines.push(finding);
  }
  return lines;
}

/**
 * The reverse index section 1 carries: where this seed came from, and what exists.
 *
 * The canonical record of uncertainty stays in the sidecar; the seed carries the
 * minimum reference it needs. Two kinds of entry go in, and both are facts read
 * from the manifest rather than judgements: the sidecar bundle the run resolved
 * against, and the measured reality of every package — its path, and whether it
 * receives a seed.
 *
 * @param {object} manifest - the stage-1 manifest, produced by the reverse tree run
 * @returns {Array<object>|null} the index, or null when the manifest records no reverse provenance
 */
export function buildReverseIndex(manifest) {
  const provenance = manifest?.[REVERSE_PROVENANCE_FIELD];
  if (!provenance) {
    return null;
  }
  const packages = manifest?.workspace?.packages ?? [];
  return [
    {
      entry_kind: 'sidecar_bundle',
      sidecar_bundle_hash: provenance.sidecar_bundle_hash,
      counts: { ...(provenance.counts ?? {}) },
    },
    ...packages.map((pkg) => ({
      entry_kind: 'existing_implementation',
      package: pkg.id,
      path: pkg.path,
      seed_required: pkg.seed_required !== false,
    })),
  ];
}

/**
 * The sidecar reference a reverse seed carries back to the canonical record.
 *
 * @param {object} manifest - the stage-1 manifest
 * @returns {{sidecar_bundle_hash: string, counts: object}|null} the reference, or null when there is none
 */
export function sidecarReferenceOf(manifest) {
  const provenance = manifest?.[REVERSE_PROVENANCE_FIELD];
  if (!provenance?.sidecar_bundle_hash) {
    return null;
  }
  return { sidecar_bundle_hash: provenance.sidecar_bundle_hash, counts: { ...(provenance.counts ?? {}) } };
}

/**
 * The directories of the measured project: every directory, minus the populations
 * the reverse rotation never counts.
 *
 * `vendor/` and `target/` are a dependency and build output, not the project's own
 * layout. Excluding them here is the same decision the tree measurement makes, and
 * it is what lets A1 judge the *plan* against the *project* rather than against the
 * build directory of the moment.
 *
 * @param {string} root - the project root
 * @returns {string[]} root-relative POSIX directory paths, sorted
 */
export function measureExistingDirectories(root) {
  const directories = [];
  const visit = (abs, rel) => {
    for (const entry of readDirectories(abs)) {
      if (EXCLUDED_DIRECTORY_NAMES.includes(entry.name)) {
        continue;
      }
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      directories.push(relPath);
      visit(path.join(abs, entry.name), relPath);
    }
  };
  visit(root, '');
  return directories.sort();
}

/**
 * Every top-level directory name under a root, exclusions included.
 *
 * A2 asks a different question from A1, so it measures differently and
 * deliberately: not "does this describe the project" but "did anything move".
 * Answering that with the exclusions switched off means a rename of `vendor/` is
 * caught too, not only a rename of a package.
 *
 * @param {string} root - the project root
 * @returns {string[]} sorted top-level directory names
 */
export function measureTopLevelDirectories(root) {
  return readDirectories(root).map((entry) => entry.name).sort();
}

/**
 * Every seed actually on disk, as root-relative POSIX paths.
 *
 * The forward rotation reload-verifies what it published. The reverse rotation has
 * no reload step — there is nothing to re-derive — but it does have to check that
 * the placement it promised is the placement it produced, and that check reads the
 * tree rather than trusting the write loop.
 *
 * @param {string} root - the project root
 * @returns {string[]} sorted seed paths
 */
export function findPlacedSeedPaths(root) {
  const found = [];
  const visit = (abs, rel) => {
    for (const directory of readDirectories(abs)) {
      if (!EXCLUDED_DIRECTORY_NAMES.includes(directory.name)) {
        visit(directory.absolute, rel ? `${rel}/${directory.name}` : directory.name);
      }
    }
    for (const file of readFileEntries(abs)) {
      if (file.name === SEED_FILE_NAME) {
        found.push(rel ? `${rel}/${file.name}` : file.name);
      }
    }
  };
  visit(root, '');
  return found.sort();
}

/**
 * Read the implementation of every package from the project tree.
 *
 * This is the material A6 exists to supply: the code of the packages that use this
 * one, so the author can see why a function exists rather than infer it. Vendored
 * dependencies and build output are deliberately not read.
 *
 * @param {string} root - the project root
 * @param {object} manifest - the stage-1 manifest
 * @returns {Map<string, Array<{path: string, text: string}>>} files by package id
 */
export function readPackageImplementations(root, manifest) {
  const byPackage = new Map();
  for (const pkg of manifest?.workspace?.packages ?? []) {
    const files = collectSourceFiles(path.join(root, pkg.path));
    if (files.length > 0) {
      byPackage.set(pkg.id, files);
    }
  }
  return byPackage;
}

/** Whether a path is inside the write allow-list: a seed file, or the manifest. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function isAllowedWrite(relPath) {
  const normalised = toPosix(relPath);
  return normalised === ALLOCATE_MANIFEST_FILE_NAME || path.posix.basename(normalised) === SEED_FILE_NAME;
}

/** Pair the entries that vanished with the entries that appeared: a rename, named. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function pairRenames(vanished, appeared) {
  const pairs = [];
  const pairCount = Math.max(vanished.length, appeared.length);
  for (let index = 0; index < pairCount; index += 1) {
    pairs.push({ before: vanished[index] ?? null, after: appeared[index] ?? null });
  }
  return pairs;
}

/** Whether the machine section of the format under check carries the reverse index. */
// [::TICKET::] P22-12, P23-10 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-12|P23-10) --for-spec --no-implementation-order`.
function machineSectionCarriesReverseIndex(headings, format) {
  const machineSection = headings.find((heading) => heading.index === format.machineSectionIndex);
  if (!machineSection) {
    return false;
  }
  const referenceBlock = parseSectionJson(machineSection.body.join('\n'));
  return referenceBlock !== null && Object.prototype.hasOwnProperty.call(referenceBlock, 'reverse_index');
}

/** The JSON block of a machine section, or null when it is absent or unparseable. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function parseSectionJson(body) {
  const match = /```json\n([\s\S]*?)```/.exec(body);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Append one parity failure class as a readable sentence. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function appendParityReason(reasons, entries = [], description) {
  if (entries.length > 0) {
    reasons.push(`${description}: ${entries.join(', ')}`);
  }
}

/** Collect the hand-written files of one package directory. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function collectSourceFiles(absDir) {
  const files = [];
  const visit = (abs) => {
    for (const directory of readDirectories(abs)) {
      if (!EXCLUDED_DIRECTORY_NAMES.includes(directory.name)) {
        visit(directory.absolute);
      }
    }
    for (const file of readFileEntries(abs)) {
      files.push({ path: file.absolute, text: readFileSync(file.absolute, 'utf8') });
    }
  };
  visit(absDir);
  return files;
}

/**
 * The child directories of one directory, name-sorted, or none when unreadable.
 *
 * Directory-ness is decided with `statSync`, which follows a symbolic link, and
 * not with the `Dirent` that `readdirSync` returns, which does not. The reverse
 * tree measurement makes the same choice, so a linked directory a package claims
 * is seen by both measurements or by neither — never by one and not the other,
 * which would report a legitimate project as missing a path it plainly has. Writes
 * stay safe because `checkPlannedPathSafety` rejects a symlinked ancestor of any
 * planned path before this runs, so a followed link can never become a write
 * outside the root.
 *
 * @param {string} abs - absolute directory to list
 * @returns {Array<{name: string, absolute: string}>} child directories
 */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function readDirectories(abs) {
  return readNames(abs).reduce((directories, name) => {
    const absolute = path.join(abs, name);
    try {
      if (statSync(absolute).isDirectory()) {
        directories.push({ name, absolute });
      }
    } catch {
      // A dangling link is not a directory this run can describe.
    }
    return directories;
  }, []);
}

/** The regular files directly inside one directory, name-sorted. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function readFileEntries(abs) {
  return readNames(abs).reduce((files, name) => {
    const absolute = path.join(abs, name);
    try {
      if (statSync(absolute).isFile()) {
        files.push({ name, absolute });
      }
    } catch {
      // An unreadable entry is not a file this run can read.
    }
    return files;
  }, []);
}

/** The entry names of one directory, sorted, or none when it cannot be read. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function readNames(abs) {
  try {
    return readdirSync(abs).sort();
  } catch {
    return [];
  }
}

/** A path with POSIX separators, whatever the host uses. */
// [::TICKET::] P22-12 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-12 --for-spec --no-implementation-order`.
function toPosix(value) {
  return String(value).split(path.sep).join('/');
}
