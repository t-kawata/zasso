import { execFileSync } from 'node:child_process';

const BUILTIN_SCANS = new Set([
  'scan/stubs',
  'scan/test-weakening',
  'scan/english',
  'scan/secrets',
]);

export function runGate({ manifest, scans = {}, cwd = process.cwd() }) {
  const statuses = [];
  for (const node of manifest.nodes ?? []) {
    if (node.delivery !== 'must') continue;
    statuses.push({ rule: node.id, ...evaluateNode(node, scans, cwd) });
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

function evaluateNode(node, scans, cwd) {
  const verifyEntries = node.verify ?? [];
  if (verifyEntries.length === 0) {
    return { status: 'unverifiable', evidence: 'no verify entry' };
  }

  const results = verifyEntries.map((entry) => evaluateEntry(entry, node, scans, cwd));
  if (results.some((result) => result.status === 'failed')) return { status: 'failed', evidence: results };
  if (results.some((result) => result.status === 'not_run')) return { status: 'not_run', evidence: results };
  if (results.some((result) => result.status === 'unverifiable')) return { status: 'unverifiable', evidence: results };
  if (results.every((result) => result.status === 'machine_verified')) {
    return { status: 'machine_verified', evidence: results };
  }
  if (results.every((result) => result.status === 'human_attested')) {
    return { status: 'human_attested', evidence: results };
  }
  return { status: 'unverifiable', evidence: results };
}

function evaluateEntry(entry, node, scans, cwd) {
  if (entry.review) {
    if (!node.review?.approval_ref) {
      return { status: 'unverifiable', evidence: 'missing approval_ref' };
    }
    return { status: 'human_attested', evidence: node.review };
  }

  if (entry.scan) {
    if (!scans[entry.scan] && !BUILTIN_SCANS.has(entry.scan)) {
      return { status: 'unverifiable', evidence: 'scan not registered: ' + entry.scan };
    }
    return { status: 'machine_verified', evidence: entry.scan };
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
        return { status: 'not_run', evidence: result };
      }
      if (Number(result.failed) > 0) return { status: 'failed', evidence: result };
      return { status: 'machine_verified', evidence: result };
    } catch (error) {
      return { status: 'failed', evidence: String(error.message ?? error) };
    }
  }

  return { status: 'unverifiable', evidence: 'no runner' };
}
