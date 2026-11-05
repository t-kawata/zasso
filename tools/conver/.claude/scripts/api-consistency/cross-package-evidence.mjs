#!/usr/bin/env node
/**
 * cross-package-evidence.mjs --workspace=<root> --package=<target-dir> --id=<package-id>
 *   --gates=<gate-results.json> --out=<evidence.json> [--repair=<finding-id> ...]
 *
 * Build the evidence a cross-package edit presents to guard-edit-surface.js.
 *
 * The evidence is measured rather than authored: the baseline is the finding set the
 * verifier produced, and every repair must name one of those findings. The guard
 * validates the record again and the completion command proves the delta, so a
 * hand-written authorization cannot pass as a measurement.
 */
import fs from 'node:fs';
import path from 'node:path';

import { digestOfFindings } from './finding-identity.mjs';
import { verifyApiConsistency } from './verify-api-consistency.mjs';
import {
  API_CONSISTENCY_GATE_NAME,
  API_CONSISTENCY_SCRIPT_NAME,
  KNOWN_GATE_NAMES,
} from '../grill-me-for-rfc/stage8-gates.js';

const EVIDENCE_FORMAT = 2;
const API_GATES = new Set([API_CONSISTENCY_GATE_NAME, API_CONSISTENCY_SCRIPT_NAME]);

/** The refusal codes this generator reports. */
export const EVIDENCE_CODES = Object.freeze({
  REPAIR_NOT_FOUND: 'REPAIR_NOT_FOUND',
  GATE_FAILED: 'GATE_FAILED',
  GATE_UNKNOWN: 'GATE_UNKNOWN',
  WORKSPACE_UNREADABLE: 'WORKSPACE_UNREADABLE',
  NO_PACKAGE_SURFACE: 'NO_PACKAGE_SURFACE',
});

/** Read one JSON file, or null when it cannot be read. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** One refusal in the shape the caller reports. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function refusal(code, detail) {
  return { ok: false, code, detail };
}

/** Validate one gate record. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function gateProblem(gate) {
  if (gate === null || typeof gate !== 'object') return 'a gate is not an object';
  if (typeof gate.name !== 'string' || gate.name.length === 0) return 'a gate has no name';
  if (!KNOWN_GATE_NAMES.includes(gate.name)) return `the gate ${gate.name} is not a stage-8 gate`;
  if (!Number.isInteger(gate.exitCode)) return `the gate ${gate.name} has no integer exit code`;
  return null;
}

/**
 * Build the evidence for one edited package.
 *
 * @param {{workspaceRoot: string, packageDir: string, packageId: string,
 *   repairs?: string[], gates?: object[], generatedAt?: string}} input
 * @returns {{ok: true, evidence: object} | {ok: false, code: string, detail: string}}
 */
export function buildEvidence({
  workspaceRoot,
  packageDir,
  packageId,
  repairs = [],
  gates = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const report = verifyApiConsistency({ workspaceRoot });
  if (report.code !== null) return refusal(report.code, 'the workspace cannot be measured');

  for (const gate of gates) {
    const problem = gateProblem(gate);
    if (problem !== null) {
      return refusal(EVIDENCE_CODES.GATE_UNKNOWN, problem);
    }
    if (!API_GATES.has(gate.name) && gate.exitCode !== 0) {
      return refusal(EVIDENCE_CODES.GATE_FAILED, `${gate.name} exited ${gate.exitCode}`);
    }
  }

  const findings = report.findings;
  const blockingIds = new Set(findings
    .filter((finding) => finding.severity === 'blocking')
    .map((finding) => finding.id));
  const unknownRepair = repairs.find((id) => !blockingIds.has(id));
  if (unknownRepair !== undefined) {
    return refusal(EVIDENCE_CODES.REPAIR_NOT_FOUND, `the baseline holds no blocking finding ${unknownRepair}`);
  }

  return {
    ok: true,
    evidence: {
      format: EVIDENCE_FORMAT,
      generatedAt,
      workspaceRoot: path.resolve(workspaceRoot),
      baseline: {
        digest: digestOfFindings(findings),
        findings,
      },
      editedPackages: [{
        id: packageId,
        package: path.resolve(packageDir),
        gates: gates.map(({ name, exitCode }) => ({ name, exitCode })),
        repairs: [...repairs],
      }],
    },
  };
}

/** Write one evidence record. */
export function writeEvidence(evidencePath, evidence) {
  fs.writeFileSync(path.resolve(evidencePath), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

/** Read one argument value. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function argumentFor(argv, name) {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  return inline === undefined ? null : inline.slice(`--${name}=`.length);
}

/** Every value of a repeatable argument. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function valuesFor(argv, name) {
  return argv
    .filter((entry) => entry.startsWith(`--${name}=`))
    .map((entry) => entry.slice(`--${name}=`.length));
}

/** The CLI entry point. */
export function main(argv = process.argv.slice(2)) {
  const workspaceRoot = argumentFor(argv, 'workspace');
  const packageDir = argumentFor(argv, 'package');
  const packageId = argumentFor(argv, 'id');
  const gatesPath = argumentFor(argv, 'gates');
  const outPath = argumentFor(argv, 'out');
  if (workspaceRoot === null || packageDir === null || packageId === null || gatesPath === null || outPath === null) {
    process.stderr.write('usage: cross-package-evidence.mjs --workspace=<root> --package=<dir> --id=<pkg-id> --gates=<json> --out=<path> [--repair=<finding-id> ...]\n');
    return 2;
  }

  const gateDocument = readJsonOrNull(path.resolve(gatesPath));
  const gates = Array.isArray(gateDocument) ? gateDocument : gateDocument?.gates;
  if (!Array.isArray(gates)) {
    process.stderr.write(`refused: ${gatesPath} does not carry a gates array\n`);
    return 2;
  }

  const result = buildEvidence({
    workspaceRoot,
    packageDir,
    packageId,
    gates,
    repairs: valuesFor(argv, 'repair'),
    generatedAt: argumentFor(argv, 'generated-at') ?? new Date().toISOString(),
  });
  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }

  writeEvidence(outPath, result.evidence);
  process.stdout.write(`${JSON.stringify({ ok: true, evidence: path.resolve(outPath), baseline: result.evidence.baseline.digest })}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
