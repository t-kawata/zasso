'use strict';

/**
 * normalize-ticket-ids — repair an existing package's ticket numbering.
 *
 * This command applies the same identity rule condensation uses, but it never
 * re-condenses: it only makes every non-excluded phase dense and rewrites every live
 * reference. History is left in place and gains the generation it belongs to, so
 * `restore-condensed-tickets.js` and a reader can still resolve an old key.
 *
 * Usage:
 *   node normalize-ticket-ids.js --check --tickets=<Tickets.json>
 *   node normalize-ticket-ids.js --apply --tickets=<Tickets.json>
 *   node normalize-ticket-ids.js --check --workspace=<root>
 *   node normalize-ticket-ids.js --apply --workspace=<root> [--archives=<dir>]...
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  renumberDocument,
  validateIdentity,
  buildArchiveAliasMap,
  buildDenseRenumberMap,
  collectKeyTokens,
  ticketKeyOf,
  KEY_TOKEN_PATTERN,
  HISTORICAL_FIELDS,
  IDENTITY_FIELD,
  DEFAULT_EXCLUDED_PHASES,
} = require('./lib/ticket-identity-renumber.js');
const { validateTickets } = require('../lib/validate-tickets.js');
const {
  writeTicketDistributionAggregate,
  refreshTicketDistributionDigests,
  writeJsonAtomically,
} = require('./add-tickets-for-phase.js');
const { discoverTicketFiles } = require('./restore-condensed-tickets.js');
const { findAllocateManifest, findSingleSiblingPath } = require('../lib/package-artifacts.js');

const ARCHIVE_PREFIX = 'Tickets.pre-renumber-';
const ARCHIVE_GLOB_PREFIX = 'Tickets.pre-';
/** Fields whose grammar is a ticket key; neutralization must not rewrite them. */
const STRUCTURED_KEY_FIELDS = Object.freeze(['ticket', 'implementerTicketKey']);
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const EXIT_ARG_ERROR = 2;
const STAMP_PATTERN = /[:.]/g;

