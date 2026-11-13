// @verifies C001 C002 C003 C004 C005 C006
/**
 * Canonical *-law skill verifier, check-set v2.
 *
 * Two modes prove two different things:
 *   dev        source -> lock -> coverage -> OKF -> report -> dist
 *   installed  installed-tree invariants and installed runtime
 *
 * `machine_verified` is the only pass. A dev-only check without --source-root
 * is `unverifiable`; installed mode never claims source re-derivation.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkCoverage,
  checkCoverageSemantics,
  checkDelivery,
  checkGenericBoundary,
  checkInputLedger,
  checkInstalledLeak,
  checkLayer,
  checkLock,
  checkManifest,
  checkPathAlias,
  checkRedaction,
  checkRegistry,
  checkStyle,
} from './law-verify/checks-artifact.mjs';
import {
  checkDeterminism,
  checkInstaller,
  checkReproduction,
  checkRuntime,
  checkTests,
  prepareRuntime,
} from './law-verify/checks-runtime.mjs';
import {
  CHECK_SET_VERSION,
  CHECK_CONTRACT,
  VERIFIER_CHECKS,
  closureSha256,
  notRun,
  requiredChecks,
  resolveMode,
} from './law-verify/report.mjs';
import { exists, status, writeAtomic } from './law-verify/source.mjs';

export { VERIFIER_CHECKS, CHECK_SET_VERSION };

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function runCheck(action) {
  try {
    return action();
  } catch (error) {
    return status('failed', error.message, { codes: [error.code ?? 'CHECK_CRASHED'] });
  }
}

// [::TICKET::] PX-421, PX-422 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-421|PX-422) --for-spec --no-implementation-order`.
function defaultAliasPath(skillPath) {
  const skillName = path.basename(skillPath);
  return path.join(path.dirname(skillPath), `${skillName}.path-alias.json`);
}

/**
 * Verify one *-law skill.
 *
 * @param {{
 *   skillPath: string,
 *   root?: string,
 *   sourceRoot?: string|null,
 *   pathAlias?: string|null,
 *   mode?: 'dev'|'installed'|null,
 *   outPath?: string|null,
 *   skipTests?: boolean,
 * }} input
 * @returns {object} law-skill-verification/v1
 */
export function verifyLawSkill({
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
  const runtime = prepareRuntime({ skillPath: resolvedSkillPath, mode: resolvedMode });

  const actions = {
    layer: () => checkLayer({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    manifest: () => checkManifest({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    lock: () => checkLock({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    coverage: () => checkCoverage({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    registry: () => checkRegistry({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    genericBoundary: () => checkGenericBoundary({ skillPath: resolvedSkillPath, mode: resolvedMode }),
    delivery: () => checkDelivery({ skillPath: resolvedSkillPath }),
    runtime: () => checkRuntime({ runtime }),
    reproduction: () => checkReproduction({ skillPath: resolvedSkillPath, sourceRoot, aliasPath, runtime }),
    tests: () => (skipTests
      ? status('not_run', 'tests skipped by caller', { codes: [] })
      : checkTests({ skillPath: resolvedSkillPath })),
    installer: () => checkInstaller({ skillPath: resolvedSkillPath, mode: resolvedMode, sourceRoot, aliasPath }),
    determinism: () => checkDeterminism({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    redaction: () => checkRedaction({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    coverageSemantics: () => checkCoverageSemantics({ skillPath: resolvedSkillPath }),
    inputLedger: () => checkInputLedger({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    pathAlias: () => checkPathAlias({ skillPath: resolvedSkillPath, sourceRoot, aliasPath }),
    installedLeak: () => checkInstalledLeak({
      skillPath: resolvedSkillPath,
      mode: resolvedMode,
      aliasPath,
      sourceRoot,
      runtime,
    }),
    style: () => checkStyle({ skillPath: resolvedSkillPath, mode: resolvedMode }),
  };

  const checks = {};
  for (const contract of CHECK_CONTRACT) {
    const name = contract.name;
    if (contract.mode === 'dev' && resolvedMode === 'installed') {
      checks[name] = notRun(contract);
      continue;
    }
    const action = actions[name];
    checks[name] = action
      ? runCheck(action)
      : status('failed', `no implementation for check: ${name}`, { codes: ['CHECK_MISSING'] });
    checks[name].mode = contract.mode;
  }

  const report = {
    schema: 'law-skill-verification/v1',
    mode: resolvedMode,
    check_set_version: CHECK_SET_VERSION,
    skill: resolvedSkillPath,
    root: path.resolve(root),
    source_root: sourceRoot ? path.resolve(sourceRoot) : null,
    path_alias: aliasPath,
    required_checks: requiredChecks(resolvedMode),
    checks,
    closure_sha256: closureSha256({ mode: resolvedMode, checks }),
  };
  if (outPath) writeAtomic(path.resolve(outPath), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/** Machine pass only: every required check is machine_verified. */
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

export function main(argv = process.argv.slice(2)) {
  const skillPath = argumentValue(argv, 'skill');
  const outPath = argumentValue(argv, 'out');
  if (!skillPath) {
    process.stdout.write(`${JSON.stringify({ code: 'LAW_SKILL_INVALID', message: '--skill is required' })}\n`);
    return 1;
  }
  try {
    const report = verifyLawSkill({
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
  process.exit(main());
}
