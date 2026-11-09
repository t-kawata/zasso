'use strict';

/**
 * The design amendment transaction.
 *
 * One entry applies a mechanically verifiable correction, calls the owner of each
 * derived artifact, rebuilds the digest chain, runs the fixed gate manifest and
 * promotes only when no new finding appears. Any failure restores every touched
 * file byte for byte. Absent artifacts are skipped, never created.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const {
  ARTIFACT_KINDS,
  ARTIFACT_STATES,
  resolveArtifactState,
  resolveArtifactStates,
} = require('./lib/design-amendment-state.js');
const { appendAmendment } = require('./append-design-amendment.js');
const { rebuildDesignHashes } = require('./rebuild-design-hashes.js');
const { runGateManifest } = require('./amendment-gate-manifest.js');
const { diffFindings } = require('../lib/finding-delta.js');
const { gateFinding } = require('./lib/gate-report.js');

const AMENDMENT_DIRECTORY = 'amendments';
const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const STATUS_FILES = Object.freeze([
  'RFC-GRAPHIFY-Status.json',
  'RFC-BOUNDIFY-Status.json',
  'RFC-SPLIT-Status.json',
]);

const appendKinds = new Set([ARTIFACT_KINDS.SPEC, ARTIFACT_KINDS.RFC]);
const ownerForKind = Object.freeze({
  [ARTIFACT_KINDS.GRAPH]: 'graphify',
  [ARTIFACT_KINDS.DIRS_TREE]: 'boundify',
  [ARTIFACT_KINDS.TICKETS]: 'mutationGate',
});

/** The sha256 of a buffer. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Write through a temporary file and rename. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function writeAtomically(filePath, bytes) {
  const temporary = filePath + '.amendment-tmp.' + process.pid;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filePath);
}

/** The finding an unreadable or ambiguous artifact carries. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function stateFinding(ticketKey, state) {
  return gateFinding({
    code: state.code ?? 'UNREADABLE_ARTIFACT',
    asset: ticketKey + '/' + state.kind,
    problem: state.message ?? state.code ?? 'artifact is not readable',
    rerun: 'design-amendment.js --dry-run --ticket-key=' + ticketKey,
    fix: { tool: 'design-amendment', input: { ticketKey, artifact: state.kind, dryRun: true } },
  });
}

/** The finding a rejected claim carries. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function claimFinding(ticketKey, problem) {
  return gateFinding({
    code: 'CLAIM_INVALID',
    asset: ticketKey + '/claim',
    problem,
    rerun: 'design-amendment.js --ticket-key=' + ticketKey + ' --dry-run',
    fix: { tool: 'design-amendment', input: { ticketKey, dryRun: true } },
  });
}

/** Validate the machine-checkable claim the amendment must carry. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function validateClaim(claim) {
  if (!claim || typeof claim !== 'object') return 'claim is required';
  if (!claim.target || typeof claim.target.kind !== 'string' || typeof claim.target.id !== 'string') {
    return 'claim.target.kind and claim.target.id are required';
  }
  if (typeof claim.predicate !== 'string' || claim.predicate.trim().length === 0) return 'claim.predicate is required';
  if (typeof claim.requiredTest !== 'string' || claim.requiredTest.trim().length === 0) return 'claim.requiredTest is required';
  if (typeof claim.text !== 'string' || claim.text.trim().length === 0) return 'claim.text is required';
  return null;
}

/** Find the workspace tree manifest visible from a package directory. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function findTreeManifest(directory) {
  let current = path.resolve(directory);
  for (;;) {
    const candidate = path.join(current, TREE_MANIFEST_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Every file the transaction may touch, with its current bytes. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function collectSnapshotPaths(cwd, states) {
  const paths = new Set(states.filter((state) => state.state === ARTIFACT_STATES.PRESENT).map((state) => state.path));
  const manifest = findTreeManifest(cwd);
  if (manifest) paths.add(manifest);
  for (const name of STATUS_FILES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) paths.add(candidate);
  }
  return [...paths].sort();
}

/** Snapshot the bytes and digests of every file the transaction may touch. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function snapshotArtifacts(cwd, states) {
  return collectSnapshotPaths(cwd, states).map((filePath) => {
    const bytes = fs.readFileSync(filePath);
    return { path: filePath, bytes, digest: digestBytes(bytes) };
  });
}

/** Restore every snapshot byte for byte. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function restoreArtifacts(snapshots) {
  for (const snapshot of snapshots) writeAtomically(snapshot.path, snapshot.bytes);
}

/** The writes an amendment actually performed. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function changedWrites(snapshots) {
  const writes = [];
  for (const snapshot of snapshots) {
    if (!fs.existsSync(snapshot.path)) continue;
    const bytes = fs.readFileSync(snapshot.path);
    const digest = digestBytes(bytes);
    if (digest !== snapshot.digest) {
      writes.push({ path: snapshot.path, beforeDigest: snapshot.digest, afterDigest: digest });
    }
  }
  return writes;
}

/** Run the injected gate function or the fixed manifest. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function runGates({ gateRunner, cwd, ticketKey, ticketsPath, states, statesAfter }) {
  if (typeof gateRunner === 'function') {
    const result = gateRunner({ cwd, ticketKey, presentKinds: states.filter((state) => state.state === ARTIFACT_STATES.PRESENT).map((state) => state.kind) });
    if (Array.isArray(result)) return { findings: result, unverifiable: [] };
    return { findings: result?.findings ?? [], unverifiable: result?.unverifiable ?? [] };
  }
  const presentKinds = (statesAfter ?? states)
    .filter((state) => state.state === ARTIFACT_STATES.PRESENT)
    .map((state) => state.kind);
  return runGateManifest({ cwd, ticketKey, ticketsPath, presentKinds });
}

/** Apply the amendment body through the owner of the artifact. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function applyAmendment({ artifact, target, claim, ticketKey, cwd, owners, calls }) {
  if (appendKinds.has(artifact)) {
    return appendAmendment({
      filePath: target.path,
      ticketKey,
      title: claim.title ?? '',
      body: claim.text,
      op: 'append',
    });
  }
  const ownerName = ownerForKind[artifact];
  const owner = owners[ownerName];
  if (typeof owner !== 'function') {
    return { ok: false, code: 'OWNER_REQUIRED', owner: ownerName };
  }
  calls.push({ owner: ownerName, artifact, ticketKey });
  const result = owner({ cwd, artifact, claim, ticketKey });
  return result === undefined ? { ok: true } : result;
}

/** Write the provenance ledger for one promoted amendment. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function writeLedger({ cwd, ticketKey, artifact, target, claim, beforeDigest, afterDigest, gates }) {
  const directory = path.join(cwd, AMENDMENT_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const sequence = fs.readdirSync(directory).filter((name) => name.startsWith(ticketKey + '-')).length + 1;
  const ledgerPath = path.join(directory, ticketKey + '-' + sequence + '.json');
  const ledger = {
    ticketKey,
    artifact,
    artifactPath: target.path,
    claim,
    beforeDigest,
    afterDigest,
    gates,
    createdAt: new Date().toISOString(),
  };
  writeAtomically(ledgerPath, Buffer.from(JSON.stringify(ledger, null, 2) + '\n', 'utf8'));
  return ledgerPath;
}

/**
 * Run one amendment.
 *
 * @param {{ cwd?: string, ticketKey: string, artifact: string, operation?: string,
 *           claim: object, dryRun?: boolean, gateRunner?: Function,
 *           owners?: object, ticketsPath?: string|null }} input
 * @returns {Promise<object>}
 */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
