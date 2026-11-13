'use strict';

/**
 * condense-rebase — rewrite the omission convergence artifacts after condensation.
 *
 * Condensation changes ticket keys, phase ids and acceptance indices. The gate
 * measures surfaces, stable keys and a digest, so leaving the artifacts at the
 * pre-condense keys would create duplicate findings and reset convergence. This
 * module applies the condense key map and acceptance criterion hashes to every
 * artifact in one deterministic pass.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { acceptanceAssetId } = require('./lib/omission-detectors.js');

const GAP_SCAN_FILE = 'OMISSION-GAP-SCAN.json';
const JUDGMENT_LEDGER_FILE = 'OMISSION-JUDGMENT-LEDGER.json';
const TICKET_INDEX_FILE = 'OMISSION-TICKET-INDEX.json';
const CONVERGENCE_FILE = 'OMISSION-CONVERGENCE.json';
const OMISSIONS_PATTERN = /^OMISSIONS-.*\.json$/;
const ALIAS_GENERATION_RE = /^(.+?)@g\d+$/;

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function flatTickets(document) {
  const tickets = new Map();
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const key = ticket.phaseId === -1 || phase.id === -1
        ? `PX-${ticket.id}`
        : `P${phase.id}-${ticket.id}`;
      tickets.set(key, ticket);
    }
  }
  return tickets;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function liveKeys(document) {
  return new Set(flatTickets(document).keys());
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function resolveKey(key, post) {
  if (liveKeys(post).has(key)) return key;
  const aliases = post?.identity?.aliases ?? {};
  const currentGeneration = post?.identity?.generation ?? 0;
  const baseKey = String(key).replace(ALIAS_GENERATION_RE, '$1');
  let best = null;
  for (const [aliasKey, target] of Object.entries(aliases)) {
    const match = String(aliasKey).match(/^(.+?)@g(\d+)$/);
    if (match === null || match[1] !== baseKey) continue;
    const generation = parseInt(match[2], 10);
    if (generation > currentGeneration) continue;
    if (best === null || generation > best.generation) best = { generation, target };
  }
  return best === null ? null : best.target;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function acceptanceMap(pre, post) {
  const map = new Map();
  for (const [ticketKey, ticket] of flatTickets(pre)) {
    const targetKey = resolveKey(ticketKey, post);
    if (targetKey === null) continue;
    (ticket.acceptanceCriteria ?? []).forEach((criterion, index) => {
      const newAsset = acceptanceAssetId(targetKey, criterion);
      map.set(`${ticketKey}/acceptance[${index}]`, newAsset);
      map.set(acceptanceAssetId(ticketKey, criterion), newAsset);
    });
  }
  return map;
}

/** Every pre-condense key, live or absorbed, mapped to its post-condense survivor. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function buildCondenseKeyMap(pre, post) {
  const map = new Map();
  for (const key of liveKeys(pre)) {
    const target = resolveKey(key, post);
    if (target !== null) map.set(key, target);
  }
  for (const ticket of flatTickets(pre).values()) {
    for (const entry of ticket.condensedFrom?.tickets ?? []) {
      if (typeof entry.key !== 'string') continue;
      const target = resolveKey(entry.key, post);
      if (target !== null) map.set(entry.key, target);
    }
  }
  return map;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteAssetId(assetId, keyMap, criteria) {
  if (typeof assetId !== 'string') return assetId;
  if (criteria.has(assetId)) return criteria.get(assetId);
  const acceptance = assetId.match(/^(.+?)\/acceptance(?:\[|$)/);
  if (acceptance !== null) {
    const target = keyMap.get(acceptance[1]);
    if (target !== undefined) return assetId.replace(acceptance[1], target);
  }
  const target = keyMap.get(assetId);
  return target === undefined ? assetId : target;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteStableKey(stableKey, keyMap, criteria) {
  if (typeof stableKey !== 'string') return stableKey;
  const parts = stableKey.split('|');
  if (parts.length < 2) return stableKey;
  parts[1] = rewriteAssetId(parts[1], keyMap, criteria);
  return parts.join('|');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteSurface(surface, keyMap, criteria) {
  const assetId = rewriteAssetId(surface.assetId, keyMap, criteria);
  const ticketKey = surface.ticketKey === undefined
    ? undefined
    : (keyMap.get(surface.ticketKey) ?? surface.ticketKey);
  return {
    ...surface,
    assetId,
    ...(ticketKey === undefined ? {} : { ticketKey }),
  };
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteFinding(finding, keyMap, criteria) {
  return {
    ...rewriteSurface(finding, keyMap, criteria),
    stableKey: rewriteStableKey(finding.stableKey, keyMap, criteria),
  };
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteObligation(obligation, keyMap, criteria) {
  return rewriteSurface(obligation, keyMap, criteria);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteJudgment(judgment, keyMap, criteria) {
  return rewriteSurface(judgment, keyMap, criteria);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rewriteOmissionsValue(value, keyMap, criteria) {
  if (Array.isArray(value)) return value.map((entry) => rewriteOmissionsValue(entry, keyMap, criteria));
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' ? rewriteStableKey(value, keyMap, criteria) : value;
  }
  const result = {};
  for (const [field, entry] of Object.entries(value)) {
    if (field === 'originalTicketKey') result[field] = keyMap.get(entry) ?? entry;
    else if (field === 'omissionStableKey') result[field] = rewriteStableKey(entry, keyMap, criteria);
    else if (field === 'scope' && Array.isArray(entry)) {
      result[field] = entry.map((item) => rewriteStableKey(String(item), keyMap, criteria));
    } else result[field] = rewriteOmissionsValue(entry, keyMap, criteria);
  }
  return result;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function digestOf(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function keyFor(judgment) {
  return [judgment.surface ?? '', judgment.assetId ?? '', judgment.criterion ?? ''].join('|');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function rebaseOmissionArtifacts({ cwd, pre, post, dryRun = false } = {}) {
  const root = path.resolve(cwd ?? process.cwd());
  const keyMap = buildCondenseKeyMap(pre, post);
  const criteria = acceptanceMap(pre, post);

  const scanPath = path.join(root, GAP_SCAN_FILE);
  const ledgerPath = path.join(root, JUDGMENT_LEDGER_FILE);
  const indexPath = path.join(root, TICKET_INDEX_FILE);
  const convergencePath = path.join(root, CONVERGENCE_FILE);

  const scan = fs.existsSync(scanPath) ? readJson(scanPath) : { surfaces: [], findings: [], obligations: [] };
  const ledger = fs.existsSync(ledgerPath) ? readJson(ledgerPath) : { obligations: [], judgments: [] };
  const index = fs.existsSync(indexPath) ? readJson(indexPath) : { tickets: {} };
  const convergence = fs.existsSync(convergencePath) ? readJson(convergencePath) : { runs: [], baseline: [], accepted: {} };

  const surfaces = (scan.surfaces ?? []).map((surface) => rewriteSurface(surface, keyMap, criteria));
  const findings = (scan.findings ?? []).map((finding) => rewriteFinding(finding, keyMap, criteria));
  const obligations = (scan.obligations ?? ledger.obligations ?? []).map((obligation) => rewriteObligation(obligation, keyMap, criteria));
  const judgments = (ledger.judgments ?? []).map((judgment) => rewriteJudgment(judgment, keyMap, criteria));
  const digest = digestOf({ surfaces, findings, obligations });

  const rewrittenIndex = {};
  for (const [stableKey, value] of Object.entries(index.tickets ?? {})) {
    rewrittenIndex[rewriteStableKey(stableKey, keyMap, criteria)] = {
      ...value,
      sourceTicket: keyMap.get(value.sourceTicket) ?? value.sourceTicket,
    };
  }

  const baseline = (convergence.baseline ?? []).map((stableKey) => rewriteStableKey(stableKey, keyMap, criteria));
  const accepted = {};
  for (const [stableKey, value] of Object.entries(convergence.accepted ?? {})) {
    accepted[rewriteStableKey(stableKey, keyMap, criteria)] = value;
  }
  const runs = (convergence.runs ?? []).map((run) => ({ ...run, digest }));
  if (runs.length === 0) {
    runs.push({ digest, debt: { before: 0, after: 0 }, newTickets: 0, at: new Date().toISOString() });
  }

  const judgmentKeys = new Set(judgments.map(keyFor));
  const unrecorded = obligations.filter((obligation) => !judgmentKeys.has(keyFor(obligation)));

  const omissions = {};
  for (const name of fs.readdirSync(root)) {
    if (!OMISSIONS_PATTERN.test(name)) continue;
    const filePath = path.join(root, name);
    omissions[name] = rewriteOmissionsValue(readJson(filePath), keyMap, criteria);
  }

  const report = {
    ok: unrecorded.length === 0,
    digest,
    surfaces,
    findings,
    obligations,
    judgments,
    index: rewrittenIndex,
    baseline,
    convergence: { ...convergence, runs, baseline, accepted, latestDigest: digest },
    omissionsByFile: omissions,
    omissions: Object.values(omissions).flatMap((value) => value.omissions ?? []),
    unrecorded,
    rewrites: [
      GAP_SCAN_FILE,
      JUDGMENT_LEDGER_FILE,
      TICKET_INDEX_FILE,
      CONVERGENCE_FILE,
      ...Object.keys(omissions),
    ],
  };

  if (dryRun) return report;

  writeJson(scanPath, { ...scan, surfaces, findings, obligations, digest });
  writeJson(ledgerPath, { ...ledger, obligations, judgments });
  writeJson(indexPath, { ...index, tickets: rewrittenIndex });
  writeJson(convergencePath, { ...convergence, runs, baseline, accepted });
  for (const [name, value] of Object.entries(omissions)) {
    writeJson(path.join(root, name), value);
  }
  return report;
}

module.exports = {
  rebaseOmissionArtifacts,
  resolveKey,
  acceptanceMap,
  buildCondenseKeyMap,
  rewriteStableKey,
  rewriteAssetId,
  digestOf,
};

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match === undefined ? undefined : match.slice(prefix.length);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function newestPreCondenseArchive(directory) {
  const names = fs.readdirSync(directory)
    .filter((name) => name.startsWith('Tickets.pre-condense-') && name.endsWith('.json'))
    .sort();
  return names.length === 0 ? null : path.join(directory, names[names.length - 1]);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function main(argv = process.argv) {
  const args = argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') ?? process.cwd());
  const ticketsPath = path.resolve(cwd, argumentValue(args, 'tickets') ?? 'Tickets.json');
  const prePath = newestPreCondenseArchive(cwd);
  if (prePath === null) {
    process.stdout.write(JSON.stringify({ ok: true, skipped: 'no-pre-condense-archive' }, null, 2) + '\n');
    return 0;
  }
  const report = rebaseOmissionArtifacts({
    cwd,
    pre: readJson(prePath),
    post: readJson(ticketsPath),
    dryRun: args.includes('--dry-run'),
  });
  process.stdout.write(JSON.stringify({
    ok: report.ok,
    digest: report.digest,
    rewrites: report.rewrites,
    unrecorded: report.unrecorded.length,
  }, null, 2) + '\n');
  return report.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());
