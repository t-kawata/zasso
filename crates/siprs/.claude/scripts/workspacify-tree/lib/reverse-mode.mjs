// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
/**
 * Reverse mode for /workspacify-tree: mode resolution, T6, and the six-gate runner.
 *
 * The mode is decided by the input; an input without a `mode` field is forward.
 * Everything the reverse rotation adds lives inside `mode === "reverse"`, so the
 * forward rotation cannot observe any of it.
 *
 * T6 records where the reverse partition came from. It adds exactly one field —
 * `reverse_provenance`, holding the sidecar bundle hash and a count summary — and
 * changes neither the meaning of `COMPLETE` nor the normalisation of
 * `manifest_hash`. In forward mode the field is deliberately absent, and its
 * absence is the normal state rather than a failure.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { canonicalSerialize } from './canonical-json.mjs';
import { GATE_STATUS, WorkSpacifyTreeError } from './errors.mjs';
import { sha256Hex } from './hash.mjs';
import { assertDeltaRecorded } from './architecture-delta.mjs';
import {
  assertGrounding,
  assertNoBehaviouralLoss,
  assertStructureParity,
  measureImplementationOrder,
} from './structure-parity.mjs';

/** The two rotations. */
// [::TICKET::] P22-11 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-11 --for-spec --no-implementation-order`.
export const TREE_MODES = Object.freeze({ FORWARD: 'forward', REVERSE: 'reverse' });

