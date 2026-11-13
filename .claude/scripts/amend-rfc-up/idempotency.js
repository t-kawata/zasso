'use strict';

/**
 * /amend-rfc-up amendment digest and replay.
 *
 * A repeated run must not append a second amendment. The digest covers the
 * material, the instruction, the change identities, and the target artifact
 * digests; the ledger is append-only and keyed by that digest.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const AMEND_DIRECTORY = 'amend';
const LEDGER_FILENAME = 'AMENDMENT.json';

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function stableChange(change) {
  return {
    id: change.id || null,
    package: change.package || null,
    artifact: change.artifact || null,
    operation: change.operation || null,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function computeAmendmentDigest({
  materialDigests = [],
  instructionDigest = '',
  changes = [],
  targetDigests = [],
} = {}) {
  const payload = {
    materialDigests: [...materialDigests].map(String).sort(),
    instructionDigest: String(instructionDigest),
    changes: changes.map(stableChange).sort((left, right) => String(left.id).localeCompare(String(right.id))),
    targetDigests: [...targetDigests].map(String).sort(),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function ledgerPath({ packageDir }) {
  return path.join(path.resolve(packageDir), AMEND_DIRECTORY, LEDGER_FILENAME);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readAmendLedger({ packageDir }) {
  const filePath = ledgerPath({ packageDir });
  if (!fs.existsSync(filePath)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw fail('AMENDMENT_LEDGER_UNREADABLE', `amendment ledger is not JSON: ${error.message}`, { path: filePath });
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.entries)) return parsed.entries;
  throw fail('AMENDMENT_LEDGER_UNREADABLE', 'amendment ledger is not an array', { path: filePath });
}

/** Append one digest; the same digest is a no-op so replay is safe. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function writeAmendmentRecord({ packageDir, digest, ticketKey = null, packages = [] } = {}) {
  if (typeof digest !== 'string' || digest.length === 0) {
    throw fail('AMENDMENT_DIGEST_REQUIRED', 'an amendment digest is required');
  }
  const directory = path.join(path.resolve(packageDir), AMEND_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const entries = readAmendLedger({ packageDir });
  if (entries.some((entry) => entry.digest === digest)) return { ok: true, appended: false };
  entries.push({
    digest,
    ticketKey,
    packages: [...packages].sort(),
    recordedAt: new Date().toISOString(),
  });
  const filePath = ledgerPath({ packageDir });
  const temporary = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(entries, null, 2) + '\n');
  fs.renameSync(temporary, filePath);
  return { ok: true, appended: true };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function decideReplay({ digest, ledger = [] } = {}) {
  const applied = ledger.some((entry) => entry.digest === digest);
  return applied ? { mode: 'no-change', digest } : { mode: 'apply', digest };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readChanges(value) {
  const parsed = readJsonInput(value);
  if (Array.isArray(parsed)) return parsed;
  return Array.isArray(parsed?.changes) ? parsed.changes : [];
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    const packageDir = argumentValue(argv, 'package') || process.cwd();
    if (command === 'decide') {
      const digest = computeAmendmentDigest({
        materialDigests: String(argumentValue(argv, 'material-digest') || '').split(',').filter(Boolean),
        instructionDigest: argumentValue(argv, 'instruction-digest') || '',
        changes: readChanges(argumentValue(argv, 'changes')),
        targetDigests: readJsonInput(argumentValue(argv, 'target-digests')) || [],
      });
      const decision = decideReplay({ digest, ledger: readAmendLedger({ packageDir }) });
      process.stdout.write(`${JSON.stringify(decision)}\n`);
      return 0;
    }
    if (command === 'record') {
      const packages = (readJsonInput(argumentValue(argv, 'packages')) || [])
        .map((entry) => (typeof entry === 'string' ? entry : entry && entry.id))
        .filter((id) => typeof id === 'string' && id.length > 0);
      const result = writeAmendmentRecord({
        packageDir,
        digest: argumentValue(argv, 'digest'),
        ticketKey: argumentValue(argv, 'ticket-key'),
        packages,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'AMENDMENT_DIGEST_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  AMEND_DIRECTORY,
  LEDGER_FILENAME,
  computeAmendmentDigest,
  decideReplay,
  readAmendLedger,
  writeAmendmentRecord,
};
