'use strict';

/**
 * /amend-rfc-up artifact dispatch.
 *
 * RFC/SPEC changes go through the design amendment transaction. GRAPH,
 * Dirs-Tree and Tickets changes go through their owners. The command never
 * writes an artifact directly.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { ARTIFACT_ORDER } = require('./changes.js');
const {
  OWNER_STATUS_FILES,
  buildOwnerPlan,
  snapshotOwnerArtifacts,
  validateOwnerReceipt,
} = require('./owners.js');

const OWNER_ORDER = Object.freeze(['graphify', 'boundify', 'split']);
const CLAIMS_DIRECTORY = path.join('amend', 'claims');
const DESIGN_AMENDMENT_PATH = path.resolve(__dirname, '../tickets/design-amendment.js');

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function sanitizeFilename(value) {
  return String(value || 'change').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function defaultAmendmentRunner({ args, cwd }) {
  const result = spawnSync(process.execPath, [DESIGN_AMENDMENT_PATH, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw fail('DESIGN_AMENDMENT_FAILED', `design-amendment exited ${result.status}`, { stderr: result.stderr });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw fail('DESIGN_AMENDMENT_FAILED', `design-amendment output is not JSON: ${error.message}`, {
      stdout: result.stdout,
    });
  }
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function writeClaimFile({ packageDir, ticketKey, change }) {
  const directory = path.join(packageDir, CLAIMS_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const claimPath = path.join(directory, `${ticketKey}-${sanitizeFilename(change.id)}.json`);
  fs.writeFileSync(claimPath, JSON.stringify(change, null, 2) + '\n');
  return claimPath;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function writeTemporaryClaim({ change }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amend-claim-'));
  const claimPath = path.join(directory, `${sanitizeFilename(change.id)}.json`);
  fs.writeFileSync(claimPath, JSON.stringify(change, null, 2) + '\n');
  return claimPath;
}

/** Dispatch one change to its transaction or owner. */
// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
async function dispatchArtifactChange(input = {}) {
  const {
    change,
    packageDir,
    ticketKey,
    runner = defaultAmendmentRunner,
    ownerRunner = null,
    apply = false,
    mode = apply ? 'apply' : 'dry-run',
    receipt = null,
    gateRunner = null,
  } = input;
  if (change.artifact === 'rfc' || change.artifact === 'spec') {
    if (typeof gateRunner === 'function') {
      const gated = gateRunner();
      if (gated && Array.isArray(gated.findings) && gated.findings.length > 0) {
        return { outcome: 'rolled-back', findings: gated.findings, writes: [] };
      }
    }
    const claimPath = mode === 'apply'
      ? writeClaimFile({ packageDir, ticketKey, change })
      : writeTemporaryClaim({ change });
    const args = [
      `--ticket-key=${ticketKey}`,
      `--artifact=${change.artifact}`,
      `--claim=@${claimPath}`,
      `--cwd=${packageDir}`,
    ];
    if (mode === 'apply') args.push('--apply');
    return runner({ args, cwd: packageDir, packageDir, ticketKey, change, claimPath, apply: mode === 'apply' });
  }
  if (typeof ownerRunner === 'function') {
    const result = ownerRunner(change.owner, { packageDir, change });
    return {
      ok: result?.ok === true,
      code: result?.code || null,
      owner: change.owner,
      artifact: change.artifact,
    };
  }
  if (mode === 'dry-run') {
    return buildOwnerPlan({ packageDir, owner: change.owner, change });
  }
  if (!receipt) {
    return { ok: false, code: 'OWNER_RECEIPT_REQUIRED', owner: change.owner, artifact: change.artifact };
  }
  return validateOwnerReceipt({ packageDir, owner: change.owner, receipt });
}

/** graphify -> boundify -> split; a failure is REDERIVE_PENDING. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
async function runOwnerRederive({ packageDir, invokeOwner }) {
  const receipts = [];
  for (const owner of OWNER_ORDER) {
    const provided = invokeOwner(owner, { packageDir });
    let result;
    try {
      result = provided && provided.beforeDigest && provided.afterDigest && provided.statusFile
        ? validateOwnerReceipt({ packageDir, owner, receipt: provided, requireDelta: false })
        : provided;
    } catch (error) {
      throw fail('REDERIVE_PENDING', `owner ${owner} receipt is invalid`, {
        owner,
        receipts,
        result: { code: error.code, message: error.message },
        action: `rerun /${owner === 'graphify' ? 'graphify-rfc' : owner === 'boundify' ? 'boundify-graph' : 'split-to-tickets'}`,
      });
    }
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

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function recordOwnerReceipt({ report, owner, result }) {
  return {
    ...report,
    rederive: [...(report.rederive || []), { owner, ok: result.ok === true, code: result.code || null }],
  };
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

/** One change from a change file: an object, a one-element array, or an id match. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readChangeInput(value, changeId = null) {
  const parsed = readJsonInput(value);
  if (!Array.isArray(parsed)) return parsed;
  if (changeId) return parsed.find((entry) => entry && entry.id === changeId) || null;
  return parsed.length === 1 ? parsed[0] : null;
}

// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const packageDir = path.resolve(argumentValue(argv, 'package') || process.cwd());
  const ticketKey = argumentValue(argv, 'ticket-key');
  try {
    if (command === 'dry-run' || command === 'apply') {
      const change = readChangeInput(argumentValue(argv, 'change'), argumentValue(argv, 'change-id'));
      const receipt = readJsonInput(argumentValue(argv, 'receipt'));
      if (!ticketKey || !change) throw fail('CHANGE_INVALID', '--ticket-key and --change=@file are required');
      const result = await dispatchArtifactChange({
        change,
        packageDir,
        ticketKey,
        mode: command === 'apply' ? 'apply' : 'dry-run',
        receipt,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.outcome === 'rolled-back' ? 1 : 0;
    }
    if (command === 'rederive') {
      const receipts = readJsonInput(argumentValue(argv, 'receipts'));
      if (!Array.isArray(receipts)) throw fail('REDERIVE_PENDING', '--receipts=@file must hold an array');
      const result = await runOwnerRederive({
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
    if (command === 'receipt') {
      const owner = argumentValue(argv, 'owner');
      const beforeDigest = argumentValue(argv, 'before-digest');
      if (!OWNER_STATUS_FILES[owner] || !beforeDigest) {
        throw fail('OWNER_RECEIPT_INVALID', '--owner and --before-digest are required');
      }
      const snapshot = snapshotOwnerArtifacts({ packageDir, owner });
      process.stdout.write(`${JSON.stringify({
        owner,
        beforeDigest,
        afterDigest: snapshot.digest,
        statusFile: OWNER_STATUS_FILES[owner],
        exit: Number(argumentValue(argv, 'exit') ?? 0),
      })}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'DISPATCH_FAILED', message: error.message, owner: error.owner || null })}\n`);
    return 1;
  }
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = {
  ARTIFACT_ORDER,
  OWNER_ORDER,
  dispatchArtifactChange,
  recordOwnerReceipt,
  runOwnerRederive,
  writeClaimFile,
};
