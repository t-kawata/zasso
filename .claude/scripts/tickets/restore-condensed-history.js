'use strict';

/**
 * restore-condensed-history — deterministic ledger-provenance restoration.
 *
 * Earlier condensation generations dropped nested condensedFrom chains, changes,
 * splitReason, round and contract/formula ownership from the ledger records. The
 * tracked Tickets.pre-condense-*.json archives still hold those values. This tool
 * merges the missing values into the current document without rolling the package
 * back and without overwriting a non-empty value.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { ticketKeyOf } = require('./lib/ticket-identity-renumber.js');
const { validateIdentity } = require('./lib/ticket-identity-renumber.js');
const { validateTickets } = require('../lib/validate-tickets.js');
const {
  ARCHIVE_PREFIX,
  discoverTicketFiles,
} = require('./restore-condensed-tickets.js');

const PRE_RESTORE_PREFIX = 'Tickets.pre-restore-';
const DEFAULT_EXCLUDED_PHASES = Object.freeze([-1]);

/** Fields the ledger record may recover from the archive. */
const RESTORABLE_FIELDS = Object.freeze([
  'changes',
  'splitReason',
  'round',
  'contracts',
  'formulaObligations',
  'distribution',
  'prerequisites',
  'mergeAttempts',
]);

/** Fields whose provenance is compared by id before it is copied. */
const PROVENANCE_FIELDS = Object.freeze(['contracts', 'formulaObligations']);

/** Fields that are data, not authored prose; retained for the report. */
const AUTHORED_FIELDS = Object.freeze([
  'changes',
  'splitReason',
  'round',
  'contracts',
  'formulaObligations',
]);

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function writeAtomically(filePath, content) {
  const temporary = `${filePath}.restore-history-tmp`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, filePath);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function allTickets(document) {
  const tickets = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      tickets.push({ ticket, phaseId: phase.id, key: ticketKeyOf({ ...ticket, phaseId: phase.id }) });
    }
  }
  return tickets;
}

