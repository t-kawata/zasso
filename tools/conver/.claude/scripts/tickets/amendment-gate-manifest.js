'use strict';

/**
 * The fixed gate set the amendment transaction must satisfy.
 *
 * The list is enumerated and versioned on purpose: a gate discovered dynamically
 * could silently drop a check. A gate whose required artifacts are absent is
 * unverifiable, never a finding, because absence is input, not failure.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { validateTickets } = require('../lib/validate-tickets.js');
const {
  ARTIFACT_KINDS,
  resolveArtifactStates,
  resolveWorkspaceRoot,
} = require('./lib/design-amendment-state.js');

const SCRIPTS = path.resolve(__dirname, '..');
const GATE_MANIFEST_VERSION = 2;
const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
const ALLOCATE_MANIFEST_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

const GATE_ENTRIES = Object.freeze([
  { name: 'chain', requires: ['graph', 'dirs-tree', 'tickets'] },
  { name: 'graph-integrity', requires: ['rfc', 'graph'] },
  { name: 'dirs-tree-schema', requires: ['graph', 'dirs-tree'] },
  { name: 'tickets-schema', requires: ['tickets'] },
  { name: 'ticket-closure', requires: ['tickets'] },
  { name: 'ticket-prerequisites', requires: ['tickets'] },
  { name: 'formula-file-coverage', requires: ['rfc', 'graph', 'dirs-tree'] },
  { name: 'formula-digest', requires: ['rfc'] },
  { name: 'tree-entry-parity', requires: ['spec'] },
  { name: 'allocate-chain', requires: ['spec'] },
  { name: 'reverify', requires: ['tickets'] },
  { name: 'amendment-integrity', requires: [] },
]);

/** The sha256 of a value, used as the per-gate digest. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function digestValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Normalise any verifier finding into the PX-397 schema. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function toFinding(entry, fallbackAsset) {
  if (entry && typeof entry.code === 'string' && typeof entry.problem === 'string' && Array.isArray(entry.fixes)) {
    return entry;
  }
  return {
    code: entry?.code ?? 'GATE_FAILED',
    asset: entry?.asset ?? entry?.subject ?? fallbackAsset,
    problem: entry?.problem ?? entry?.message ?? String(entry),
    fixes: Array.isArray(entry?.fixes) ? entry.fixes : [],
    rerun: entry?.rerun ?? 'rerun the amendment gate manifest',
  };
}

/** Run one verifier and read its JSON output; a nonzero exit is still readable. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function runVerifier(script, args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [script].concat(args), {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

/** Read JSON from a verifier, or an empty object when the output is not JSON. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function parseJsonOutput(stdout) {
  const trimmed = (stdout || '').trim();
  if (trimmed.length === 0) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

/** The formula sidecar beside the graph, or null. */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function sidecarFor(cwd) {
  const candidate = path.join(cwd, 'RFC-FORMULAS.json');
  return fs.existsSync(candidate) ? candidate : null;
}

/** Resolve the five artifact states for a gate runner. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function artifactStates({ cwd }) {
  return resolveArtifactStates({ cwd });
}

/** Run the ESM hash bridge and read its findings. */
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
function runHashBridge(args, cwd) {
  const bridge = path.join(SCRIPTS, 'tickets/lib/design-hash-report.mjs');
  const result = runVerifier(bridge, args, cwd);
  const parsed = parseJsonOutput(result.stdout);
  return parsed.findings ?? [];
}

