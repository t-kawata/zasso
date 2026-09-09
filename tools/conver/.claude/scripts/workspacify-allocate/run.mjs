// [::TICKET::] PX-191 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-191 --for-spec --no-implementation-order`.
/**
 * /workspacify-allocate command entry (corrected ALLOCATE).
 *
 * The node process performs only deterministic work. The session drives it
 * with subcommands: validate, plan, packet, gate, finalize. finalize is the
 * single atomic publication: it re-runs every gate, stages the directory tree
 * plus one RFC-SEED.md per package, publishes with rollback, reload-verifies,
 * and reports. No WORKSPACIFY-ALLOCATE-MANIFEST.json is ever created.
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { EXIT_CODES, WorkSpacifyTreeError } from '../workspacify-tree/lib/errors.mjs';
import { validateAgainstSchema } from '../workspacify-tree/lib/manifest-schema.mjs';

import { loadTreeManifest, checkAllocateEntryGate, readManifestSource } from './lib/tree-manifest-input.mjs';
import { buildDirectoryPlan } from './lib/directory-plan.mjs';
import { checkPlannedPathSafety } from './lib/path-safety.mjs';
import { checkExistingOutputPolicy, createStagingRoot, materializeDirectories, verifyStaging, publishStagedTree, verifyDirectorySet } from './lib/tree-staging.mjs';
import { deriveExpectedAllocation } from './lib/allocation-model.mjs';
import { buildAuthoringPacket } from './lib/seed-authoring-packet.mjs';
import { SEED_FILE_NAME } from './lib/seed-model.mjs';
import { renderSeed } from './lib/seed-render.mjs';
import { parseSeed } from './lib/seed-parse.mjs';
import { runSeedParity } from './lib/seed-parity.mjs';
import { runSeedLocalChecks } from './lib/seed-local-checks.mjs';

const DECISIONS_SCHEMA_PATH = fileURLToPath(new URL('./schemas/workspacify-allocate-decisions.schema.json', import.meta.url));

function guide(message) {
  process.stderr.write(`[guide] ${message}\n`);
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function optionValue(args, flag) {
  const prefix = `${flag}=`;
  const entry = args.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : undefined;
}

function loadLockedInput(manifestPath) {
  const absPath = path.resolve(manifestPath);
  const manifest = loadTreeManifest(absPath);
  const manifestDir = path.dirname(absPath);
  const entryGate = checkAllocateEntryGate(manifest, manifestDir);
  if (!entryGate.ok) {
    throw new WorkSpacifyTreeError(entryGate.errors.join('; '), { gateId: 'G0' });
  }
  const source = readManifestSource(manifest, manifestDir);
  return { manifest, manifestDir, sourceText: source.sourceText, sourceHash: source.sourceHash };
}

function loadDecisions(decisionsPath) {
  const absPath = path.resolve(decisionsPath);
  let decisions;
  try {
    decisions = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch {
    throw new WorkSpacifyTreeError(`decisions file is not readable JSON: ${absPath}`, { gateId: 'G3' });
  }
  const schema = JSON.parse(readFileSync(DECISIONS_SCHEMA_PATH, 'utf8'));
  const report = validateAgainstSchema(decisions, schema);
  if (!report.valid) {
    throw new WorkSpacifyTreeError(report.errors.map((entry) => entry.message).join('; '), { gateId: 'G3' });
  }
  return decisions;
}

function packageSeedTextByDecision(decisions, packageId) {
  const entry = (decisions.seeds ?? []).find((seed) => seed.packageId === packageId);
  return entry?.aiSections ?? null;
}

function renderAllSeeds({ manifest, expectedByPackage, decisions }) {
  const packages = manifest.workspace?.packages ?? [];
  const parsedByPackage = new Map();
  const renderedByPackage = new Map();
  for (const pkg of packages) {
    if (pkg.seed_required === false) {
      continue;
    }
    const aiSections = packageSeedTextByDecision(decisions, pkg.id);
    if (!aiSections) {
      throw new WorkSpacifyTreeError(`decisions is missing seed content for package ${pkg.id}`, { gateId: 'G3' });
    }
    const expectedAllocation = expectedByPackage.get(pkg.id) ?? [];
    const { seedText } = renderSeed({ package: pkg, manifest, expectedAllocation, aiSections });
    const parsed = parseSeed(seedText);
    const local = runSeedLocalChecks({ parsedSeed: parsed, package: pkg, expectedAllocation });
    if (!local.ok) {
      throw new WorkSpacifyTreeError(`seed ${pkg.id} local checks failed: ${local.errors.join('; ')}`, { gateId: 'G3' });
    }
    parsedByPackage.set(pkg.id, parsed.allocationIndexRows);
    renderedByPackage.set(pkg.id, { seedText, package: pkg });
  }
  const parity = runSeedParity({ expectedByPackage, parsedByPackage });
  if (!parity.ok) {
    throw new WorkSpacifyTreeError(`seed parity failed: ${JSON.stringify(parity)}`, { gateId: 'G4' });
  }
  return { parsedByPackage, renderedByPackage };
}

function assertSemanticApproval(decisions) {
  if (decisions.semantic_review?.status !== 'APPROVED') {
    throw new WorkSpacifyTreeError('semantic_review.status must be APPROVED before seeds can be finalized', { gateId: 'G5' });
  }
}

export function runValidate(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('validate requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, manifestDir, sourceHash } = loadLockedInput(manifestPath);
  emit({ status: 'PASS', workspaceRoot: manifestDir, sourceHash, manifestHash: manifest.integrity.manifest_hash, gateSummary: 'G0:PASS G1:PASS' });
  guide('Validate PASS: the manifest and its co-located specification are locked. Next: run plan.');
}

export function runPlan(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('plan requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, manifestDir } = loadLockedInput(manifestPath);
  const plan = buildDirectoryPlan({ tree: manifest.workspace?.tree, packages: manifest.workspace?.packages });
  if (!plan.consistent) {
    throw new WorkSpacifyTreeError(plan.errors.join('; '), { gateId: 'G2' });
  }
  const safety = checkPlannedPathSafety({ root: manifestDir, relativeDirs: plan.relativeDirs });
  if (!safety.ok) {
    throw new WorkSpacifyTreeError(safety.unsafe.map((entry) => `${entry.path}: ${entry.reason}`).join('; '), { gateId: 'G2.2' });
  }
  const policy = checkExistingOutputPolicy(manifestDir, plan.relativeDirs);
  if (!policy.ok) {
    throw new WorkSpacifyTreeError(policy.reason, { gateId: 'G2.4', exitCode: EXIT_CODES.FAIL });
  }
  emit({ status: 'PASS', plannedDirectoryCount: plan.relativeDirs.length, relativeDirs: plan.relativeDirs, gateSummary: 'G2:PASS' });
  guide('Plan PASS: the directory plan is safe and the workspace is fresh. Next: author the decisions input.');
}

export function runPacket(args) {
  const manifestPath = args[1];
  if (!manifestPath) {
    throw new WorkSpacifyTreeError('packet requires exactly one <path-to-WORKSPACIFY-TREE-MANIFEST.json>', { gateId: 'G0' });
  }
  const { manifest, sourceText } = loadLockedInput(manifestPath);
  const requested = optionValue(args, '--package');
  const targets = requested ? [requested] : (manifest.workspace?.packages ?? []).map((pkg) => pkg.id);
  const packets = targets.map((packageId) => buildAuthoringPacket({ manifest, sourceText, packageId }));
  emit({ packets });
  guide('Packet PASS: authoring material printed for the requested packages. Next: write the decisions input from this material.');
}

export function runGate(args) {
  const manifestPath = args[1];
  const decisionsPath = optionValue(args, '--decisions');
  if (!manifestPath || !decisionsPath) {
    throw new WorkSpacifyTreeError('gate requires <manifest> and --decisions=<path>', { gateId: 'G3' });
  }
  const { manifest } = loadLockedInput(manifestPath);
  const decisions = loadDecisions(decisionsPath);
  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace?.ownership?.entries ?? [], packages: manifest.workspace?.packages ?? [] });
  renderAllSeeds({ manifest, expectedByPackage, decisions });
  assertSemanticApproval(decisions);
  emit({ status: 'COMPLETE', gateSummary: 'G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS semantic:APPROVED' });
  guide('Gate PASS: every automatic gate is green and the AI semantic approval is recorded. Next: run finalize to publish.');
}

export function runFinalize(args) {
  const manifestPath = args[1];
  const decisionsPath = optionValue(args, '--decisions');
  if (!manifestPath || !decisionsPath) {
    throw new WorkSpacifyTreeError('finalize requires <manifest> and --decisions=<path>', { gateId: 'G3' });
  }
  const { manifest, manifestDir } = loadLockedInput(manifestPath);
  const decisions = loadDecisions(decisionsPath);
  const packages = manifest.workspace?.packages ?? [];

  const plan = buildDirectoryPlan({ tree: manifest.workspace?.tree, packages });
  if (!plan.consistent) {
    throw new WorkSpacifyTreeError(plan.errors.join('; '), { gateId: 'G2' });
  }
  const safety = checkPlannedPathSafety({ root: manifestDir, relativeDirs: plan.relativeDirs });
  if (!safety.ok) {
    throw new WorkSpacifyTreeError(safety.unsafe.map((entry) => `${entry.path}: ${entry.reason}`).join('; '), { gateId: 'G2.2' });
  }
  const policy = checkExistingOutputPolicy(manifestDir, plan.relativeDirs);
  if (!policy.ok) {
    throw new WorkSpacifyTreeError(policy.reason, { gateId: 'G2.4' });
  }

  const { expectedByPackage } = deriveExpectedAllocation({ ownershipEntries: manifest.workspace?.ownership?.entries ?? [], packages });
  const { renderedByPackage } = renderAllSeeds({ manifest, expectedByPackage, decisions });
  assertSemanticApproval(decisions);

  const staging = createStagingRoot(manifestDir);
  try {
    materializeDirectories(staging.path, plan.relativeDirs);
    const staged = verifyStaging(staging.path, plan.relativeDirs);
    if (!staged.ok) {
      throw new WorkSpacifyTreeError(`staging verification failed: ${JSON.stringify(staged)}`, { gateId: 'G6.1' });
    }
    for (const { package: pkg, seedText } of renderedByPackage.values()) {
      writeFileSync(path.join(staging.path, pkg.path, SEED_FILE_NAME), seedText, 'utf8');
    }
    const published = publishStagedTree(staging.path, manifestDir, plan.relativeDirs);
    if (!published.published) {
      throw new WorkSpacifyTreeError(published.reason, { gateId: 'G6.6' });
    }
  } catch (error) {
    rmSync(staging.path, { recursive: true, force: true });
    throw error;
  }

  // Reload verification: rescan the tree, re-read every seed, re-run parity.
  const reloadDirs = verifyDirectorySet(manifestDir, plan.relativeDirs);
  if (!reloadDirs.ok) {
    throw new WorkSpacifyTreeError(`reload directory scan failed: ${JSON.stringify(reloadDirs)}`, { gateId: 'G6.4' });
  }
  const parsedByPackage = new Map();
  for (const { package: pkg } of renderedByPackage.values()) {
    const seedPath = path.join(manifestDir, pkg.path, SEED_FILE_NAME);
    const parsed = parseSeed(readFileSync(seedPath, 'utf8'));
    const expectedAllocation = expectedByPackage.get(pkg.id) ?? [];
    const local = runSeedLocalChecks({ parsedSeed: parsed, package: pkg, expectedAllocation });
    if (!local.ok) {
      throw new WorkSpacifyTreeError(`reload seed ${pkg.id} local checks failed: ${local.errors.join('; ')}`, { gateId: 'G6.5' });
    }
    parsedByPackage.set(pkg.id, parsed.allocationIndexRows);
  }
  const reloadParity = runSeedParity({ expectedByPackage, parsedByPackage });
  if (!reloadParity.ok) {
    throw new WorkSpacifyTreeError(`reload seed parity failed: ${JSON.stringify(reloadParity)}`, { gateId: 'G6.5' });
  }

  emit({
    published: true,
    workspaceRoot: manifestDir,
    inputManifestHash: manifest.integrity.manifest_hash,
    directoryCount: plan.relativeDirs.length,
    packageCount: packages.length,
    seedCount: renderedByPackage.size,
    gateSummary: 'G0:PASS G2:PASS G3:PASS G4:PASS G5:PASS G6:PASS semantic:APPROVED',
  });
  guide('Finalize PASS: the workspace tree and one RFC-SEED.md per package were atomically published and reload-verified. No WORKSPACIFY-ALLOCATE-MANIFEST.json was created.');
}

const SUBCOMMANDS = {
  validate: runValidate,
  plan: runPlan,
  packet: runPacket,
  gate: runGate,
  finalize: runFinalize,
};

function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];
  const handler = SUBCOMMANDS[subcommand];
  if (!handler) {
    guide('Usage: run.mjs <validate|plan|packet|gate|finalize> <path-to-WORKSPACIFY-TREE-MANIFEST.json> [--decisions=<path>] [--package=<id>]');
    process.exit(EXIT_CODES.USAGE);
  }
  try {
    handler(args);
  } catch (error) {
    if (error instanceof WorkSpacifyTreeError) {
      emit({ status: 'FAIL', gateId: error.gateId, reason: error.message });
      guide(`The command stopped at gate ${error.gateId}. Reason: ${error.message}. A failed run never publishes or overwrites workspace content.`);
      process.exit(error.exitCode ?? EXIT_CODES.FAIL);
    }
    emit({ status: 'FAIL', gateId: 'GENERAL', reason: error.message });
    guide(`Unexpected failure: ${error.message}`);
    process.exit(EXIT_CODES.FAIL);
  }
}

// Allow in-process unit tests to import and drive handlers without running main.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