/** Every gate of the reverse rotation, in the order they are judged. */
export const REVERSE_GATE_IDS = Object.freeze({ T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5', T6: 'T6' });

/** The one field reverse mode adds to the manifest. */
export const REVERSE_PROVENANCE_FIELD = 'reverse_provenance';

/** Resolve the rotation from the input, defaulting to forward. */
export function resolveTreeMode(input) {
  return input?.mode === TREE_MODES.REVERSE ? TREE_MODES.REVERSE : TREE_MODES.FORWARD;
}

/**
 * Hash each sidecar so the bundle hash stands for their contents.
 *
 * @param {Array<{name?: string, path: string}>} sidecarFiles
 * @returns {Array<{name: string, hash: string}>} name-sorted digests
 */
export function digestSidecarFiles(sidecarFiles) {
  return (sidecarFiles ?? [])
    .map((file) => {
      const name = file.name ?? basename(file.path);
      let bytes;
      try {
        bytes = readFileSync(file.path);
      } catch {
        throw new WorkSpacifyTreeError(`the sidecar ${name} could not be read at ${file.path}`, { gateId: 'T6' });
      }
      return { name, hash: sha256Hex(bytes) };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** The single hash that stands for the whole sidecar bundle. */
export function computeSidecarBundleHash(digests) {
  return sha256Hex(Buffer.from(canonicalSerialize(digests ?? []), 'utf8'));
}

/**
 * T6 — add reverse provenance, and only in reverse mode.
 *
 * In forward mode the very same object is returned, so the manifest that is
 * assembled from it is byte-identical to the one the forward rotation produced
 * before this ticket existed.
 *
 * @param {object} sections - the manifest sections about to be assembled
 * @param {{mode?: string, sidecarBundleHash?: string, counts?: object}} input
 * @returns {object} the sections to assemble
 */
export function addReverseProvenance(sections, { mode, sidecarBundleHash, counts = {} } = {}) {
  if (resolveTreeMode({ mode }) === TREE_MODES.FORWARD) {
    return sections;
  }
  return {
    ...sections,
    [REVERSE_PROVENANCE_FIELD]: {
      sidecar_bundle_hash: sidecarBundleHash,
      counts: { ...counts },
    },
  };
}

/**
 * T6 — the recorded provenance must resolve against the sidecars on disk.
 *
 * @param {{mode?: string, reverseProvenance?: object, sidecarFiles?: Array<object>}} input
 * @returns {{gateId: string, status: string, counts: object, reasons: string[], unresolvable: string[]}}
 */
export function assertProvenanceRecorded({ mode, reverseProvenance, sidecarFiles }) {
  const resolvedMode = resolveTreeMode({ mode });
  const files = sidecarFiles ?? [];

  if (resolvedMode === TREE_MODES.FORWARD) {
    return {
      gateId: REVERSE_GATE_IDS.T6,
      status: GATE_STATUS.PASS,
      counts: { mode: TREE_MODES.FORWARD, reverse_provenance: 0, sidecars: files.length },
      reasons: [`forward mode: ${REVERSE_PROVENANCE_FIELD} is deliberately absent, which is the normal state and not a failure`],
      unresolvable: [],
    };
  }

  if (!reverseProvenance) {
    return {
      gateId: REVERSE_GATE_IDS.T6,
      status: GATE_STATUS.FAIL,
      counts: { mode: TREE_MODES.REVERSE, reverse_provenance: 0, sidecars: files.length },
      reasons: [`the run is in reverse mode but ${REVERSE_PROVENANCE_FIELD} was not added to the manifest`],
      unresolvable: [],
    };
  }

  if (files.length === 0) {
    return {
      gateId: REVERSE_GATE_IDS.T6,
      status: GATE_STATUS.FAIL,
      counts: { mode: TREE_MODES.REVERSE, reverse_provenance: 1, sidecars: 0 },
      reasons: ['no sidecar was supplied, so the recorded sidecar bundle hash resolves against nothing'],
      unresolvable: [],
    };
  }

  const recordedHash = reverseProvenance.sidecar_bundle_hash;
  const observedHash = computeSidecarBundleHash(digestSidecarFiles(files));
  if (recordedHash !== observedHash) {
    return {
      gateId: REVERSE_GATE_IDS.T6,
      status: GATE_STATUS.FAIL,
      counts: { mode: TREE_MODES.REVERSE, reverse_provenance: 1, sidecars: files.length },
      reasons: [
        `the recorded sidecar bundle hash ${recordedHash} does not resolve: the ${files.length} sidecar(s) on disk hash to ${observedHash}`,
      ],
      unresolvable: [recordedHash],
    };
  }

  return {
    gateId: REVERSE_GATE_IDS.T6,
    status: GATE_STATUS.PASS,
    counts: { mode: TREE_MODES.REVERSE, reverse_provenance: 1, sidecars: files.length },
    reasons: [`${REVERSE_PROVENANCE_FIELD} resolves against ${files.length} sidecar(s) on disk`],
    unresolvable: [],
  };
}

/**
 * Judge T1 to T6 over one reverse input.
 *
 * Every gate is judged, even after one of them fails: a run that reports only
 * its first problem hides the rest of the work the operator has to do.
 *
 * The seam a pattern-2 or pattern-3 subject carries is judged by T5 as well, because a
 * boundary the act redrew is a logical/physical mismatch of the kind T5 records. The
 * seam is optional: an input without one is judged exactly as it was before this
 * existed, so the forward-shaped cases keep their counts.
 *
 * @param {object} input - the reverse input assembled by the entry point
 * @returns {Array<object>} six gate records in T1 to T6 order
 */
// [::TICKET::] P23-9 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-9 --for-spec --no-implementation-order`.
export function runReverseGates(input = {}) {
  const manifest = input.manifest ?? {};
  const packages = manifest.workspace?.packages ?? [];
  const measured = input.measured ?? {};

  const parityRecord = assertStructureParity({
    packagePaths: packages.map((pkg) => pkg.path),
    measuredDirectories: measured.directories,
  });

  // The physical/logical mismatch this ticket can name is the parity difference:
  // generating and adjudicating a candidate logical model is P22-20's work.
  const differences = [
    ...parityRecord.extras.map((path) => ({ kind: 'extra', path })),
    ...parityRecord.missing.map((path) => ({ kind: 'missing', path })),
    ...(input.seam?.mismatches ?? []),
  ];
  const delta = input.delta ?? {};

  return [
    parityRecord,
    assertNoBehaviouralLoss({ packages, sourceFiles: measured.sourceFiles }),
    assertGrounding({ nodes: input.graph?.nodes, resolveFilePath: input.resolveFilePath ?? ((file) => file) }),
    measureImplementationOrder({
      packages,
      measuredEdges: measured.edges,
      manifestOrder: manifest.dependencies?.dag?.implementation_order,
    }),
    assertDeltaRecorded({ differences, recorded: delta.mismatches, deltaFileExists: delta.exists }),
    assertProvenanceRecorded({
      mode: input.mode,
      reverseProvenance: input.reverseProvenance ?? manifest[REVERSE_PROVENANCE_FIELD],
      sidecarFiles: input.sidecarFiles,
    }),
  ];
}

/**
 * Turn the six records into the single status the run publishes.
 *
 * COMPLETE keeps its forward meaning: the input packet and the artefacts met
 * the schema, the gates and the publication discipline. It does not mean the
 * reconstructed architecture is correct.
 *
 * @param {Array<object>} records
 * @returns {{status: string, records: Array<object>, failing: string[]}}
 */
export function summarizeReverseGates(records) {
  const failing = (records ?? []).filter((record) => record.status !== GATE_STATUS.PASS).map((record) => record.gateId);
  return {
    status: failing.length === 0 ? GATE_STATUS.COMPLETE : GATE_STATUS.FAIL,
    records: [...(records ?? [])],
    failing,
  };
}

/**
 * Render the gate outcomes as Markdown for the operator.
 *
 * The AI reads this to decide what to repair, so it is deliberately plain
 * English prose rather than a serialisation of the records.
 *
 * @param {Array<object>} records
 * @returns {string} a Markdown report
 */
export function renderReverseReport(records) {
  const summary = summarizeReverseGates(records);
  const lines = ['# Reverse-mode tree gates', '', `Outcome: **${summary.status}**`, ''];

  for (const record of summary.records) {
    lines.push(`## ${record.gateId} — ${record.status}`);
    lines.push('');
    for (const reason of record.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  if (summary.failing.length > 0) {
    lines.push(`Repair what ${summary.failing.join(', ')} reported, then run the step again. Nothing was published.`);
  } else {
    lines.push('Every gate answered PASS. The manifest was published with its reverse provenance.');
  }
  lines.push('');
  return lines.join('\n');
}
