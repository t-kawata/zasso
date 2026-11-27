'use strict';

/**
 * cli.js — the only process boundary for the candidate ledger.
 *
 * Every failure carries a concrete repair action so a run can fix itself and
 * continue. Human output is Markdown; `--json` emits exactly one JSON line.
 */

const fs = require('node:fs');
const path = require('node:path');

const criteria = require('./criteria.js');
const schema = require('./schema.js');
const store = require('./store.js');
const scan = require('./scan.js');
const render = require('./render.js');
const { createFinding, renderFinding } = require('../lib/repair-finding.js');

const UPDATABLE_FIELDS = criteria.UPDATABLE_FIELDS;
const STDIN_SENTINEL = '-';

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function defaultClaudeDir(workspace) {
  return path.join(path.resolve(workspace), '.claude');
}

// [::TICKET::] PX-457, PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-457|PX-458) --for-spec --no-implementation-order`.
function readJsonInput(source) {
  const raw = source === STDIN_SENTINEL
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path.resolve(source), 'utf8');
  return JSON.parse(raw);
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function toDateStamp() {
  return new Date().toISOString();
}

/** Load the ledger or a fresh one; a parse failure is a named error, never a silent reset. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function loadOrStartLedger(workspace, claudeDir, upstreamRef) {
  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) {
    const error = new Error(loaded.cause);
    error.code = loaded.code;
    throw error;
  }
  return loaded.ledger || store.emptyLedger({ workspace, claudeDir, upstreamRef });
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function resolveUpstreamRef(workspace, fallback) {
  const upstream = scan.resolveUpstream(workspace);
  if (upstream.ok) return upstream.ref;
  return fallback || 'unknown';
}

/** Render both sidecars from the ledger. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function persistLedger(workspace, ledger) {
  const savedJson = store.saveLedger(workspace, ledger);
  if (!savedJson.ok) return savedJson;
  return store.saveMarkdown(workspace, render.renderMarkdown(ledger));
}

/**
 * Create one candidate.
 *
 * @param {{workspace?:string, candidate:object|string, claudeDir?:string, upstreamRef?:string}} options
 * @returns {object}
 */
// [::TICKET::] PX-457, PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-457|PX-458) --for-spec --no-implementation-order`.
function createCandidate(options) {
  const workspace = path.resolve(options.workspace || process.cwd());
  let candidate;
  try {
    candidate = typeof options.candidate === 'string' ? readJsonInput(options.candidate) : options.candidate;
  } catch (error) {
    return {
      ok: false,
      code: 'ERROR:candidate-unreadable',
      cause: 'The candidate JSON could not be read: ' + error.message,
      action: 'Write a valid JSON file and rerun create with --candidate=<file>.',
      verify: 'node .claude/scripts/pickup-conver-update-candidates/cli.js create --candidate=<file>',
    };
  }

  const claudeDir = path.resolve(options.claudeDir || defaultClaudeDir(workspace));
  const recordInput = JSON.parse(JSON.stringify(candidate));
  delete recordInput.id;

  const validation = schema.validateCandidate(recordInput, { workspace, claudeDir });
  if (!validation.ok) {
    return { ok: false, code: 'ERROR:candidate-invalid', findings: validation.findings };
  }

  const fingerprint = schema.computeContentFingerprint(recordInput.location.file, recordInput.evidence.patch);
  const upstreamRef = options.upstreamRef || resolveUpstreamRef(workspace, recordInput.evidence.upstreamRef);

  let ledger;
  try {
    ledger = loadOrStartLedger(workspace, claudeDir, upstreamRef);
  } catch (error) {
    return { ok: false, code: error.code || 'ERROR:ledger-unparseable', cause: error.message };
  }

  const duplicate = ledger.candidates.find(
    (existing) => existing.evidence && existing.evidence.contentFingerprint === fingerprint
  );
  if (duplicate) {
    return { ok: true, status: 'skipped:duplicate', id: duplicate.id };
  }

  const record = {
    id: store.allocateId(ledger),
    location: recordInput.location,
    changeType: recordInput.changeType,
    primaryCriterion: recordInput.primaryCriterion,
    secondaryCriteria: recordInput.secondaryCriteria || [],
    generalization: recordInput.generalization,
    adaptationPlan: recordInput.generalization === 'adapt' ? recordInput.adaptationPlan : null,
    symptom: recordInput.symptom,
    remedy: recordInput.remedy,
    scope: recordInput.scope,
    risk: recordInput.risk,
    verification: recordInput.verification,
    impact: recordInput.impact,
    confidence: recordInput.confidence,
    riskLevel: recordInput.riskLevel,
    evidence: {
      ...recordInput.evidence,
      upstreamRef,
      contentFingerprint: fingerprint,
      observedAt: recordInput.evidence.observedAt || toDateStamp(),
    },
    status: 'candidate',
    note: typeof recordInput.note === 'string' ? recordInput.note : '',
  };

  ledger.candidates.push(record);
  ledger.generatedAt = toDateStamp();
  const persisted = persistLedger(workspace, ledger);
  if (!persisted.ok) return persisted;
  return { ok: true, status: 'created', id: record.id, candidate: record };
}

