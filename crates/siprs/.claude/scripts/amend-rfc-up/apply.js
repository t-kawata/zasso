'use strict';

/**
 * /amend-rfc-up apply.
 *
 * The command never writes the RFC. It hands one claim at a time to
 * design-amendment.js, gates the dry-run result, and records the owner
 * rederive receipts in the report. A committed amendment is never rolled back
 * by a later owner failure; the failure is reported as REDERIVE_PENDING.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OWNER_ORDER = Object.freeze(['graphify', 'boundify', 'split']);
const CLAIMS_DIRECTORY = path.join('target', 'law', 'claims');
const DESIGN_AMENDMENT_PATH = path.resolve(__dirname, '../tickets/design-amendment.js');
const ARTIFACT_RFC = 'rfc';

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function sanitizeFilename(value) {
  return String(value || 'claim').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

/** The default transaction runner: one design-amendment CLI invocation. */
function defaultDesignAmendmentRunner({ args, cwd }) {
  const result = spawnSync(process.execPath, [DESIGN_AMENDMENT_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw fail('DESIGN_AMENDMENT_FAILED', `design-amendment exited ${result.status}`, {
      stderr: result.stderr,
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw fail('DESIGN_AMENDMENT_FAILED', `design-amendment output is not JSON: ${error.message}`, {
      stdout: result.stdout,
    });
  }
}

/** Write the claim where the CLI can read it with @file. */
function writeClaimFile({ packageDir, ticketKey, claim }) {
  const directory = path.join(packageDir, CLAIMS_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const filename = `${ticketKey}-${sanitizeFilename(claim.target.id)}.json`;
  const claimPath = path.join(directory, filename);
  fs.writeFileSync(claimPath, JSON.stringify(claim, null, 2) + '\n');
  return claimPath;
}

function designAmendmentArgs({ ticketKey, packageDir, claimPath, apply }) {
  const args = [
    '--ticket-key', ticketKey,
    '--artifact', ARTIFACT_RFC,
    '--claim', `@${claimPath}`,
    '--cwd', packageDir,
  ];
  if (apply) args.push('--apply');
  return args;
}

/** Dry-run one claim; nothing is promoted. */
function runDryRun({ claim, ticketKey, packageDir, runner = defaultDesignAmendmentRunner }) {
  const claimPath = writeClaimFile({ packageDir, ticketKey, claim });
  const args = designAmendmentArgs({ ticketKey, packageDir, claimPath, apply: false });
  return runner({ claim, ticketKey, packageDir, claimPath, apply: false, args });
}

/** The internal gate between dry-run and apply. */
function assertInternalGate({ dryRun }) {
  if (!dryRun || dryRun.outcome !== 'dry-run' || dryRun.wouldPromote !== true) {
    return {
      ok: false,
      code: 'GATE_FINDING',
      findings: (dryRun && dryRun.findings) || [],
      outcome: dryRun ? dryRun.outcome : 'missing',
    };
  }
  if (Array.isArray(dryRun.findings) && dryRun.findings.length > 0) {
    return { ok: false, code: 'GATE_FINDING', findings: dryRun.findings };
  }
  return { ok: true };
}

/** Apply one claim. A gate runner may simulate the transaction's rollback. */
function runApply({ claim, ticketKey, packageDir, runner = defaultDesignAmendmentRunner, gateRunner = null }) {
  if (typeof gateRunner === 'function') {
    const gated = gateRunner();
    if (gated && Array.isArray(gated.findings) && gated.findings.length > 0) {
      return { outcome: 'rolled-back', findings: gated.findings, writes: [] };
    }
  }
  const claimPath = writeClaimFile({ packageDir, ticketKey, claim });
  const args = designAmendmentArgs({ ticketKey, packageDir, claimPath, apply: true });
  return runner({ claim, ticketKey, packageDir, claimPath, apply: true, args });
}

/** Dry-run every claim; apply only when every dry-run is clean. */
function runClaimPlan({ claims, ticketKey, packageDir, runner = defaultDesignAmendmentRunner }) {
  const dryRuns = [];
  for (const claim of claims) {
    const dryRun = runDryRun({ claim, ticketKey, packageDir, runner });
    const gate = assertInternalGate({ dryRun });
    dryRuns.push({ claim, dryRun, gate });
    if (!gate.ok) return { outcome: 'blocked', dryRuns, gate, claim };
  }
  const applied = [];
  for (const claim of claims) {
    const result = runApply({ claim, ticketKey, packageDir, runner });
    applied.push(result);
    if (result.outcome === 'rolled-back') {
      return { outcome: 'rolled-back', dryRuns, applied, result };
    }
  }
  return { outcome: 'applied', dryRuns, applied };
}

/** The default owner invoker refuses: the command must supply receipts. */
function defaultInvokeOwner(owner) {
  return { ok: false, code: 'OWNER_INVOCATION_REQUIRED', owner };
}

/** Invoke graphify -> boundify -> split; a failure is REDERIVE_PENDING. */
async function runOwnerRederive({ packageDir, invokeOwner = defaultInvokeOwner }) {
  const receipts = [];
  for (const owner of OWNER_ORDER) {
    const result = invokeOwner(owner, { packageDir });
    if (!result || result.ok !== true) {
      throw fail('REDERIVE_PENDING', `owner ${owner} failed`, {
        owner,
        receipts,
        result,
        action: `run /${owner === 'graphify' ? 'graphify-rfc' : owner === 'boundify' ? 'boundify-graph' : 'split-to-tickets'} and pass its receipt`,
      });
    }
    receipts.push({ owner, ok: true, code: result.code || null });
  }
  return { receipts, order: [...OWNER_ORDER] };
}

/** Immutable receipt append for the report. */
function recordRederiveReceipt({ report, owner, result }) {
  return {
    ...report,
    rederive: [...(report.rederive || []), { owner, ok: result.ok === true, code: result.code || null }],
  };
}

function readJsonArgument(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const packageDir = path.resolve(argumentValue(argv, 'package') || process.cwd());
  const ticketKey = argumentValue(argv, 'ticket-key');
  try {
    if (command === 'dry-run' || command === 'apply') {
      if (!ticketKey) throw fail('CLAIM_INVALID', '--ticket-key is required');
      const claim = readJsonArgument(argumentValue(argv, 'claim'));
      if (!claim) throw fail('CLAIM_INVALID', '--claim=@file is required');
      const result = command === 'dry-run'
        ? runDryRun({ claim, ticketKey, packageDir })
        : runApply({ claim, ticketKey, packageDir });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (command === 'plan') {
      if (!ticketKey) throw fail('CLAIM_INVALID', '--ticket-key is required');
      const plan = readJsonArgument(argumentValue(argv, 'plan'));
      if (!plan) throw fail('CLAIM_INVALID', '--plan=@file is required');
      const claims = plan.claims || plan;
      if (!Array.isArray(claims)) throw fail('CLAIM_INVALID', '--plan must hold claims');
      const result = runClaimPlan({ claims, ticketKey, packageDir });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.outcome === 'blocked' ? 1 : 0;
    }
    if (command === 'rederive') {
      const receipts = readJsonArgument(argumentValue(argv, 'receipts'));
      if (!Array.isArray(receipts)) throw fail('REDERIVE_PENDING', '--receipts=@file must hold an array');
      const result = runOwnerRederive({
        packageDir,
        invokeOwner: (owner) => receipts.find((receipt) => receipt.owner === owner) || { ok: false, code: 'MISSING_RECEIPT' },
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (command === 'owners') {
      process.stdout.write(`${JSON.stringify({ order: [...OWNER_ORDER], commands: ['/graphify-rfc', '/boundify-graph', '/split-to-tickets'] })}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'APPLY_FAILED', message: error.message, owner: error.owner || null })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  OWNER_ORDER,
  assertInternalGate,
  recordRederiveReceipt,
  runApply,
  runClaimPlan,
  runDryRun,
  runOwnerRederive,
  writeClaimFile,
};
