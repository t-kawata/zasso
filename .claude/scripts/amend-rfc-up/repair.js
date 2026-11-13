'use strict';

/**
 * /amend-rfc-up repair loop.
 *
 * Verification findings are loop input, never a terminal state. This module
 * names the artifact writer that owns each repair and measures whether one
 * repair round resolved the finding, stalled, or introduced a new defect.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const REPAIR_SCHEMA = 'amend-rfc-up.repair/v1';

const REPAIR_CLASS = Object.freeze({
  RFC: 'rfc',
  GRAPH: 'graph',
  DIRS_TREE: 'dirs-tree',
  TICKETS: 'tickets',
  LAW: 'law',
  EVIDENCE: 'evidence',
});

const OWNER_BY_CLASS = Object.freeze({
  rfc: 'design-amendment',
  graph: 'graphify',
  'dirs-tree': 'boundify',
  tickets: 'split',
  law: 'law',
  evidence: 'evidence',
});

const ESCALATION_BY_CLASS = Object.freeze({
  rfc: ['design-amendment'],
  graph: ['graphify', 'design-amendment'],
  'dirs-tree': ['boundify', 'graphify', 'design-amendment'],
  tickets: ['split', 'boundify', 'graphify', 'design-amendment'],
  law: ['law', 'design-amendment'],
  evidence: ['evidence'],
});

const ACTION_BY_CLASS = Object.freeze({
  rfc: 'append a design amendment that states the missing or contradictory design',
  graph: 're-derive the graph from the amended RFC and attach the owner receipt',
  'dirs-tree': 're-map every graph node and source file and attach the owner receipt',
  tickets: 're-derive the ticket set and attach the owner receipt',
  law: 'repair the named rule site, then run gate and attest',
  evidence: 'restore the named producer and rerun verification',
});

const VERIFY_BY_CLASS = Object.freeze({
  rfc: 'node .claude/scripts/tickets/verify-amendment.js --report',
  graph: 'node .claude/scripts/rfc-graph/verify.js',
  'dirs-tree': 'node .claude/scripts/drill-rfc-down/verify-step.js',
  tickets: 'node .claude/scripts/tickets/verify-amendment.js --report',
  law: 'the verified *-law skill gate and attest',
  evidence: 'the finding action',
});

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** The stable identity of one finding across two verification runs. */
function findingKey(finding = {}) {
  const identity = [
    finding.code || 'FINDING',
    finding.artifact || '',
    finding.formulaId || '',
    finding.field || '',
    finding.cause || finding.problem || '',
  ].join('\u0000');
  return createHash('sha256').update(identity).digest('hex');
}

/** Pick the artifact writer that owns the finding. */
function classifyFinding(finding = {}) {
  const code = String(finding.code || '');
  const artifact = String(finding.artifact || '');
  const cause = String(finding.cause || finding.problem || '');
  const basename = path.basename(artifact);
  let repairClass = REPAIR_CLASS.RFC;

  if (finding.layer === 'law' || /^LAW_/.test(code)) {
    repairClass = REPAIR_CLASS.LAW;
  } else if (basename === 'Tickets.json' || /^(?:TICKET|SPLIT)_/.test(code) || /\bticket\b/i.test(cause)) {
    repairClass = REPAIR_CLASS.TICKETS;
  } else if (basename === 'RFC-Dirs-Tree.json' || /^DIRS_/.test(code) || /Dirs-Tree/i.test(cause)) {
    repairClass = REPAIR_CLASS.DIRS_TREE;
  } else if (basename === 'RFC-GRAPH.json' || /^GRAPH_/.test(code) || /graph (?:node|edge)|not covered by any graph node/i.test(cause)) {
    repairClass = REPAIR_CLASS.GRAPH;
  } else if (basename.endsWith('.spec.md') || /^SPEC_/.test(code)) {
    repairClass = REPAIR_CLASS.RFC;
  } else if (basename === 'RFC.md' || /^(?:RFC|CLAIM|DESIGN|AMENDMENT)_/.test(code)) {
    repairClass = REPAIR_CLASS.RFC;
  } else if (/^(?:UNVERIFIABLE|UNAVAILABLE|SURFACE_ABSENT)/.test(code)) {
    repairClass = REPAIR_CLASS.EVIDENCE;
  }

  return {
    repairClass,
    owner: OWNER_BY_CLASS[repairClass],
    escalation: [...ESCALATION_BY_CLASS[repairClass]],
    action: typeof finding.action === 'string' && finding.action.trim() !== ''
      ? finding.action
      : ACTION_BY_CLASS[repairClass],
    verify: typeof finding.verify === 'string' && finding.verify.trim() !== ''
      ? finding.verify
      : VERIFY_BY_CLASS[repairClass],
  };
}