/** Filter and sort the ledger for display. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function listCandidates({ workspace = process.cwd(), criterion, status, impact } = {}) {
  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) {
    const error = new Error(loaded.cause);
    error.code = loaded.code;
    throw error;
  }
  if (!loaded.exists) return [];

  return loaded.ledger.candidates
    .filter((candidate) => (criterion ? candidate.primaryCriterion === criterion : true))
    .filter((candidate) => (status ? candidate.status === status : true))
    .filter((candidate) => (impact ? candidate.impact === impact : true))
    .sort(render.compareCandidates);
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function showCandidate({ workspace = process.cwd(), id }) {
  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) return { ok: false, code: loaded.code, cause: loaded.cause };
  if (!loaded.exists) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No ledger exists in ' + workspace };
  const candidate = loaded.ledger.candidates.find((entry) => entry.id === id);
  if (!candidate) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No candidate has id ' + id };
  return { ok: true, candidate };
}

/** Apply a whitelisted patch and revalidate the whole record before writing. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function updateCandidate({ workspace = process.cwd(), id, patch }) {
  const keys = Object.keys(patch || {});
  const rejected = keys.filter((key) => !UPDATABLE_FIELDS.includes(key));
  if (rejected.length > 0) {
    return {
      ok: false,
      code: 'ERROR:field-not-updatable',
      cause: 'These fields cannot be updated: ' + rejected.join(', '),
      action: 'Remove the field from the patch and rerun update with --patch=<file>.',
      verify: 'node .claude/scripts/pickup-conver-update-candidates/cli.js show --id=' + id,
    };
  }

  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) return { ok: false, code: loaded.code, cause: loaded.cause };
  if (!loaded.exists) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No ledger exists in ' + workspace };

  const index = loaded.ledger.candidates.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No candidate has id ' + id };

  const merged = { ...loaded.ledger.candidates[index], ...patch };
  const validation = schema.validateCandidate(merged, {
    workspace,
    claudeDir: loaded.ledger.claudeDir,
  });
  if (!validation.ok) return { ok: false, code: 'ERROR:candidate-invalid', findings: validation.findings };

  loaded.ledger.candidates[index] = merged;
  loaded.ledger.generatedAt = toDateStamp();
  const persisted = persistLedger(workspace, loaded.ledger);
  if (!persisted.ok) return persisted;
  return { ok: true, candidate: merged };
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function deleteCandidate({ workspace = process.cwd(), id }) {
  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) return { ok: false, code: loaded.code, cause: loaded.cause };
  if (!loaded.exists) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No ledger exists in ' + workspace };

  const index = loaded.ledger.candidates.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, code: 'ERROR:candidate-not-found', cause: 'No candidate has id ' + id };

  loaded.ledger.candidates.splice(index, 1);
  loaded.ledger.generatedAt = toDateStamp();
  const persisted = persistLedger(workspace, loaded.ledger);
  if (!persisted.ok) return persisted;
  return { ok: true, id };
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function renderLedger({ workspace = process.cwd() }) {
  const loaded = store.loadLedger(workspace);
  if (!loaded.ok) return { ok: false, code: loaded.code, cause: loaded.cause };
  if (!loaded.exists) return { ok: true, status: 'skipped:no-ledger' };
  const saved = store.saveMarkdown(workspace, render.renderMarkdown(loaded.ledger));
  if (!saved.ok) return saved;
  return { ok: true, path: store.markdownPath(workspace) };
}

/** Parse `--key=value`, `--key value`, and `--flag`. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const options = { positional: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      options.positional.push(argument);
      continue;
    }
    const separator = argument.indexOf('=');
    if (separator !== -1) {
      options[argument.slice(2, separator)] = argument.slice(separator + 1);
      continue;
    }
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      const error = new Error('Option --' + key + ' requires a value');
      error.code = 'ERROR:missing-option-value';
      throw error;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

// [::TICKET::] PX-457, PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-457|PX-458) --for-spec --no-implementation-order`.
function dispatch(command, options, workspace, claudeDir) {
  switch (command) {
    case 'scan':
      return { command, ...scan.scanClaudeDir({ workspace, claudeDir }) };
    case 'create':
      return { command, ...createCandidate({ workspace, candidate: options.candidate, claudeDir, upstreamRef: options['upstream-ref'] }) };
    case 'list':
      return { command, candidates: listCandidates({ workspace, criterion: options.criterion, status: options.status, impact: options.impact }) };
    case 'show':
      return { command, ...showCandidate({ workspace, id: options.id }) };
    case 'update':
      return { command, ...updateCandidate({ workspace, id: options.id, patch: options.patch ? readJsonInput(options.patch) : {} }) };
    case 'schema':
      return { command, ok: true, ...schema.describeSchema() };
    case 'delete':
      return { command, ...deleteCandidate({ workspace, id: options.id }) };
    case 'render':
      return { command, ...renderLedger({ workspace }) };
    default:
      return {
        ok: false,
        code: 'ERROR:unknown-subcommand',
        cause: 'Unknown subcommand: ' + String(command),
        action: 'Use scan, schema, create, list, show, update, delete, or render with --workspace <dir>.',
        verify: 'node .claude/scripts/pickup-conver-update-candidates/cli.js schema',
      };
  }
}

/** Convert one raw failure into a repair finding; never print a stack trace for expected failures. */
// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function printFinding(raw, workspace) {
  try {
    const finding = createFinding({
      severity: 'blocking',
      code: raw.code || 'ERROR:unexpected',
      layer: 'pickup-conver-update-candidates',
      artifact: raw.artifact || 'CONVER-UPDATE-CANDIDATES.json',
      ...(raw.field ? { field: raw.field } : {}),
      cause: raw.cause || 'The command failed without a cause',
      action: raw.action || 'Rerun the command with --workspace <dir> after inspecting the input.',
      verify: raw.verify || 'node .claude/scripts/pickup-conver-update-candidates/cli.js list --workspace ' + workspace,
      route: 'in-drill',
    });
    process.stderr.write(renderFinding(finding) + '\n\n');
  } catch (error) {
    process.stderr.write('[ERROR] ' + (raw.code || 'ERROR:unexpected') + '\nCause: ' + (raw.cause || error.message) + '\nAction: Rerun the command with --workspace <dir>.\n\n');
  }
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function emitFailure(result, workspace) {
  const findings = Array.isArray(result.findings) && result.findings.length > 0 ? result.findings : [result];
  for (const finding of findings) printFinding(finding, workspace);
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function renderCandidateDetail(candidate) {
  return [
    `### ${candidate.id} — ${candidate.primaryCriterion} — ${candidate.location.file}:${candidate.location.lineStart}`,
    `- Status: ${candidate.status}`,
    `- Impact: ${candidate.impact} / Confidence: ${candidate.confidence} / Risk: ${candidate.riskLevel}`,
    `- Symptom: ${candidate.symptom}`,
    `- Remedy: ${candidate.remedy}`,
    `- Generality: ${candidate.scope}`,
    `- Risk: ${candidate.risk}`,
    `- Verification: ${candidate.verification}`,
  ].join('\n');
}

// [::TICKET::] PX-457, PX-458 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-457|PX-458) --for-spec --no-implementation-order`.
function emitHuman(result) {
  switch (result.command) {
    case 'scan':
      if (result.status === 'skipped:no-changes') {
        process.stdout.write('skipped:no-changes\n');
        return;
      }
      process.stdout.write('# changed files\n\n');
      for (const file of result.files) {
        const fence = render.fenceFor(file.diff);
        process.stdout.write(
          `## ${file.file} (${file.changeType}) ${file.hunkHeader}\n\n${fence}diff\n${file.diff}${fence}\n\n`
        );
      }
      return;
    case 'schema':
      process.stdout.write(render.renderSchemaMarkdown(result) + '\n');
      return;
    case 'create':
      process.stdout.write(result.status === 'created'
        ? `Created ${result.id}\n`
        : `Duplicate ${result.id} (skipped:duplicate)\n`);
      return;
    case 'list':
      process.stdout.write('| id | criterion | status | impact | file |\n|---|---|---|---|---|\n');
      for (const candidate of result.candidates) {
        process.stdout.write(`| ${candidate.id} | ${candidate.primaryCriterion} | ${candidate.status} | ${candidate.impact} | ${candidate.location.file} |\n`);
      }
      return;
    case 'show':
      process.stdout.write(renderCandidateDetail(result.candidate) + '\n');
      return;
    case 'update':
      process.stdout.write(`Updated ${result.candidate.id}\n`);
      return;
    case 'delete':
      process.stdout.write(`Deleted ${result.id}\n`);
      return;
    case 'render':
      process.stdout.write((result.status === 'skipped:no-ledger' ? 'skipped:no-ledger' : result.path) + '\n');
      return;
    default:
      process.stdout.write(JSON.stringify(result) + '\n');
  }
}

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    printFinding({ code: error.code || 'ERROR:invalid-arguments', cause: error.message }, process.cwd());
    process.exitCode = 1;
    return;
  }

  const command = options.positional[0];
  const workspace = path.resolve(options.workspace || process.cwd());
  const claudeDir = path.resolve(options['claude-dir'] || defaultClaudeDir(workspace));

  let result;
  try {
    result = dispatch(command, options, workspace, claudeDir);
  } catch (error) {
    result = {
      ok: false,
      code: error.code || 'ERROR:unexpected',
      cause: error.message,
      action: 'Inspect the workspace and rerun the command with --workspace <dir>.',
      verify: 'node .claude/scripts/pickup-conver-update-candidates/cli.js list --workspace ' + workspace,
    };
  }

  if (result.ok === false) {
    emitFailure(result, workspace);
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  emitHuman(result);
}

module.exports = {
  createCandidate,
  listCandidates,
  showCandidate,
  updateCandidate,
  deleteCandidate,
  renderLedger,
  parseArguments,
  main,
  UPDATABLE_FIELDS,
};

if (require.main === module) {
  main(process.argv.slice(2));
}
