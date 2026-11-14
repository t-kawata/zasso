// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// @verifies C011
/**
 * Canonical *-okf skill verifier, check-set v1.
 *
 * dev        source -> manifest -> lock -> OKF -> report -> dist
 * installed  installed-tree invariants and installed runtime
 *
 * `machine_verified` is the only pass. A dev-only check without --source-root
 * is `unverifiable`; installed mode never claims source re-derivation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkBoundary,
  checkCitation,
  checkConflicts,
  checkConformance,
  checkContainment,
  checkContext,
  checkCoverage,
  checkDeterminism,
  checkDistribution,
  checkFreshness,
  checkGraph,
  checkGraphReach,
  checkGuidanceDeterminism,
  checkIndexlog,
  checkLayer,
  checkLibrary,
  checkLint,
  checkLock,
  checkManifest,
  checkNavigation,
  checkPerformance,
  checkProfile,
  checkProvenance,
  checkRegistry,
  checkRetrieval,
  checkSources,
  checkStyle,
  checkTraversalEnvelope,
  checkFrontierCompleteness,
  checkFacetSufficiency,
  checkTrust,
  checkUsage,
  checkUnknownId,
} from './okf-verify/checks-artifact.mjs';
import {
  checkInstaller,
  checkRuntime,
  checkTests,
} from './okf-verify/checks-runtime.mjs';
import {
  CHECK_CONTRACT,
  CHECK_SET_VERSION,
  VERIFIER_CHECKS,
  closureSha256,
  notRun,
  requiredChecks,
  resolveMode,
} from './okf-verify/report.mjs';
import { exists, status, writeAtomic } from './law-verify/source.mjs';

export { VERIFIER_CHECKS, CHECK_SET_VERSION };

// [::TICKET::] PX-424, PX-425, PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-424|PX-425|PX-426) --for-spec --no-implementation-order`.
async function runCheck(action) {
  try {
    return await action();
  } catch (error) {
    return status('failed', error.message, { codes: [error.code ?? 'CHECK_CRASHED'] });
  }
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function defaultAliasPath(skillPath) {
  return path.join(path.dirname(skillPath), `${path.basename(skillPath)}.path-alias.json`);
}

export async function verifyOkfSkill({
  skillPath,
  root = process.cwd(),
  sourceRoot = null,
  pathAlias = null,
  mode = null,
  outPath = null,
  skipTests = false,
} = {}) {
  const resolvedSkillPath = path.resolve(skillPath);
  if (!exists(resolvedSkillPath)) {
    throw Object.assign(new Error(`okf skill not found: ${resolvedSkillPath}`), { code: 'OKF_SKILL_INVALID' });
  }
  const resolvedMode = resolveMode({ mode, sourceRoot });
  const aliasPath = pathAlias ?? defaultAliasPath(resolvedSkillPath);

  const actions = {
    layer: () => checkLayer({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    manifest: () => checkManifest({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    lock: () => checkLock({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    coverage: () => checkCoverage({ skillPath: resolvedSkillPath }),
    registry: () => checkRegistry({ skillPath: resolvedSkillPath }),
    boundary: () => checkBoundary({ skillPath: resolvedSkillPath, aliasPath }),
    provenance: () => checkProvenance({ skillPath: resolvedSkillPath }),
    citation: () => checkCitation({ skillPath: resolvedSkillPath }),
    graph: () => checkGraph({ skillPath: resolvedSkillPath }),
    freshness: () => checkFreshness({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    conflicts: () => checkConflicts({ skillPath: resolvedSkillPath }),
    retrieval: () => checkRetrieval({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    usage: () => checkUsage({ skillPath: resolvedSkillPath }),
    runtime: () => checkRuntime({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    tests: () => (skipTests ? status('not_run', 'tests skipped by caller', { codes: [] }) : checkTests({ skillPath: resolvedSkillPath })),
    installer: () => checkInstaller({ skillPath: resolvedSkillPath, mode: resolvedMode, sourceRoot, aliasPath }),
    determinism: () => checkDeterminism({ skillPath: resolvedSkillPath }),
    distribution: () => checkDistribution({ skillPath: resolvedSkillPath, aliasPath }),
    style: () => checkStyle({ skillPath: resolvedSkillPath }),
    conformance: () => checkConformance({ skillPath: resolvedSkillPath }),
    lint: () => checkLint({ skillPath: resolvedSkillPath }),
    profile: () => checkProfile({ skillPath: resolvedSkillPath }),
    indexlog: () => checkIndexlog({ skillPath: resolvedSkillPath }),
    trust: () => checkTrust({ skillPath: resolvedSkillPath }),
    sources: () => checkSources({ skillPath: resolvedSkillPath }),
    context: () => checkContext({ skillPath: resolvedSkillPath }),
    navigation: () => checkNavigation({ skillPath: resolvedSkillPath }),
    traversalEnvelope: () => checkTraversalEnvelope({ skillPath: resolvedSkillPath }),
    frontierCompleteness: () => checkFrontierCompleteness({ skillPath: resolvedSkillPath }),
    unknownId: () => checkUnknownId({ skillPath: resolvedSkillPath }),
    graphReach: () => checkGraphReach({ skillPath: resolvedSkillPath }),
    facetSufficiency: () => checkFacetSufficiency({ skillPath: resolvedSkillPath }),
    guidanceDeterminism: () => checkGuidanceDeterminism({ skillPath: resolvedSkillPath }),
    containment: () => checkContainment({ skillPath: resolvedSkillPath }),
    library: () => checkLibrary({ skillPath: resolvedSkillPath }),
    performance: () => checkPerformance({ skillPath: resolvedSkillPath }),
  };

  const checks = {};
  for (const contract of CHECK_CONTRACT) {
    if (contract.mode === 'dev' && resolvedMode === 'installed') {
      checks[contract.name] = notRun(contract);
      continue;
    }
    const action = actions[contract.name];
    checks[contract.name] = action
      ? await runCheck(action)
      : status('failed', `no implementation for check: ${contract.name}`, { codes: ['CHECK_MISSING'] });
    checks[contract.name].mode = contract.mode;
  }

  const failed = Object.values(checks).some((entry) => entry.status === 'failed');
  const report = {
    schema: 'okf-skill-verification/v1',
    mode: resolvedMode,
    check_set_version: CHECK_SET_VERSION,
    status: failed ? 'failed' : 'machine_verified',
    skill: resolvedSkillPath,
    root: path.resolve(root),
    source_root: sourceRoot ? path.resolve(sourceRoot) : null,
    path_alias: aliasPath,
    required_checks: requiredChecks(resolvedMode).filter((name) => !(skipTests && name === 'tests')),
    checks,
    closure_sha256: closureSha256({ mode: resolvedMode, checks }),
  };
  if (outPath) writeAtomic(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function assertOkfMachineVerified({ report }) {
  const required = report?.required_checks ?? VERIFIER_CHECKS;
  const failed = required.filter((name) => report?.checks?.[name]?.status !== 'machine_verified');
  if (failed.length > 0) {
    throw Object.assign(new Error(`*-okf skill verification failed: ${failed.join(', ')}`), { code: 'OKF_SKILL_INVALID', failed });
  }
  return report;
}

// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

export async function main(argv = process.argv.slice(2)) {
  const skillPath = argumentValue(argv, 'skill');
  if (!skillPath) {
    process.stdout.write(`${JSON.stringify({ code: 'OKF_SKILL_INVALID', message: '--skill is required' })}\n`);
    return 1;
  }
  try {
    const report = await verifyOkfSkill({
      skillPath,
      root: argumentValue(argv, 'root') || process.cwd(),
      sourceRoot: argumentValue(argv, 'source-root'),
      pathAlias: argumentValue(argv, 'path-alias'),
      mode: argumentValue(argv, 'mode'),
      outPath: argumentValue(argv, 'out'),
      skipTests: argv.includes('--skip-tests'),
    });
    assertOkfMachineVerified({ report });
    process.stdout.write(`${JSON.stringify({ ok: true, schema: report.schema, mode: report.mode, check_set_version: report.check_set_version, closure_sha256: report.closure_sha256 })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, code: error.code || 'OKF_SKILL_INVALID', message: error.message, failed: error.failed || [] })}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then((code) => { process.exitCode = code; });
}
