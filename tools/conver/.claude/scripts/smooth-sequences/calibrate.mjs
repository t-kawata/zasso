/**
 * Calibration — the positive control for the smooth-sequences detector.
 *
 * A zero-finding run is not a measurement unless the detector has been shown to fire. This
 * command copies the workspace's manifests, artifact, views and RFCs to a temporary tree,
 * seeds one defect per check family, and runs the real detector against each copy. No
 * design file is written; the only live write is CALIBRATION.json. A seed whose defect is
 * not reported makes the calibration fail, and a closure run without a valid calibration
 * is unproven.
 *
 * [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestValue } from '../sequences-slice/lib/digest.mjs';
import { mapDigest, parseDistributionMap, renderDistributionMap } from '../sequences-slice/lib/distribution-map.mjs';
import { evaluateCheckRegistry } from './lib/check-registry.mjs';
import { indexArtifact } from './lib/index.mjs';
import { loadWorkspace } from './lib/workspace.mjs';

export const CALIBRATION_DIRECTORY = 'smooth-sequences';
export const CALIBRATION_FILE_NAME = 'CALIBRATION.json';
export const CALIBRATION_SCHEMA_VERSION = 1;
const MINIMUM_SEEDS = 4;

const TREE_MANIFEST = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
const ARTIFACT_SUFFIX = '-sequences.json';
const VIEW_FILE = 'SEQUENCES.json';
const RFC_FILE = 'RFC.md';

/** The single root artifact name. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function findArtifactName(root) {
  const candidates = readdirSync(root).filter((name) => name.endsWith(ARTIFACT_SUFFIX));
  return candidates.length === 1 ? candidates[0] : null;
}

/** Copy the files `loadWorkspace` reads into a temporary root. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function copyCalibrationWorkspace(root) {
  const treeManifest = JSON.parse(readFileSync(join(root, TREE_MANIFEST), 'utf8'));
  const artifactName = findArtifactName(root);
  if (artifactName === null) throw new Error('CALIBRATION_NO_ARTIFACT');
  const sandboxRoot = mkdtempSync(join(tmpdir(), 'smooth-calibration-'));
  for (const name of [TREE_MANIFEST, ALLOCATE_MANIFEST, artifactName]) {
    writeFileSync(join(sandboxRoot, name), readFileSync(join(root, name)));
  }
  const packages = [];
  for (const record of treeManifest.workspace?.packages ?? []) {
    const sourceDirectory = join(root, record.path);
    const targetDirectory = join(sandboxRoot, record.path);
    mkdirSync(targetDirectory, { recursive: true });
    for (const name of [VIEW_FILE, RFC_FILE]) {
      const source = join(sourceDirectory, name);
      if (existsSync(source)) writeFileSync(join(targetDirectory, name), readFileSync(source));
    }
    packages.push({ id: record.id, path: record.path, viewPath: join(targetDirectory, VIEW_FILE), rfcPath: join(targetDirectory, RFC_FILE) });
  }
  return { root: sandboxRoot, artifactPath: join(sandboxRoot, artifactName), packages };
}

/** The package copies that carry a readable view. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function viewCopies(sandbox) {
  return sandbox.packages.filter((pkg) => existsSync(pkg.viewPath));
}

/** The package copies that carry a readable RFC. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function rfcCopies(sandbox) {
  return sandbox.packages.filter((pkg) => existsSync(pkg.rfcPath));
}

/** Rewrite one RFC's distribution-map block. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function replaceMap(rfcText, map) {
  const next = { ...map, digest: mapDigest(map) };
  return rfcText.replace(/```json distribution-map[\s\S]*?```/m, renderDistributionMap(next));
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function seedMissingStep(sandbox) {
  let chosenSequenceId = null;
  let chosenStepIds = null;
  for (const pkg of viewCopies(sandbox)) {
    const view = JSON.parse(readFileSync(pkg.viewPath, 'utf8'));
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of view[field] ?? []) {
        if (Array.isArray(unit.steps) && unit.steps.length > 0) {
          chosenSequenceId = unit.sequenceId;
          chosenStepIds = new Set(unit.steps.map((step) => step.stepId));
          break;
        }
      }
      if (chosenSequenceId !== null) break;
    }
    if (chosenSequenceId !== null) break;
  }
  if (chosenSequenceId === null) return false;

  for (const pkg of viewCopies(sandbox)) {
    const view = JSON.parse(readFileSync(pkg.viewPath, 'utf8'));
    let changed = false;
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of view[field] ?? []) {
        if (unit.sequenceId !== chosenSequenceId || !Array.isArray(unit.steps)) continue;
        const next = unit.steps.filter((step) => !chosenStepIds.has(step.stepId));
        if (next.length !== unit.steps.length) {
          unit.steps = next;
          changed = true;
        }
      }
    }
    if (changed) writeFileSync(pkg.viewPath, `${JSON.stringify(view, null, 2)}\n`);
  }
  return true;
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function seedStepOrder(sandbox) {
  const artifact = JSON.parse(readFileSync(sandbox.artifactPath, 'utf8'));
  const stepsBySequence = new Map();
  for (const step of artifact.steps ?? []) {
    const steps = stepsBySequence.get(step.sequence) ?? [];
    steps.push(step);
    stepsBySequence.set(step.sequence, steps);
  }
  for (const pkg of viewCopies(sandbox)) {
    const view = JSON.parse(readFileSync(pkg.viewPath, 'utf8'));
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of view[field] ?? []) {
        const steps = (stepsBySequence.get(unit.sequenceId) ?? []).slice().sort((left, right) => (left.order ?? left.line ?? 0) - (right.order ?? right.line ?? 0));
        if (steps.length < 2) continue;
        unit.steps = steps.slice(0, 2).map((step, index) => ({
          order: index === 0 ? 2 : 1,
          stepId: step.id,
          operationId: step.operation,
          line: step.line,
        }));
        writeFileSync(pkg.viewPath, `${JSON.stringify(view, null, 2)}\n`);
        return true;
      }
    }
  }
  return false;
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function seedActiveResidual(sandbox) {
  const artifact = JSON.parse(readFileSync(sandbox.artifactPath, 'utf8'));
  const active = (artifact.operations ?? []).find((operation) => operation.disposition === 'active'
    && operation.position !== 'suppliedRule');
  if (active === undefined) return false;
  for (const pkg of rfcCopies(sandbox)) {
    const rfc = readFileSync(pkg.rfcPath, 'utf8');
    const parsed = parseDistributionMap(rfc);
    if (!parsed.ok || parsed.map === null) continue;
    const map = {
      ...parsed.map,
      residuals: [...(parsed.map.residuals ?? []), {
        unit: `op-${active.id}`,
        kind: 'declared-residual',
        owners: ['calibration'],
        location: 'calibration',
        ground: 'calibration seed',
      }],
    };
    writeFileSync(pkg.rfcPath, replaceMap(rfc, map));
    return true;
  }
  return false;
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function seedStaleMap(sandbox) {
  for (const pkg of rfcCopies(sandbox)) {
    const rfc = readFileSync(pkg.rfcPath, 'utf8');
    const parsed = parseDistributionMap(rfc);
    if (!parsed.ok || parsed.map === null) continue;
    writeFileSync(pkg.rfcPath, replaceMap(rfc, { ...parsed.map, sourceViewDigest: '0'.repeat(64) }));
    return true;
  }
  return false;
}

// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function seedMissingBoundary(sandbox) {
  for (const pkg of viewCopies(sandbox)) {
    const view = JSON.parse(readFileSync(pkg.viewPath, 'utf8'));
    const boundary = (view.obligationUnits ?? []).find((unit) => unit.relation === 'carries' && typeof unit.subject === 'string');
    if (boundary === undefined || !existsSync(pkg.rfcPath)) continue;
    const rfc = readFileSync(pkg.rfcPath, 'utf8');
    writeFileSync(pkg.rfcPath, rfc.split(boundary.subject).join('calibration-removed-boundary'));
    return true;
  }
  return false;
}

const SEEDS = Object.freeze([
  { checkId: 'S7.sequence-steps-undistributed', seededDefect: 'remove one step from a step-bearing sequence record', apply: seedMissingStep },
  { checkId: 'S7.sequence-step-order', seededDefect: 'write two artifact steps in reversed order', apply: seedStepOrder },
  { checkId: 'S7.active-operation-residual', seededDefect: 'park an active operation as a declared residual', apply: seedActiveResidual },
  { checkId: 'S7.distribution-map', seededDefect: 'replace sourceViewDigest with a stale digest', apply: seedStaleMap },
  { checkId: 'S7.rfc-boundary-missing', seededDefect: 'remove the boundary name from the package RFC', apply: seedMissingBoundary },
]);

/**
 * Run every seed against a fresh copy of the workspace.
 *
 * @param {{ root: string, now?: string }} input
 * @returns {{ schemaVersion: number, measuredAt: string, seeds: Array<object>, digest: string }}
 */