/** The archive files of one package, deduplicated by content digest. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function readArchiveIndex(directory) {
  if (!fs.existsSync(directory)) return { archives: [], byKey: new Map(), byKeyGeneration: new Map() };
  const names = fs.readdirSync(directory)
    .filter((name) => name.startsWith(ARCHIVE_PREFIX) && name.endsWith('.json'))
    .sort();
  const seen = new Set();
  const archives = [];
  for (const name of names) {
    const filePath = path.join(directory, name);
    const content = fs.readFileSync(filePath, 'utf8');
    const digest = createHash('sha256').update(content).digest('hex');
    if (seen.has(digest)) continue;
    seen.add(digest);
    let document;
    try {
      document = JSON.parse(content);
    } catch {
      archives.push({ name, filePath, error: 'ARCHIVE_UNREADABLE' });
      continue;
    }
    archives.push({ name, filePath, document });
  }

  const byKey = new Map();
  const byKeyGeneration = new Map();
  for (const archive of archives) {
    if (archive.document === undefined) continue;
    const generation = archive.document.identity?.generation ?? 0;
    for (const { ticket, key } of allTickets(archive.document)) {
      byKey.set(key, ticket);
      const entryGeneration = ticket.condensedFrom?.generation ?? generation;
      byKeyGeneration.set(`${key}@g${entryGeneration}`, ticket);
    }
  }
  return { archives, byKey, byKeyGeneration };
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function resolveArchivedTicket(index, key, generation) {
  return index.byKeyGeneration.get(`${key}@g${generation}`) ?? index.byKey.get(key) ?? null;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function addAlias(document, aliasKey, target, findings, liveKeys) {
  if (!document.identity) {
    document.identity = { generation: 0, aliases: {}, excludedPhases: [...DEFAULT_EXCLUDED_PHASES] };
  }
  document.identity.aliases = document.identity.aliases ?? {};
  const existing = document.identity.aliases[aliasKey];
  if (existing !== undefined) {
    // The current identity is authoritative. Keep a live resolution; a missing
    // target is the only case the restoration may repair.
    if (liveKeys.has(existing)) return true;
    if (existing === target) return true;
    findings.push({
      code: 'ALIAS_CONFLICT',
      problem: `${aliasKey} is already owned by missing target ${existing}, not ${target}`,
      aliasKey,
      existing,
      target,
    });
    return false;
  }
  document.identity.aliases[aliasKey] = target;
  return true;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function mergeProvenanceArray(authoredRecord, archivedTicket, field, findings, stats) {
  const archivedValue = archivedTicket?.[field];
  const currentValue = authoredRecord[field];
  if (!hasValue(archivedValue)) return 0;
  if (!hasValue(currentValue)) {
    authoredRecord[field] = cloneJson(archivedValue);
    stats.fields.add(field);
    return Array.isArray(archivedValue) ? archivedValue.length : 1;
  }
  if (!Array.isArray(currentValue) || !Array.isArray(archivedValue)) return 0;

  const byId = new Map();
  for (const entry of currentValue) {
    if (entry && typeof entry.id === 'string') byId.set(entry.id, entry);
  }
  let added = 0;
  for (const entry of archivedValue) {
    const id = entry?.id;
    if (typeof id !== 'string') continue;
    const existing = byId.get(id);
    if (existing === undefined) {
      currentValue.push(cloneJson(entry));
      added += 1;
      continue;
    }
    if (stableStringify(existing) !== stableStringify(entry)) {
      findings.push({
        code: field === 'contracts' ? 'CONTRACT_PROVENANCE_CONFLICT' : 'FORMULA_PROVENANCE_CONFLICT',
        problem: `${field} id ${id} has different content in the archive`,
        field,
        id,
      });
    }
  }
  if (added > 0) stats.fields.add(field);
  return added;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function liveAliasTarget(liveKeys, key, fallback) {
  return liveKeys.has(key) ? key : fallback;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function restoreNestedLedger(document, survivorKey, survivorTicket, entry, archivedTicket, findings, stats, liveKeys) {
  const archivedNested = archivedTicket?.condensedFrom;
  if (!archivedNested || !Array.isArray(archivedNested.tickets)) return 0;
  const record = entry.record ?? (entry.record = {});
  const restoredInnerKeys = new Set();

  if (!record.condensedFrom) {
    record.condensedFrom = cloneJson(archivedNested);
    for (const inner of archivedNested.tickets) restoredInnerKeys.add(`${inner.key}@g${inner.generation ?? 0}`);
  } else {
    record.condensedFrom.tickets = record.condensedFrom.tickets ?? [];
    for (const inner of archivedNested.tickets) {
      const innerGeneration = inner.generation ?? archivedNested.generation ?? 0;
      const present = record.condensedFrom.tickets.some((candidate) => (
        candidate.key === inner.key && (candidate.generation ?? 0) === innerGeneration
      ));
      if (!present) {
        record.condensedFrom.tickets.push(cloneJson(inner));
        restoredInnerKeys.add(`${inner.key}@g${innerGeneration}`);
      }
    }
  }

  const survivorLedger = survivorTicket.condensedFrom.tickets;
  for (const inner of archivedNested.tickets) {
    const innerGeneration = inner.generation ?? archivedNested.generation ?? 0;
    const present = survivorLedger.some((candidate) => (
      candidate.key === inner.key && (candidate.generation ?? 0) === innerGeneration
    ));
    if (!present) {
      survivorLedger.push(cloneJson(inner));
      restoredInnerKeys.add(`${inner.key}@g${innerGeneration}`);
    }
    addAlias(document, `${inner.key}@g${innerGeneration}`, survivorKey, findings, liveKeys);
    if (typeof inner.originKey === 'string') {
      addAlias(
        document,
        `${inner.originKey}@g${innerGeneration}`,
        liveAliasTarget(liveKeys, inner.originKey, survivorKey),
        findings,
        liveKeys,
      );
    }
  }

  stats.nested += restoredInnerKeys.size;
  return restoredInnerKeys.size;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function snapshotNonTodo(document) {
  return JSON.stringify(allTickets(document)
    .filter((entry) => (entry.ticket.status ?? 'todo') !== 'todo')
    .map((entry) => {
      const { condensedFrom, ...authoredFields } = entry.ticket;
      return authoredFields;
    }));
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function findingIdentity(finding) {
  return [finding.code ?? '', finding.key ?? finding.alias ?? '', finding.path ?? '', finding.detail ?? ''].join('|');
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function newFindings(before, after) {
  const known = new Set((before ?? []).map(findingIdentity));
  return (after ?? []).filter((finding) => !known.has(findingIdentity(finding)));
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function verifyRestoration(document, nonTodoSnapshot, findings, beforeState = {}) {
  if (findings.some((finding) => finding.code.endsWith('_CONFLICT'))) {
    return { ok: false, code: findings[0].code, findings };
  }
  const schema = validateTickets(document);
  const schemaBefore = beforeState.schema ?? { valid: true, errors: [] };
  const newSchemaErrors = (schema.errors ?? []).filter((error) => !(schemaBefore.errors ?? []).includes(error));
  if (!schema.valid && newSchemaErrors.length > 0) {
    return {
      ok: false,
      code: 'RESTORE_SCHEMA_INVALID',
      findings: newSchemaErrors.map((problem) => ({ code: 'RESTORE_SCHEMA_INVALID', problem })),
    };
  }
  const identity = validateIdentity(document, { requireDense: true });
  const identityBefore = beforeState.identity ?? { ok: true, findings: [] };
  const introduced = newFindings(identityBefore.findings, identity.findings);
  if (introduced.length > 0) {
    return { ok: false, code: introduced[0].code, findings: introduced };
  }
  if (snapshotNonTodo(document) !== nonTodoSnapshot) {
    return { ok: false, code: 'RESTORE_NON_TODO_CHANGED', findings: [{ code: 'RESTORE_NON_TODO_CHANGED', problem: 'a non-todo ticket changed' }] };
  }
  return { ok: true };
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function planPackageRestoration(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    return { ok: false, status: 'failed', findings: [{ code: 'RESTORE_TICKETS_MISSING', problem: ticketsPath }] };
  }
  const directory = path.dirname(ticketsPath);
  const index = readArchiveIndex(directory);
  if (index.archives.length === 0) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'no-archive',
      ticketsPath,
      report: { packages: [{ ticketsPath, archives: 0, ledgerEntries: 0, restoredFields: [], restoredNested: 0, restoredContracts: 0, restoredFormulas: 0, unresolved: [], unchanged: 0 }] },
      findings: [],
    };
  }

  const document = readJson(ticketsPath);
  const liveKeys = new Set(allTickets(document).map((entry) => entry.key));
  const beforeState = {
    schema: validateTickets(document),
    identity: validateIdentity(document, { requireDense: true }),
  };
  const findings = [];
  const stats = {
    fields: new Set(),
    nested: 0,
    contracts: 0,
    formulas: 0,
    ledgerEntries: 0,
    unchanged: 0,
    unresolved: [],
  };

  for (const { ticket, key: survivorKey } of allTickets(document)) {
    if (!Array.isArray(ticket.condensedFrom?.tickets)) continue;
    for (const entry of ticket.condensedFrom.tickets) {
      stats.ledgerEntries += 1;
      const generation = entry.generation ?? ticket.condensedFrom.generation ?? 0;
      const aliasTarget = typeof entry.originKey === 'string'
        && liveKeys.has(entry.originKey)
        ? entry.originKey
        : survivorKey;
      addAlias(document, `${entry.key}@g${generation}`, aliasTarget, findings, liveKeys);
      if (typeof entry.originKey === 'string') {
        addAlias(
          document,
          `${entry.originKey}@g${generation}`,
          liveAliasTarget(liveKeys, entry.originKey, aliasTarget),
          findings,
          liveKeys,
        );
      }

      const archivedTicket = resolveArchivedTicket(index, entry.key, generation);
      if (archivedTicket === null) {
        stats.unresolved.push({ key: entry.key, generation });
        continue;
      }

      const record = entry.record ?? (entry.record = {});
      const before = stableStringify(record);
      for (const field of RESTORABLE_FIELDS) {
        if (PROVENANCE_FIELDS.includes(field)) continue;
        if (hasValue(record[field])) continue;
        if (!hasValue(archivedTicket[field])) continue;
        record[field] = cloneJson(archivedTicket[field]);
        stats.fields.add(field);
      }
      const contractCount = mergeProvenanceArray(record, archivedTicket, 'contracts', findings, stats);
      if (contractCount > 0) stats.contracts += 1;
      const formulaCount = mergeProvenanceArray(record, archivedTicket, 'formulaObligations', findings, stats);
      if (formulaCount > 0) stats.formulas += 1;
      restoreNestedLedger(document, survivorKey, ticket, entry, archivedTicket, findings, stats, liveKeys);
      if (stableStringify(record) === before) stats.unchanged += 1;
    }
  }

  if (stats.unresolved.length > 0) {
    findings.push({
      code: 'ARCHIVE_KEY_MISSING',
      problem: `no archive entry for ${stats.unresolved.map((entry) => `${entry.key}@g${entry.generation}`).join(', ')}`,
      unresolved: stats.unresolved,
    });
  }
  if (index.archives.some((archive) => archive.error)) {
    findings.push({ code: 'ARCHIVE_UNREADABLE', problem: 'one or more archives are not valid JSON' });
  }

  const changed = stats.fields.size > 0 || stats.nested > 0 || stats.contracts > 0 || stats.formulas > 0;
  return {
    ok: !findings.some((finding) => finding.code.endsWith('_CONFLICT') || finding.code === 'ARCHIVE_UNREADABLE'),
    status: changed ? 'ready' : 'no-change',
    ticketsPath,
    document,
    directory,
    nonTodoSnapshot: snapshotNonTodo(document),
    beforeState,
    report: {
      packages: [{
        ticketsPath,
        archives: index.archives.length,
        ledgerEntries: stats.ledgerEntries,
        restoredFields: [...stats.fields].sort(),
        restoredNested: stats.nested,
        restoredContracts: stats.contracts,
        restoredFormulas: stats.formulas,
        unresolved: stats.unresolved,
        unchanged: stats.unchanged,
      }],
    },
    findings,
  };
}

/** Only a failed inspection creates a ticket. */
// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function selectInspectionTickets(gaps) {
  return (gaps ?? []).filter((gap) => gap?.passed === false);
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function restoreCondensedHistory({ ticketsPath, apply = false, verify = null } = {}) {
  const plan = planPackageRestoration(ticketsPath);
  if (!plan.ok) {
    return { status: 'failed', report: plan.report, findings: plan.findings ?? [] };
  }
  if (plan.status === 'skipped' || plan.status === 'no-change') {
    return { status: plan.status, reason: plan.reason, report: plan.report, findings: plan.findings ?? [] };
  }
  if (!apply) {
    return { status: 'ready', report: plan.report, findings: plan.findings ?? [] };
  }

  const directory = plan.directory;
  const originalBytes = fs.readFileSync(ticketsPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const preRestorePath = path.join(directory, `${PRE_RESTORE_PREFIX}${stamp}.json`);
  fs.writeFileSync(preRestorePath, originalBytes);
  writeAtomically(ticketsPath, `${JSON.stringify(plan.document, null, 2)}\n`);

  const defaultVerify = verifyRestoration(plan.document, plan.nonTodoSnapshot, plan.findings ?? [], plan.beforeState);
  const customVerify = typeof verify === 'function' ? verify({ document: plan.document, plan }) : undefined;
  const verified = defaultVerify.ok && (customVerify === undefined || customVerify.ok !== false);

  if (!verified) {
    writeAtomically(ticketsPath, originalBytes);
    return {
      status: 'rolled-back',
      preRestorePath,
      report: plan.report,
      findings: [
        ...(plan.findings ?? []),
        ...(defaultVerify.ok ? [] : (defaultVerify.findings ?? [])),
        ...(customVerify && customVerify.ok === false ? [{ code: customVerify.code ?? 'RESTORE_VERIFY_FAILED', problem: 'custom verify failed' }] : []),
      ],
    };
  }
  return { status: 'applied', preRestorePath, report: plan.report, findings: plan.findings ?? [] };
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function renderRestorationReport(results, workspace) {
  const lines = [];
  let applied = 0;
  let ready = 0;
  let noChange = 0;
  let skipped = 0;
  let failed = 0;
  for (const result of results) {
    const packageReport = result.report?.packages?.[0] ?? {};
    const label = packageReport.ticketsPath ?? '<unknown>';
    if (result.status === 'applied') {
      applied += 1;
      lines.push(`APPLIED ${label} archives=${packageReport.archives} restored=${packageReport.restoredFields.join(',') || '-'} nested=${packageReport.restoredNested} contracts=${packageReport.restoredContracts} formulas=${packageReport.restoredFormulas} unresolved=${packageReport.unresolved.length}`);
    } else if (result.status === 'ready') {
      ready += 1;
      lines.push(`READY ${label} archives=${packageReport.archives} restored=${packageReport.restoredFields.join(',') || '-'} nested=${packageReport.restoredNested}`);
    } else if (result.status === 'no-change') {
      noChange += 1;
      lines.push(`NO_CHANGE ${label}`);
    } else if (result.status === 'skipped') {
      skipped += 1;
      lines.push(`SKIPPED ${label} ${result.reason}`);
    } else {
      failed += 1;
      lines.push(`FAILED ${label} ${(result.findings ?? []).map((finding) => finding.code).join(',') || result.status}`);
    }
  }
  lines.push(`restore summary: applied=${applied} ready=${ready} noChange=${noChange} skipped=${skipped} failed=${failed}`);
  if (workspace) lines.unshift(`workspace ${workspace}`);
  return `${lines.join('\n')}\n`;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function parseArgs(argv) {
  const options = { ticketsPath: null, workspace: null, packageName: null, apply: false, reportPath: null };
  for (const argument of argv.slice(2)) {
    if (argument.startsWith('--tickets=')) options.ticketsPath = path.resolve(argument.slice('--tickets='.length));
    else if (argument.startsWith('--workspace=')) options.workspace = path.resolve(argument.slice('--workspace='.length));
    else if (argument.startsWith('--package=')) options.packageName = argument.slice('--package='.length);
    else if (argument.startsWith('--report=')) options.reportPath = path.resolve(argument.slice('--report='.length));
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--dry-run') options.apply = false;
    else return null;
  }
  return options;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function sidecarPath(reportPath) {
  return reportPath.endsWith('.md')
    ? `${reportPath.slice(0, -3)}.json`
    : `${reportPath}.json`;
}

// [::TICKET::] PX-415, PX-416 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-415|PX-416) --for-spec --no-implementation-order`.
function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options === null) {
    process.stderr.write('Usage: restore-condensed-history.js --tickets=<Tickets.json>|--workspace=<root> [--package=<name>] [--dry-run|--apply] [--report=<path>]\n');
    return 2;
  }
  let targets = options.ticketsPath === null
    ? (options.workspace === null ? [] : discoverTicketFiles(options.workspace))
    : [options.ticketsPath];
  if (options.packageName) {
    targets = targets.filter((ticketsPath) => ticketsPath.includes(options.packageName));
  }
  if (targets.length === 0) {
    process.stderr.write('restore-condensed-history: no Tickets.json found\n');
    return 2;
  }

  const results = targets.map((ticketsPath) => ({
    ticketsPath,
    ...restoreCondensedHistory({ ticketsPath, apply: options.apply }),
  }));
  const report = renderRestorationReport(results, options.workspace);
  process.stdout.write(report);
  if (options.reportPath) {
    fs.writeFileSync(options.reportPath, report, 'utf8');
    writeJson(sidecarPath(options.reportPath), {
      workspace: options.workspace,
      apply: options.apply,
      packages: results.map((result) => ({
        status: result.status,
        reason: result.reason ?? null,
        findings: result.findings ?? [],
        ...result.report?.packages?.[0],
      })),
    });
  }
  return results.some((result) => !['applied', 'ready', 'no-change', 'skipped'].includes(result.status)) ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  ARCHIVE_PREFIX,
  PRE_RESTORE_PREFIX,
  RESTORABLE_FIELDS,
  PROVENANCE_FIELDS,
  readArchiveIndex,
  resolveArchivedTicket,
  planPackageRestoration,
  restoreCondensedHistory,
  selectInspectionTickets,
  verifyRestoration,
  renderRestorationReport,
  main,
};
