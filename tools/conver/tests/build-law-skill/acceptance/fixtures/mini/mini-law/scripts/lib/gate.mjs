import { execFileSync } from 'node:child_process';

const BUILTIN_SCANS = new Set([
  'scan/stubs',
  'scan/test-weakening',
  'scan/english',
  'scan/secrets',
]);

export function applyVerify(manifest, entries = []) {
  const byRule = new Map();
  for (const entry of entries) {
    if (!entry.rule) throw new Error('verify entry requires rule');
    if (!byRule.has(entry.rule)) byRule.set(entry.rule, []);
    byRule.get(entry.rule).push(entry);
  }

  let applied = 0;
  for (const node of manifest.nodes ?? []) {
    const extra = byRule.get(node.id);
    if (!extra) continue;
    node.verify = [...(node.verify ?? []), ...extra];
    applied++;
  }
  return { applied, ignored: entries.length - applied };
}

export function runGate({ manifest, scans = {}, cwd = process.cwd(), processScan, scanRunner }) {
  const context = { scans, cwd, processScan, scanRunner };
  const statuses = [];
  for (const node of manifest.nodes ?? []) {
    if (node.delivery !== 'must') continue;
    statuses.push({ rule: node.id, ...evaluateNode(node, context) });
  }

  const machinePass = statuses.length > 0
    && statuses.every((entry) => entry.status === 'machine_verified');
  const ok = statuses.every((entry) =>
    entry.status === 'machine_verified' || entry.status === 'human_attested');

  return { statuses, machinePass, ok };
}

export function gateStatus(report, rule) {
  return report.statuses.find((entry) => entry.rule === rule)?.status;
}

function evaluateNode(node, context) {
  if (node.implementation_status) return node.implementation_status;
  const verifyEntries = node.verify ?? [];
  if (verifyEntries.length === 0) {
    return { status: 'unverifiable', evidence: 'no verify entry', modes: ['none'] };
  }

  const results = verifyEntries.map((entry) => evaluateEntry(entry, { ...context, node }));
  const modes = results.map((result) => result.mode);
  if (results.some((result) => result.status === 'failed')) return { status: 'failed', evidence: results, modes };
  if (results.some((result) => result.status === 'not_run')) return { status: 'not_run', evidence: results, modes };
  if (results.some((result) => result.status === 'unverifiable')) return { status: 'unverifiable', evidence: results, modes };
  if (results.every((result) => result.status === 'machine_verified')) {
    return { status: 'machine_verified', evidence: results, modes };
  }
  if (results.every((result) => result.status === 'human_attested')) {
    return { status: 'human_attested', evidence: results, modes };
  }
  return { status: 'unverifiable', evidence: results, modes };
}

function evaluateEntry(entry, context) {
  const { node, scans, cwd, processScan, scanRunner } = context;
  if (entry.mode === 'process') {
    if (!processScan) return { status: 'unverifiable', evidence: 'process scan not run', mode: 'process' };
    if (!processScan.ok) return { status: 'failed', evidence: processScan, mode: 'process' };
    return { status: 'machine_verified', evidence: processScan, mode: 'process' };
  }

  if (entry.review) {
    if (!node.review?.approval_ref) {
      return { status: 'unverifiable', evidence: 'missing approval_ref', mode: 'review' };
    }
    return { status: 'human_attested', evidence: node.review, mode: 'review' };
  }

  if (entry.scan) {
    if (!scans[entry.scan] && !BUILTIN_SCANS.has(entry.scan)) {
      return { status: 'unverifiable', evidence: 'scan not registered: ' + entry.scan, mode: 'scan' };
    }
    if (!scanRunner) return { status: 'machine_verified', evidence: entry.scan, mode: 'scan' };
    const result = scanRunner(entry.scan, node);
    return result.ok
      ? { status: 'machine_verified', evidence: result, mode: 'scan' }
      : { status: 'failed', evidence: result, mode: 'scan' };
  }

  if (entry.cmd) {
    try {
      const output = execFileSync(entry.cmd[0], entry.cmd.slice(1), {
        cwd,
        encoding: 'utf8',
        timeout: entry.timeout_ms ?? 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = JSON.parse(output.trim() || '{}');
      const expected = entry.expected_cases ?? 1;
      if (!Number.isFinite(result.selected) || result.selected === 0 || result.selected < expected) {
        return { status: 'not_run', evidence: result, mode: 'cmd' };
      }
      if (Number(result.failed) > 0) return { status: 'failed', evidence: result, mode: 'cmd' };
      return { status: 'machine_verified', evidence: result, mode: 'cmd' };
    } catch (error) {
      return { status: 'failed', evidence: String(error.message ?? error), mode: 'cmd' };
    }
  }

  return { status: 'unverifiable', evidence: 'no runner', mode: 'none' };
}