export function runCalibration({ root, now = new Date().toISOString() }) {
  const seeds = [];
  for (const seed of SEEDS) {
    const sandbox = copyCalibrationWorkspace(root);
    try {
      const applicable = seed.apply(sandbox);
      if (!applicable) {
        seeds.push({ checkId: seed.checkId, seededDefect: seed.seededDefect, applicable: false, detected: false, findings: [] });
        continue;
      }
      const index = indexArtifact(loadWorkspace(sandbox.root));
      const findings = evaluateCheckRegistry(index).findings;
      seeds.push({
        checkId: seed.checkId,
        seededDefect: seed.seededDefect,
        applicable: true,
        detected: findings.some((finding) => finding.checkId === seed.checkId),
        findings: [...new Set(findings.map((finding) => finding.checkId))].sort(),
      });
    } finally {
      rmSync(sandbox.root, { recursive: true, force: true });
    }
  }
  const calibration = {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    measuredAt: now,
    seeds,
    digest: digestValue({ seeds }),
  };
  mkdirSync(join(root, CALIBRATION_DIRECTORY), { recursive: true });
  writeFileSync(join(root, CALIBRATION_DIRECTORY, CALIBRATION_FILE_NAME), `${JSON.stringify(calibration, null, 2)}\n`);
  return calibration;
}

/** The calibration file, or null when it is absent or malformed. */
export function readCalibration(root) {
  const filePath = join(root, CALIBRATION_DIRECTORY, CALIBRATION_FILE_NAME);
  if (!existsSync(filePath)) return null;
  try {
    const calibration = JSON.parse(readFileSync(filePath, 'utf8'));
    const digestValid = calibration.digest === digestValue({ seeds: calibration.seeds ?? [] });
    return { ...calibration, digestValid };
  } catch {
    return null;
  }
}

/** Whether the calibration proves the detector can fire. */
export function calibrationVerdict(calibration) {
  if (calibration === null || calibration === undefined) {
    return { ok: false, code: 'CALIBRATION_MISSING' };
  }
  if (calibration.digestValid === false) {
    return { ok: false, code: 'CALIBRATION_FAILED' };
  }
  const seeds = Array.isArray(calibration.seeds) ? calibration.seeds : [];
  if (seeds.length < MINIMUM_SEEDS || seeds.some((seed) => seed.detected !== true)) {
    return { ok: false, code: 'CALIBRATION_FAILED' };
  }
  return { ok: true };
}