/** The default runner of each gate. */
const DEFAULT_RUNNERS = Object.freeze({
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
  chain({ cwd }) {
    if (!fs.existsSync(path.join(cwd, 'SEQUENCES.json'))) {
      return { findings: [], unverifiable: [{ name: 'chain', reason: 'no-view' }] };
    }
    const result = runVerifier(path.join(SCRIPTS, 'sequences-slice/verify-chain.mjs'), ['--stage=split', '--package=' + cwd], cwd);
    const parsed = parseJsonOutput(result.stdout);
    if (result.status === 0 && parsed.ok !== false) return { findings: [], unverifiable: [] };
    return { findings: (parsed.findings ?? []).map((entry) => toFinding(entry, 'chain')), unverifiable: [] };
  },
  'graph-integrity'({ cwd }) {
    const result = runVerifier(path.join(SCRIPTS, 'rfc-graph/verify-graph-integrity.js'), ['--graph-after=' + path.join(cwd, 'RFC-GRAPH.json'), '--source=' + path.join(cwd, 'RFC.md')], cwd);
    const parsed = parseJsonOutput(result.stdout);
    const errors = parsed.errors ?? [];
    return { findings: errors.map((message) => toFinding({ code: parsed.code ?? 'GRAPH_INTEGRITY_FAILED', asset: 'graph', problem: String(message) }, 'graph')), unverifiable: [] };
  },
  'dirs-tree-schema'({ cwd }) {
    const result = runVerifier(path.join(SCRIPTS, 'rfc-graph/validate-dirs-tree-schema.js'), ['--dirs-tree=' + path.join(cwd, 'RFC-Dirs-Tree.json'), '--graph=' + path.join(cwd, 'RFC-GRAPH.json')], cwd);
    const parsed = parseJsonOutput(result.stdout);
    const errors = parsed.errors ?? [];
    return { findings: errors.map((message) => toFinding({ code: 'DIRS_TREE_SCHEMA_FAILED', asset: 'dirs-tree', problem: String(message) }, 'dirs-tree')), unverifiable: [] };
  },
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
  'tickets-schema'({ cwd }) {
    try {
      const document = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
      const validation = validateTickets(document);
      return {
        findings: (validation.errors ?? []).map((error) => toFinding({
          code: 'TICKETS_SCHEMA_INVALID',
          asset: 'tickets',
          problem: typeof error === 'string' ? error : JSON.stringify(error),
        }, 'tickets')),
        unverifiable: [],
      };
    } catch (error) {
      return {
        findings: [toFinding({ code: 'TICKETS_SCHEMA_INVALID', asset: 'tickets', problem: error.message }, 'tickets')],
        unverifiable: [],
      };
    }
  },
  'ticket-closure'({ cwd }) {
    const result = runVerifier(path.join(SCRIPTS, 'tickets/verify-ticket-closure.js'), ['--tickets=' + path.join(cwd, 'Tickets.json')], cwd);
    if (result.status === 0) return { findings: [], unverifiable: [] };
    return { findings: [{ code: 'TICKET_CLOSURE_FAILED', asset: 'tickets', problem: (result.stderr || 'ticket closure failed').trim(), fixes: [], rerun: 'verify-ticket-closure.js' }], unverifiable: [] };
  },
  'ticket-prerequisites'({ cwd, ticketKey }) {
    // The exported function is the read-only path. The CLI entry point records a
    // BLOCKED_PREREQUISITE history entry on failure, which a verifier must not do.
    const { run } = require('./check-ticket-prerequisites.js');
    const result = run(['--ticket-key=' + ticketKey, '--tickets=' + path.join(cwd, 'Tickets.json')]);
    return {
      findings: (result.findings ?? []).map((entry) => toFinding({
        code: entry.code ?? 'PREREQUISITE_FAILED',
        asset: entry.subject ?? 'tickets',
        problem: entry.message ?? String(entry),
        fixes: [],
        rerun: 'check-ticket-prerequisites.js --ticket-key=' + ticketKey,
      }, 'tickets')),
      unverifiable: [],
    };
  },
  'formula-file-coverage'({ cwd }) {
    const sidecar = sidecarFor(cwd);
    if (!sidecar) return { findings: [], unverifiable: [{ name: 'formula-file-coverage', reason: 'no-sidecar' }] };
    const result = runVerifier(path.join(SCRIPTS, 'rfc-graph/verify-formula-file-coverage.js'), ['--graph=' + path.join(cwd, 'RFC-GRAPH.json'), '--dirs-tree=' + path.join(cwd, 'RFC-Dirs-Tree.json'), '--sidecar=' + sidecar], cwd);
    if (result.status === 0) return { findings: [], unverifiable: [] };
    return { findings: [{ code: 'FORMULA_FILE_COVERAGE_FAILED', asset: 'formula', problem: (result.stderr || 'formula coverage failed').trim(), fixes: [], rerun: 'verify-formula-file-coverage.js' }], unverifiable: [] };
  },
// [::TICKET::] PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-405 --for-spec --no-implementation-order`.
  'formula-digest'({ cwd }) {
    const states = artifactStates({ cwd });
    const rfc = states.find((state) => state.kind === ARTIFACT_KINDS.RFC && state.state === 'present');
    if (!rfc) return { findings: [], unverifiable: [] };
    return {
      findings: runHashBridge(['--mode=formula', '--package=' + cwd, '--rfc=' + rfc.path], cwd),
      unverifiable: [],
    };
  },
  'tree-entry-parity'({ cwd }) {
    const workspaceRoot = resolveWorkspaceRoot(cwd);
    if (!workspaceRoot) return { findings: [], unverifiable: [] };
    const manifestPath = path.join(workspaceRoot, TREE_MANIFEST_NAME);
    if (!fs.existsSync(manifestPath)) return { findings: [], unverifiable: [] };
    const states = artifactStates({ cwd });
    const spec = states.find((state) => state.kind === ARTIFACT_KINDS.SPEC && state.state === 'present');
    if (!spec) return { findings: [], unverifiable: [] };
    return {
      findings: runHashBridge(['--mode=tree', '--manifest=' + manifestPath, '--spec=' + spec.path], cwd),
      unverifiable: [],
    };
  },
  'allocate-chain'({ cwd }) {
    const workspaceRoot = resolveWorkspaceRoot(cwd);
    if (!workspaceRoot) return { findings: [], unverifiable: [] };
    if (!fs.existsSync(path.join(workspaceRoot, ALLOCATE_MANIFEST_NAME))) return { findings: [], unverifiable: [] };
    return {
      findings: runHashBridge(['--mode=allocate', '--workspace-root=' + workspaceRoot], cwd),
      unverifiable: [],
    };
  },
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
  reverify({ cwd, ticketKey }) {
    const result = runVerifier(path.join(SCRIPTS, 'tickets/reverify-ticket.js'), ['--ticket-key=' + ticketKey, '--tickets=' + path.join(cwd, 'Tickets.json')], cwd);
    const parsed = parseJsonOutput(result.stdout);
    return { findings: (parsed.findings ?? []).map((entry) => toFinding(entry, ticketKey)), unverifiable: [] };
  },
  'amendment-integrity'({ cwd }) {
    const ledgerDirectory = path.join(cwd, 'amendments');
    if (!fs.existsSync(ledgerDirectory)) return { findings: [], unverifiable: [] };
    const findings = [];
    for (const name of fs.readdirSync(ledgerDirectory).filter((entry) => entry.endsWith('.json')).sort()) {
      try {
        const ledger = JSON.parse(fs.readFileSync(path.join(ledgerDirectory, name), 'utf8'));
        if (!ledger.artifactPath || !fs.existsSync(ledger.artifactPath)) continue;
        const digest = createHash('sha256').update(fs.readFileSync(ledger.artifactPath)).digest('hex');
        if (digest !== ledger.afterDigest) {
          findings.push({ code: 'AMENDMENT_LEDGER_MISMATCH', asset: ledger.artifactPath, problem: 'recorded afterDigest does not match the file', fixes: [], rerun: 'design-amendment.js --dry-run' });
        }
      } catch (error) {
        findings.push({ code: 'AMENDMENT_LEDGER_UNREADABLE', asset: path.join(ledgerDirectory, name), problem: error.message, fixes: [], rerun: 'repair or remove the ledger entry' });
      }
    }
    return { findings, unverifiable: [] };
  },
});

