// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
/**
 * Canonical *-law skill verifier, check-set v3.
 *
 * Two modes prove two different things:
 *   dev        source -> manifest -> rule concepts -> OKF -> runtime -> dist
 *   installed  installed-tree invariants and installed runtime
 *
 * `machine_verified` is the only pass. A dev-only check without --source-root
 * is `unverifiable`; installed mode never claims source re-derivation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as checks from './law-verify/v3.mjs';
import {
  CHECK_CONTRACT,
  CHECK_SET_VERSION,
  VERIFIER_CHECKS,
  closureSha256,
  notRun,
  requiredChecks,
  resolveMode,
} from './law-verify/report.mjs';
import { exists, status, writeAtomic } from './law-verify/source.mjs';

export { VERIFIER_CHECKS, CHECK_SET_VERSION };

// [::TICKET::] PX-426, PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-426|PX-425) --for-spec --no-implementation-order`.
async function runCheck(action) {
  try {
    return await action();
  } catch (error) {
    return status('failed', error.message, { codes: [error.code ?? 'CHECK_CRASHED'] });
  }
}

function defaultAliasPath(skillPath) {
  const skillName = path.basename(skillPath);
  return path.join(path.dirname(skillPath), `${skillName}.path-alias.json`);
}

export async function verifyLawSkill({
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
    throw Object.assign(new Error(`law skill not found: ${resolvedSkillPath}`), { code: 'LAW_SKILL_INVALID' });
  }
  const resolvedMode = resolveMode({ mode, sourceRoot });
  const aliasPath = pathAlias ?? defaultAliasPath(resolvedSkillPath);
  const runtime = checks.prepareRuntime({ skillPath: resolvedSkillPath });

  const actions = {
    layer: () => checks.checkLayer({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    manifest: () => checks.checkManifest({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    lock: () => checks.checkLock({ skillPath: resolvedSkillPath }),
    coverage: () => checks.checkCoverage({ skillPath: resolvedSkillPath }),
    registry: () => checks.checkRegistry({ skillPath: resolvedSkillPath }),
    genericBoundary: () => checks.checkGenericBoundary({ skillPath: resolvedSkillPath }),
    delivery: () => checks.checkDelivery({ skillPath: resolvedSkillPath }),
    runtime: () => checks.checkRuntime({ runtime }),
    reproduction: () => checks.checkReproduction({ skillPath: resolvedSkillPath }),
    tests: () => (skipTests ? status('not_run', 'tests skipped by caller', { codes: [] }) : checks.checkTests({ skillPath: resolvedSkillPath })),
    installer: () => checks.checkInstaller({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    determinism: () => checks.checkDeterminism({ skillPath: resolvedSkillPath }),
    redaction: () => checks.checkRedaction({ skillPath: resolvedSkillPath }),
    coverageSemantics: () => checks.checkCoverageSemantics({ skillPath: resolvedSkillPath }),
    inputLedger: () => checks.checkInputLedger({ skillPath: resolvedSkillPath }),
    pathAlias: () => checks.checkPathAlias({ skillPath: resolvedSkillPath, aliasPath }),
    installedLeak: () => checks.checkInstalledLeak({ skillPath: resolvedSkillPath, mode: resolvedMode, aliasPath }),
    style: () => checks.checkStyle({ skillPath: resolvedSkillPath }),
    conformance: () => checks.checkConformance({ skillPath: resolvedSkillPath }),
    lint: () => checks.checkLint({ skillPath: resolvedSkillPath }),
    profile: () => checks.checkProfile({ skillPath: resolvedSkillPath }),
    graph: () => checks.checkGraph({ skillPath: resolvedSkillPath }),
    context: () => checks.checkContext({ skillPath: resolvedSkillPath }),
    navigation: () => checks.checkNavigation({ skillPath: resolvedSkillPath }),
    ruleIdentity: () => checks.checkRuleIdentity({ skillPath: resolvedSkillPath }),
    traversalEnvelope: () => checks.checkTraversalEnvelope({ skillPath: resolvedSkillPath }),
    frontierCompleteness: () => checks.checkFrontierCompleteness({ skillPath: resolvedSkillPath }),
    unknownId: () => checks.checkUnknownId({ skillPath: resolvedSkillPath }),
    graphReach: () => checks.checkGraphReach({ skillPath: resolvedSkillPath }),
    facetSufficiency: () => checks.checkFacetSufficiency({ skillPath: resolvedSkillPath }),
    guidanceDeterminism: () => checks.checkGuidanceDeterminism({ skillPath: resolvedSkillPath }),
    sourceCoverage: () => checks.checkSourceCoverage({ skillPath: resolvedSkillPath }),
    aliasResolution: () => checks.checkAliasResolution({ skillPath: resolvedSkillPath }),
    rulePreservation: () => checks.checkRulePreservation({ skillPath: resolvedSkillPath }),
    bodyFidelity: () => checks.checkBodyFidelity({ skillPath: resolvedSkillPath }),
    performance: () => checks.checkPerformance({ skillPath: resolvedSkillPath }),
  };

  const results = {};
  for (const contract of CHECK_CONTRACT) {
    if (contract.mode === 'dev' && resolvedMode === 'installed') {
      results[contract.name] = notRun(contract);
      continue;
    }
    const action = actions[contract.name];
    results[contract.name] = action
      ? await runCheck(action)
      : status('failed', `no implementation for check: ${contract.name}`, { codes: ['CHECK_MISSING'] });
    results[contract.name].mode = contract.mode;
  }

  const failed = Object.values(results).some((entry) => entry.status === 'failed');
  const report = {
    schema: 'law-skill-verification/v1',
    status: failed ? 'failed' : 'machine_verified',
    mode: resolvedMode,
    check_set_version: CHECK_SET_VERSION,
    skill: resolvedSkillPath,
    root: path.resolve(root),
    source_root: sourceRoot ? path.resolve(sourceRoot) : null,
    path_alias: aliasPath,
    required_checks: requiredChecks(resolvedMode).filter((name) => !(skipTests && name === 'tests')),
    checks: results,
    closure_sha256: closureSha256({ mode: resolvedMode, checks: results }),
  };
  if (outPath) writeAtomic(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function assertMachineVerified({ report }) {
  const required = report?.required_checks ?? VERIFIER_CHECKS;
  const failed = required.filter((name) => report?.checks?.[name]?.status !== 'machine_verified');
  if (failed.length > 0) {
    throw Object.assign(
      new Error(`*-law skill verification failed: ${failed.join(', ')}`),
      { code: 'LAW_SKILL_INVALID', failed },
    );
  }
  return report;
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

export async function main(argv = process.argv.slice(2)) {
  const skillPath = argumentValue(argv, 'skill');
  const outPath = argumentValue(argv, 'out');
  if (!skillPath) {
    process.stdout.write(`${JSON.stringify({ code: 'LAW_SKILL_INVALID', message: '--skill is required' })}\n`);
    return 1;
  }
  try {
    const report = await verifyLawSkill({
      skillPath,
      root: argumentValue(argv, 'root') || process.cwd(),
      sourceRoot: argumentValue(argv, 'source-root'),
      pathAlias: argumentValue(argv, 'path-alias'),
      mode: argumentValue(argv, 'mode'),
      outPath,
      skipTests: argv.includes('--skip-tests'),
    });
    assertMachineVerified({ report });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      schema: report.schema,
      mode: report.mode,
      check_set_version: report.check_set_version,
      closure_sha256: report.closure_sha256,
    })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      code: error.code || 'LAW_SKILL_INVALID',
      message: error.message,
      failed: error.failed || [],
    })}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then((code) => { process.exitCode = code; });
}