/** Parse and normalize the excluded phase list. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function excludedPhasesOf(options = {}) {
  const list = new Set(DEFAULT_EXCLUDED_PHASES);
  if (options.includePx === true) list.delete(-1);
  for (const phaseId of options.excludePhases ?? []) list.add(phaseId);
  return [...list];
}

/** Every pre-repair/pre-condense archive beside a package or in an explicit directory. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function readArchives(directories) {
  const documents = [];
  for (const directory of new Set(directories.filter((entry) => typeof entry === 'string'))) {
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.startsWith(ARCHIVE_GLOB_PREFIX) || !name.endsWith('.json')) continue;
      // A repair snapshot is not a pre-consolidation source; reading it back would let
      // an older numbering resolve keys this repair is about to rewrite.
      if (name.startsWith(ARCHIVE_PREFIX)) continue;
      try {
        documents.push(JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
      } catch {
        // A corrupt archive is not a repair source; the caller still reports unresolved keys.
      }
    }
  }
  return documents;
}

/** The current ticket that owns each file the package declares. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function fileOwnersOf(document) {
  const owners = new Map();
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      const key = ticketKeyOf({ ...ticket, phaseId: phase.id });
      for (const file of ticket.default_files ?? []) {
        if (!owners.has(file)) owners.set(file, new Set());
        owners.get(file).add(key);
      }
    }
  }
  return owners;
}

/**
 * Replace a key that no current ticket owns.
 *
 * A path named in the same sentence is deterministic evidence: when exactly one current
 * ticket declares it, that ticket is the successor. Otherwise the old identity is kept
 * as a plain label (`legacy ticket 4.1`) so the prose stops naming a live-key-shaped
 * ticket that does not exist. The original key is recorded in `identity.legacyReferences`.
 */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function unresolvedReplacement(text, key, fileOwners) {
  // A sentence that names several tickets cannot attribute one file to one of them.
  // Only a single-key sentence uses the declared-file owner as evidence.
  const keyCount = [...text.matchAll(new RegExp(KEY_TOKEN_PATTERN.source, 'g'))].length;
  if (keyCount === 1) {
    const paths = [...text.matchAll(/`([^`]+\.(?:rs|toml|md|json|ts|js))`/g)].map((match) => match[1]);
    const owners = new Set();
    for (const file of paths) {
      for (const owner of fileOwners.get(file) ?? []) owners.add(owner);
    }
    if (owners.size === 1) return [...owners][0];
  }
  const phase = /^P(-?\d+)-/.exec(key);
  const ticketId = /-(\d+)$/.exec(key);
  if (phase === null || ticketId === null) return 'legacy ticket';
  return phase[1] === '-1'
    ? `legacy ticket PX.${ticketId[1]}`
    : `legacy ticket ${phase[1]}.${ticketId[1]}`;
}

/**
 * Neutralize a pre-existing dangling key before a repair.
 *
 * This is a migration-only pass. The strict condense path still refuses an unresolved
 * key; the repair command may replace it with a current owner or a non-key label, and
 * records every replacement in `identity.legacyReferences`.
 */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function neutralizeUnresolvedReferences(document, options = {}) {
  const excluded = new Set(options.excludedPhases ?? excludedPhasesOf(options));
  const plan = buildDenseRenumberMap(document?.phases ?? [], { excludedPhases: [...excluded] });
  const resolvable = new Set(plan.keyMap.keys());
  for (const key of options.archiveAliases?.keys?.() ?? []) resolvable.add(key);
  for (const finding of options.archiveAliases?.findings ?? []) resolvable.add(finding.key);
  const fileOwners = fileOwnersOf(document);
  const generation = document?.identity?.generation ?? 0;
  const legacyReferences = { ...(document?.identity?.legacyReferences ?? {}) };
  let changed = false;

  const transformValue = (value, path) => {
    if (typeof value === 'string') {
      return value.replace(new RegExp(KEY_TOKEN_PATTERN.source, 'g'), (match, prefix, key) => {
        if (resolvable.has(key)) return match;
        const replacement = unresolvedReplacement(value, key, fileOwners);
        legacyReferences[`${key}@g${generation}`] = replacement;
        changed = true;
        return prefix + replacement;
      });
    }
    if (Array.isArray(value)) return value.map((entry, index) => transformValue(entry, `${path}[${index}]`));
    if (value !== null && typeof value === 'object') {
      const transformed = {};
      for (const [field, entry] of Object.entries(value)) {
        if (HISTORICAL_FIELDS.includes(field) || STRUCTURED_KEY_FIELDS.includes(field) || field === IDENTITY_FIELD) {
          transformed[field] = entry;
          continue;
        }
        transformed[field] = transformValue(entry, `${path}.${field}`);
      }
      return transformed;
    }
    return value;
  };

  const clone = JSON.parse(JSON.stringify(document));
  clone.phases = (clone.phases ?? []).map((phase, index) => {
    if (excluded.has(phase.id)) return phase;
    return { ...phase, tickets: transformValue(phase.tickets ?? [], `$.phases[${index}].tickets`) };
  });

  // Historical text is not rewritten, but a key whose owner is lost still needs a
  // resolution. Record it as a legacy label so the identity gate can distinguish
  // "recorded history" from "a live reference that points at nothing".
  const recordHistorical = (value, entryGeneration) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(new RegExp(KEY_TOKEN_PATTERN.source, 'g'))) {
        const key = match[2];
        if (resolvable.has(key)) continue;
        const alreadyRecorded = Object.keys(legacyReferences).some((entry) => entry.startsWith(`${key}@g`));
        if (alreadyRecorded) continue;
        legacyReferences[`${key}@g${entryGeneration}`] = unresolvedReplacement(value, key, fileOwners);
        changed = true;
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) recordHistorical(entry, entryGeneration);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const entry of Object.values(value)) recordHistorical(entry, entryGeneration);
    }
  };
  for (const phase of clone.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      for (const entry of ticket.changes ?? []) {
        recordHistorical(entry, entry?.generation ?? generation);
      }
      if (ticket.condensedFrom !== undefined) {
        recordHistorical(ticket.condensedFrom, ticket.condensedFrom?.generation ?? generation);
      }
    }
  }
  return changed ? { document: clone, legacyReferences, changed } : { document, legacyReferences, changed: false };
}

/** Plan a repair without writing. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function planNormalization(document, options = {}) {
  const archiveDocuments = options.archiveDocuments ?? [];
  const archiveAliases = options.archiveAliases ?? buildArchiveAliasMap(archiveDocuments, document);
  const result = renumberDocument(document, {
    excludedPhases: options.excludedPhases ?? excludedPhasesOf(options),
    archiveAliasMap: archiveAliases,
    forceChanged: options.forceChanged === true,
    legacyReferences: options.legacyReferences ?? {},
  });
  // An archive may share a boundary node id across phases. That ambiguity only matters
  // when the key is still unresolved and a live field actually names it; an archive key
  // the ledger or the live map already owns is not a repair source.
  const liveKeys = new Set();
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase?.tickets ?? []) {
      for (const token of collectKeyTokens(ticket, '$', [], true)) liveKeys.add(token.key);
    }
  }
  const relevantArchiveFindings = archiveAliases.findings
    .filter((finding) => !result.keyMap.has(finding.key) && liveKeys.has(finding.key));
  const ambiguousKeys = new Set(relevantArchiveFindings.map((finding) => finding.key));
  const unresolved = result.findings
    .filter((finding) => !(finding.code === 'IDENTITY_HISTORY_UNRESOLVED' && ambiguousKeys.has(finding.key)));
  return {
    ...result,
    findings: [...relevantArchiveFindings, ...unresolved],
    stats: { ...result.stats, archives: archiveDocuments.length },
  };
}

/** Run the package gates the repair must not bypass. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function runPackageGates(directory, ticketsPath) {
  const scripts = [
    ['tickets/verify-all-ticket-coverage.js', [ticketsPath]],
    ['tickets/verify-ticket-closure.js', [`--tickets=${ticketsPath}`]],
  ];
  const allocatePath = findAllocateManifest(directory);
  if (allocatePath !== null) {
    const workspaceRoot = path.dirname(allocatePath);
    const artifactPath = findSingleSiblingPath(workspaceRoot, '-sequences.json');
    if (artifactPath !== null) {
      scripts.push([
        'sequences-slice/verify-chain.mjs',
        ['--stage=split', `--package=${directory}`, `--artifact=${artifactPath}`, '--require-tickets'],
      ]);
    }
  }
  scripts.push(['sequences-slice/verify-implementation-order.mjs', [`--package=${directory}`, '--write']]);
  for (const [relative, args] of scripts) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', relative), ...args], { encoding: 'utf8' });
    if (result.status !== 0) {
      return { ok: false, code: 'IDENTITY_GATE_FAILED', detail: `${relative}: ${(result.stderr || result.stdout || '').trim()}` };
    }
  }
  return { ok: true };
}

/** The distribution aggregate is keyed by ticket identity, so it is rebuilt, never string-remapped. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function rebuildDistributionAggregate(document) {
  const carriesDistribution = (document.phases ?? [])
    .some((phase) => (phase.tickets ?? []).some((ticket) => ticket.distribution !== undefined));
  if (carriesDistribution) {
    // A renumber rewrites the obligation's implementer key and numeric id, so the
    // per-ticket digest is stale even before the aggregate is rebuilt.
    refreshTicketDistributionDigests(document.phases ?? []);
    writeTicketDistributionAggregate(document);
  }
  return document;
}

/** Repair one package. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function normalizeTickets(options = {}) {
  const ticketsPath = path.resolve(options.ticketsPath ?? 'Tickets.json');
  if (!fs.existsSync(ticketsPath)) return { ok: false, code: 'TICKETS_MISSING', detail: ticketsPath };
  const directory = path.dirname(ticketsPath);
  const original = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const archiveDocuments = readArchives([directory, ...(options.archives ?? [])]);
  const excluded = excludedPhasesOf(options);
  const archiveAliases = buildArchiveAliasMap(archiveDocuments, original);
  const neutralized = options.strictUnresolved === true
    ? { document: original, legacyReferences: {}, changed: false }
    : neutralizeUnresolvedReferences(original, { excludedPhases: excluded, archiveAliases });
  const plan = planNormalization(neutralized.document, {
    archiveDocuments,
    archiveAliases,
    excludedPhases: excluded,
    forceChanged: neutralized.changed,
    legacyReferences: neutralized.legacyReferences,
  });

  if (plan.findings.length > 0) {
    return { ok: false, code: plan.findings[0].code, findings: plan.findings, ticketsPath };
  }
  if (!plan.changed) {
    return {
      ok: true,
      noChange: true,
      changed: false,
      ticketsPath,
      generationBefore: plan.generationBefore,
      generation: plan.generation,
      findings: [],
    };
  }
  if (options.apply !== true) {
    return {
      ok: true,
      dryRun: true,
      changed: true,
      ticketsPath,
      generationBefore: plan.generationBefore,
      generation: plan.generation,
      findings: [],
      document: plan.document,
    };
  }

  const candidate = rebuildDistributionAggregate(plan.document);
  const validation = validateTickets(candidate);
  if (!validation.valid) {
    return { ok: false, code: 'IDENTITY_VALIDATION_FAILED', errors: validation.errors, ticketsPath };
  }
  const identity = validateIdentity(candidate, { requireDense: true });
  if (!identity.ok) {
    return { ok: false, code: identity.findings[0].code, findings: identity.findings, ticketsPath };
  }

  const stamp = new Date().toISOString().replace(STAMP_PATTERN, '-');
  const archivePath = path.join(directory, `${ARCHIVE_PREFIX}${stamp}.json`);
  fs.copyFileSync(ticketsPath, archivePath);
  writeJsonAtomically(ticketsPath, candidate);

  const verdict = typeof options.verify === 'function'
    ? options.verify({ ticketsPath, directory, document: candidate })
    : (options.runGates === true ? runPackageGates(directory, ticketsPath) : { ok: true });
  if (verdict !== undefined && verdict !== null && verdict.ok === false) {
    fs.copyFileSync(archivePath, ticketsPath);
    return { ok: false, code: verdict.code ?? 'IDENTITY_GATE_FAILED', detail: verdict.detail, ticketsPath };
  }

  return {
    ok: true,
    noChange: false,
    changed: true,
    ticketsPath,
    archivePath,
    generationBefore: plan.generationBefore,
    generation: plan.generation,
    findings: [],
  };
}

/** Check or repair every Tickets.json below a workspace root. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function normalizeWorkspace(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? '.');
  const targets = discoverTicketFiles(workspaceRoot);
  const results = targets.map((ticketsPath) => normalizeTickets({ ...options, ticketsPath, archives: options.archives ?? [] }));
  const changed = results.filter((entry) => entry.ok === true && entry.changed === true).length;
  if (options.apply === true && changed > 0 && options.verifyWorkspace !== false) {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'sequences-slice', 'verify-implementation-order.mjs'),
      `--workspace=${workspaceRoot}`,
      '--write',
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      results.push({ ok: false, code: 'IDENTITY_GATE_FAILED', detail: `workspace order: ${(result.stderr || result.stdout || '').trim()}` });
    }
  }
  return {
    ok: results.every((entry) => entry.ok === true),
    workspaceRoot,
    documents: results.length,
    changed: results.filter((entry) => entry.ok === true && entry.changed === true).length,
    noChange: results.filter((entry) => entry.ok === true && entry.noChange === true).length,
    failed: results.filter((entry) => entry.ok === false).length,
    results,
  };
}

/** Render the result as Markdown. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function renderReport(result) {
  const lines = [];
  if (Array.isArray(result.results)) {
    lines.push(`workspace ${result.workspaceRoot}: documents=${result.documents} changed=${result.changed} noChange=${result.noChange} failed=${result.failed}`);
    for (const entry of result.results) {
      const name = path.relative(result.workspaceRoot, entry.ticketsPath ?? result.workspaceRoot) || '.';
      if (entry.ok === false) lines.push(`FAILED ${name} ${entry.code}: ${entry.detail ?? ''}`);
      else if (entry.noChange === true) lines.push(`NO_CHANGE ${name}`);
      else lines.push(`RENUMBER ${name} generation ${entry.generationBefore} -> ${entry.generation}`);
    }
  } else if (result.ok === false) {
    lines.push(`FAILED ${result.ticketsPath ?? ''} ${result.code}: ${result.detail ?? ''}`);
    for (const finding of result.findings ?? []) {
      lines.push(`- ${finding.code} ${finding.path ?? ''} ${finding.key ?? finding.alias ?? ''}`);
    }
  } else if (result.noChange === true) {
    lines.push(`NO_CHANGE ${result.ticketsPath}`);
  } else if (result.dryRun === true) {
    lines.push(`WOULD_RENUMBER ${result.ticketsPath} generation ${result.generationBefore} -> ${result.generation}`);
  } else {
    lines.push(`RENUMBERED ${result.ticketsPath} generation ${result.generationBefore} -> ${result.generation} archive=${path.basename(result.archivePath)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Parse the CLI. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = {
    ticketsPath: null,
    workspaceRoot: null,
    apply: false,
    archives: [],
    excludePhases: [],
    includePx: false,
    runGates: true,
    json: false,
    strictUnresolved: false,
  };
  for (const argument of argv.slice(2)) {
    if (argument.startsWith('--tickets=')) options.ticketsPath = argument.slice('--tickets='.length);
    else if (argument.startsWith('--workspace=')) options.workspaceRoot = argument.slice('--workspace='.length);
    else if (argument.startsWith('--archives=')) options.archives.push(argument.slice('--archives='.length));
    else if (argument.startsWith('--exclude-phase=')) options.excludePhases.push(parseInt(argument.slice('--exclude-phase='.length), 10));
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--check') options.apply = false;
    else if (argument === '--include-px') options.includePx = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--strict-unresolved') options.strictUnresolved = true;
    else if (argument === '--no-gates') options.runGates = false;
    else return null;
  }
  if (options.ticketsPath === null && options.workspaceRoot === null) return null;
  for (const phaseId of options.excludePhases) {
    if (!Number.isInteger(phaseId)) return null;
  }
  return options;
}

/** CLI entry point. */
// [::TICKET::] PX-402 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-402 --for-spec --no-implementation-order`.
function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options === null) {
    process.stderr.write('Usage: normalize-ticket-ids.js (--tickets=<Tickets.json> | --workspace=<root>) [--check|--apply] [--archives=<dir>]... [--exclude-phase=<id>]... [--include-px] [--strict-unresolved] [--json]\n');
    return EXIT_ARG_ERROR;
  }
  const result = options.workspaceRoot === null
    ? normalizeTickets(options)
    : normalizeWorkspace(options);
  if (options.json === true) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(renderReport(result));
  return result.ok === true ? EXIT_SUCCESS : EXIT_FAILURE;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  ARCHIVE_PREFIX,
  excludedPhasesOf,
  readArchives,
  fileOwnersOf,
  unresolvedReplacement,
  neutralizeUnresolvedReferences,
  planNormalization,
  normalizeTickets,
  normalizeWorkspace,
  renderReport,
  parseArgs,
  main,
};