async function runAmendment({
  cwd = process.cwd(),
  ticketKey,
  artifact,
  operation = 'append',
  claim = {},
  dryRun = true,
  gateRunner = null,
  owners = {},
  ticketsPath = null,
}) {
  const states = resolveArtifactStates({ cwd });
  const target = states.find((state) => state.kind === artifact);
  const empty = { findings: [], unverifiable: [], writes: [], directWrites: [] };

  if (!target || target.state === ARTIFACT_STATES.ABSENT) {
    return { outcome: 'skipped', ticketKey, artifact, ...empty, skipped: [{ artifact, reason: 'absent' }] };
  }
  if (target.state === ARTIFACT_STATES.AMBIGUOUS || target.state === ARTIFACT_STATES.UNREADABLE) {
    return { outcome: 'refused', ticketKey, artifact, ...empty, findings: [stateFinding(ticketKey, target)], skipped: [] };
  }

  const claimProblem = validateClaim(claim);
  if (claimProblem) {
    return { outcome: 'refused', ticketKey, artifact, ...empty, findings: [claimFinding(ticketKey, claimProblem)], skipped: [] };
  }

  const snapshots = snapshotArtifacts(cwd, states);
  const before = runGates({ gateRunner, cwd, ticketKey, ticketsPath, states });
  const calls = [];
  const applied = applyAmendment({ artifact, target, claim, ticketKey, cwd, owners, calls });

  if (applied.ok === false) {
    restoreArtifacts(snapshots);
    const finding = gateFinding({
      code: applied.code ?? 'AMENDMENT_FAILED',
      asset: ticketKey + '/' + artifact,
      problem: applied.code === 'OWNER_REQUIRED'
        ? 'artifact ' + artifact + ' needs its owner generator: ' + applied.owner
        : 'amendment was refused by the writer',
      rerun: 'design-amendment.js --ticket-key=' + ticketKey + ' --artifact=' + artifact,
      fix: { tool: 'design-amendment', input: { ticketKey, artifact } },
    });
    return { outcome: 'refused', ticketKey, artifact, ...empty, findings: [finding] };
  }

  await rebuildDesignHashes({ cwd });
  const statesAfter = resolveArtifactStates({ cwd });
  const after = runGates({ gateRunner, cwd, ticketKey, ticketsPath, states, statesAfter });
  const newFindings = diffFindings(before.findings, after.findings);

  if (newFindings.length > 0) {
    restoreArtifacts(snapshots);
    return { outcome: 'rolled-back', ticketKey, artifact, ...empty, findings: newFindings };
  }

  const writes = changedWrites(snapshots);
  if (dryRun) {
    restoreArtifacts(snapshots);
    return {
      outcome: 'dry-run',
      ticketKey,
      artifact,
      wouldPromote: true,
      findings: [],
      unverifiable: after.unverifiable,
      writes: [],
      directWrites: [],
      calls,
    };
  }

  if (applied.noChange === true) {
    return {
      outcome: 'promoted',
      ticketKey,
      artifact,
      noChange: true,
      findings: [],
      unverifiable: after.unverifiable,
      writes: [],
      directWrites: [],
      calls,
    };
  }

  const ledger = writeLedger({
    cwd,
    ticketKey,
    artifact,
    target,
    claim,
    beforeDigest: applied.beforeDigest ?? null,
    afterDigest: applied.afterDigest ?? null,
    gates: after.gates ?? [],
  });

  return {
    outcome: 'promoted',
    ticketKey,
    artifact,
    noChange: false,
    findings: [],
    unverifiable: after.unverifiable,
    writes,
    directWrites: [],
    calls,
    ledger,
    operation,
  };
}

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** Parse the claim from an inline JSON value or an @file path. */
// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
function parseClaim(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-400 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-400 --for-spec --no-implementation-order`.
async function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  const artifact = argumentValue(args, 'artifact');
  if (!ticketKey || !artifact) {
    process.stdout.write(JSON.stringify({
      outcome: 'refused',
      findings: [claimFinding(ticketKey ?? 'unknown', '--ticket-key and --artifact are required')],
      skipped: [],
      unverifiable: [],
      writes: [],
      directWrites: [],
    }) + '\n');
    process.exit(0);
  }

  const result = await runAmendment({
    cwd: path.resolve(argumentValue(args, 'cwd') || process.cwd()),
    ticketKey,
    artifact,
    operation: argumentValue(args, 'operation') || 'append',
    claim: parseClaim(argumentValue(args, 'claim')) ?? {},
    dryRun: !args.includes('--apply'),
    ticketsPath: argumentValue(args, 'tickets') ?? null,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(JSON.stringify({
      outcome: 'refused',
      findings: [claimFinding('unknown', error.message)],
      skipped: [],
      unverifiable: [],
      writes: [],
      directWrites: [],
    }) + '\n');
    process.exit(0);
  });
}

module.exports = {
  AMENDMENT_DIRECTORY,
  runAmendment,
  snapshotArtifacts,
  restoreArtifacts,
  validateClaim,
};