/** Every finding a verification output carries. */
function collectFindings(report = {}) {
  const findings = [];
  const reportBody = report.report || report;
  for (const part of [reportBody.p1, reportBody.p2]) {
    if (part && Array.isArray(part.findings)) findings.push(...part.findings);
  }
  if (findings.length === 0 && Array.isArray(report.findings)) findings.push(...report.findings);
  if (Array.isArray(report.unverifiable)) {
    for (const entry of report.unverifiable) {
      findings.push({
        severity: 'blocking',
        code: 'UNVERIFIABLE',
        artifact: entry.name || entry.artifact || '',
        cause: entry.reason || entry.problem || 'verification could not measure this surface',
      });
    }
  }
  if (findings.length === 0 && typeof report.code === 'string' && report.code.length > 0) {
    findings.push({
      severity: 'blocking',
      code: report.code,
      artifact: report.artifact || '',
      cause: report.message || 'verification failed without a report',
    });
  }
  return findings;
}

/** Deterministic repair worklist. */
function buildWorklist({ packageDir = null, report = {}, source = null } = {}) {
  const byKey = new Map();
  for (const finding of collectFindings(report)) {
    const key = findingKey(finding);
    if (byKey.has(key)) continue;
    const route = classifyFinding(finding);
    byKey.set(key, {
      key,
      severity: finding.severity === 'advisory' ? 'advisory' : 'blocking',
      code: finding.code || 'FINDING',
      artifact: finding.artifact || '',
      cause: finding.cause || finding.problem || '',
      route: finding.route || route.repairClass,
      repairClass: route.repairClass,
      owner: route.owner,
      escalation: route.escalation,
      action: route.action,
      verify: route.verify,
    });
  }
  const findings = [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  const digest = createHash('sha256')
    .update(findings.map((entry) => entry.key).join('\n'))
    .digest('hex');
  return {
    schema: REPAIR_SCHEMA,
    package: packageDir ? path.resolve(packageDir) : null,
    source,
    findings,
    counts: {
      total: findings.length,
      blocking: findings.filter((entry) => entry.severity === 'blocking').length,
      advisory: findings.filter((entry) => entry.severity === 'advisory').length,
    },
    digest,
  };
}

function keysOf(worklist = {}) {
  return (Array.isArray(worklist.findings) ? worklist.findings : [])
    .map((entry) => entry.key || findingKey(entry));
}

/** Decide whether one repair round advanced, stalled, or regressed. */
function compareWorklists({ previous = {}, current = {} } = {}) {
  const previousKeys = new Set(keysOf(previous));
  const currentKeys = new Set(keysOf(current));
  const resolved = [...previousKeys].filter((key) => !currentKeys.has(key)).sort();
  const introduced = [...currentKeys].filter((key) => !previousKeys.has(key)).sort();
  const persisted = [...currentKeys].filter((key) => previousKeys.has(key)).sort();

  let status = 'progressing';
  if (introduced.length > 0) status = 'regressed';
  else if (currentKeys.size === 0) status = 'clean';
  else if (resolved.length === 0) status = 'stalled';

  const next = {
    clean: 'converge',
    progressing: 'rerun',
    stalled: 'escalate',
    regressed: 'rollback-and-reroute',
  }[status];

  return {
    schema: REPAIR_SCHEMA,
    status,
    resolved,
    persisted,
    introduced,
    digest: createHash('sha256').update([...currentKeys].sort().join('\n')).digest('hex'),
    next,
  };
}

function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : null;
}

function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

function writeJsonOutput(value, outPath) {
  if (!outPath) return;
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (command === 'plan') {
      const report = readJsonInput(argumentValue(argv, 'report'));
      if (!report) throw fail('REPAIR_INPUT_MISSING', '--report is required');
      const worklist = buildWorklist({
        packageDir: argumentValue(argv, 'package'),
        report,
        source: argumentValue(argv, 'source'),
      });
      writeJsonOutput(worklist, argumentValue(argv, 'out'));
      process.stdout.write(`${JSON.stringify({ ok: true, counts: worklist.counts, digest: worklist.digest })}\n`);
      return 0;
    }
    if (command === 'progress') {
      const previous = readJsonInput(argumentValue(argv, 'previous'));
      const current = readJsonInput(argumentValue(argv, 'current'));
      if (!previous || !current) throw fail('REPAIR_INPUT_MISSING', '--previous and --current are required');
      const progress = compareWorklists({ previous, current });
      writeJsonOutput(progress, argumentValue(argv, 'out'));
      process.stdout.write(`${JSON.stringify(progress)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'REPAIR_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  REPAIR_SCHEMA,
  buildWorklist,
  classifyFinding,
  compareWorklists,
  findingKey,
};