/**
 * Run the fixed manifest.
 *
 * @param {{ cwd: string, ticketKey: string,
 *           ticketsPath?: string|null, presentKinds: string[],
 *           runners?: object }} input
 * @returns {{ gates: object[], findings: object[], unverifiable: object[] }}
 */
// [::TICKET::] PX-400, PX-405 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-400|PX-405) --for-spec --no-implementation-order`.
function runGateManifest({ cwd, ticketKey, ticketsPath = null, presentKinds = [], runners = {} }) {
  const gates = [];
  const findings = [];
  const unverifiable = [];

  for (const entry of GATE_ENTRIES) {
    const missing = entry.requires.filter((kind) => !presentKinds.includes(kind));
    if (missing.length > 0) {
      unverifiable.push({ name: entry.name, reason: 'missing:' + missing.join(',') });
      continue;
    }
    const runner = runners[entry.name] ?? DEFAULT_RUNNERS[entry.name];
    if (typeof runner !== 'function') {
      unverifiable.push({ name: entry.name, reason: 'runner-not-configured' });
      continue;
    }
    try {
      const result = runner({ cwd, ticketKey, ticketsPath }) ?? { findings: [] };
      const gateFindings = (result.findings ?? []).map((entryFinding) => toFinding(entryFinding, entry.name));
      findings.push(...gateFindings);
      unverifiable.push(...(result.unverifiable ?? []));
      gates.push({ name: entry.name, digest: digestValue(gateFindings), findings: gateFindings });
    } catch (error) {
      const finding = {
        code: 'GATE_DEFECT',
        asset: ticketKey + '/' + entry.name,
        problem: error.message,
        fixes: [],
        rerun: 'repair the gate input and rerun the amendment gate manifest',
      };
      findings.push(finding);
      gates.push({ name: entry.name, digest: digestValue([finding]), findings: [finding] });
    }
  }

  return { gates, findings, unverifiable };
}

module.exports = {
  GATE_MANIFEST_VERSION,
  GATE_ENTRIES,
  DEFAULT_RUNNERS,
  runGateManifest,
  toFinding,
};
