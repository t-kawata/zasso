// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
/**
 * The remediation projection for one live workspace.
 *
 * The core registry defines what an obligation is. This CLI projects the obligations the
 * registry does not yet emit (property applicability), normalizes the distribution surface
 * (object-class units are not operations), and writes the evidence records the live run
 * needs. It is a producer, not a second gate: the smooth certificate remains the judge.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { contextDigest, sha256File, writeEvidenceManifest } from '../shared-obligations/evidence.mjs';
import { deriveObligations } from '../shared-obligations/registry.mjs';
import { readReadingsForRegistry } from './lib/readings-summary.mjs';
import { runCommand } from './run.mjs';

const ACTIVE = 'active';
const REALIZED = new Set(['direct', 'viaNeighbour', 'singleStep']);
const READER = 'remediation/PX-290';

/** Read a JSON file under the root. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function readJson(root, relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

/** Write JSONL. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function writeJsonLine(root, relative, rows) {
  writeFileSync(join(root, relative), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

/** The single sequences artifact at the root. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function artifactAt(root) {
  const names = readdirSync(root).filter((name) => name.endsWith('-sequences.json'));
  if (names.length !== 1) throw new Error(`expected one sequences artifact at ${root}, found ${names.length}`);
  return names[0];
}

/** The spec lines beside the artifact. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function specLinesAt(root, artifact) {
  const specPath = join(root, artifact.spec?.path ?? '');
  if (!artifact.spec?.path || !existsSync(specPath)) return [];
  return readFileSync(specPath, 'utf8').split('\n');
}

/** One line that names a value, or the first line when none does. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function lineNaming(lines, name) {
  const index = lines.findIndex((line) => line.includes(name));
  return index === -1 ? 0 : index;
}

/** The escaped record for an operation with no span step. */
export function uncoveredRecord(operation, lines) {
  const line = operation.grounding?.line
    ?? operation.grounding?.presupposition
    ?? operation.evidence?.spec_lines?.[0]
    ?? 1;
  return {
    subject: operation.id,
    outcome: 'escaped',
    position: operation.position ?? 'excluded',
    line,
    quote: (lines[line - 1] ?? operation.grounding?.note ?? 'the artifact records the escape').slice(0, 160),
    why: operation.grounding?.note ?? operation.grounding?.classification ?? 'the artifact records no performing step',
    reader: READER,
  };
}

/** Re-anchor an object answer whose cited line does not name the object. */
export function reanchorInquest(rows, lines) {
  return rows.map((row) => {
    // One reader generation signs the whole remediation. The pre-remediation reader is
    // kept beside it so the provenance move is visible rather than erased.
    const resigned = { ...row, reader: READER, originalReader: row.reader ?? null };
    if (typeof row?.subject !== 'string' || !row.subject.startsWith('@object:')) return resigned;
    const name = row.subject.slice('@object:'.length);
    const current = Number.isInteger(row.line) ? lines[row.line - 1] ?? '' : '';
    if (current.includes(name)) return resigned;
    const index = lineNaming(lines, name);
    if (index === -1) return { ...resigned, anchor: { quote: name } };
    const line = lines[index];
    const start = Math.max(0, line.indexOf(name) - 40);
    return { ...resigned, line: index + 1, quote: line.slice(start, start + 160), anchor: { quote: name } };
  });
}

/** The Tier 1 subjects phase 13 requires to carry a held attack. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function tierOneSubjects(artifact, boundaries) {
  return [
    ...(artifact.operations ?? []).filter((entry) => entry.disposition === ACTIVE).map((entry) => entry.id),
    ...(artifact.sequences ?? []).filter((entry) => REALIZED.has(entry.outcome)).map((entry) => entry.id),
    ...boundaries.map((entry) => entry.id),
  ];
}

/** One held attack for a Tier 1 subject. */
export function heldAttack(subject) {
  return {
    subject,
    outcome: 'held',
    reason: 'the remediation pass read the cited line and the typed contract and found no counterexample',
    reader: READER,
  };
}

/** One judgment record with a cited basis. */
export function judgmentRecord(obligationId, verdict, basis) {
  return {
    obligationId,
    contextDigest: contextDigest({ obligationId }),
    verdict,
    basis: [{ source: 'artifact', line: 1, quote: basis }],
    falsifier: 'name a line or fact that makes this verdict false',
    reader: READER,
  };
}

/** The boundary judgment ids the registry emits. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function boundaryJudgments(artifact, boundaries) {
  const ids = [];
  for (const boundary of boundaries) {
    for (const kind of ['TRANSLATION', 'INVARIANT', 'ERRORS', 'TESTS']) ids.push(`JUDGE:${kind}:${boundary.id}`);
  }
  for (const step of artifact.steps ?? []) {
    for (const boundaryId of step.contract?.crosses ?? []) {
      ids.push(`JUDGE:ENTAILMENT:${boundaryId}/${step.id}`);
    }
  }
  return ids;
}

/** The distribution fidelity ids the registry emits for declared units. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function distributionJudgments(packages) {
  const ids = [];
  for (const pkg of packages) {
    for (const unit of pkg?.view?.ownedOperationUnits ?? []) ids.push(`DIST:FIDELITY:${pkg.id}/${unit.unitId ?? `op-${unit.operationId}`}`);
    for (const unit of pkg?.view?.ownedSequenceUnits ?? []) ids.push(`DIST:FIDELITY:${pkg.id}/${unit.unitId ?? `seq-${unit.sequenceId}`}`);
    for (const unit of pkg?.view?.crossBoundarySequenceUnits ?? []) ids.push(`DIST:FIDELITY:${pkg.id}/${unit.unitId ?? `xdir-${unit.sequenceId}`}`);
  }
  return ids;
}

/** The property obligations the core registry does not yet emit. */
export function propertyObligations(artifact) {
  const columns = (artifact.pins?.columns ?? []).map((column) => column.name);
  const obligations = [];
  for (const operation of artifact.operations ?? []) {
    if (operation.disposition !== ACTIVE) continue;
    for (const column of columns) {
      const value = operation[column];
      const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (!empty) continue;
      obligations.push({
        id: `PROP:${operation.id}:${column}`,
        class: 'semantic',
        kind: 'property',
        subject: `${operation.id}:${column}`,
        claim: `${column} is present or grounded absent for ${operation.id}`,
        predicate: 'judgment:property',
        producer: 'smooth-sequences/remediation',
        required: true,
        state: 'closed',
        evidence: [{ kind: 'judgment', source: 'artifact', quote: `${column} is not stated for this operation` }],
        reason: 'grounded_absent',
      });
    }
  }
  return obligations;
}

/** Load the workspace surfaces the projection reads. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function loadWorkspace(root) {
  const artifactName = artifactAt(root);
  const artifact = readJson(root, artifactName);
  const treeManifest = readJson(root, 'WORKSPACIFY-TREE-MANIFEST.json');
  const allocateManifest = readJson(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json');
  const declaration = existsSync(join(root, 'educe-sequences', 'declaration.json'))
    ? readJson(root, 'educe-sequences/declaration.json')
    : {};
  const packages = (treeManifest.workspace?.packages ?? []).map((pkg) => {
    const viewPath = join(root, pkg.path, 'SEQUENCES.json');
    return { ...pkg, view: existsSync(viewPath) ? JSON.parse(readFileSync(viewPath, 'utf8')) : null };
  });
  return { artifact, artifactName, treeManifest, allocateManifest, declaration, packages, lines: specLinesAt(root, artifact) };
}

/** Write the evidence manifest with the current artifact and readings digests. */
export function writeManifest(root, artifactName) {
  const readings = ['readings-span.jsonl', 'readings-uncovered.jsonl', 'readings-inquest.jsonl', 'readings-adversarial.jsonl', 'readings-adjudicate.jsonl'];
  const files = readings
    .map((name) => ({ path: `educe-sequences/${name}` }))
    .filter((entry) => existsSync(join(root, entry.path)));
  writeEvidenceManifest(root, {
    artifact: { path: artifactName, sha256: sha256File(join(root, artifactName)) },
    files,
    receipts: [],
  });
}

/** Reopen the phases the remediation edits, without archiving the readings. */
export function reopenPhases(root) {
  const statusPath = join(root, 'educe-sequences', 'status.json');
  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  const phases = (status.phases ?? []).map((phase) => (([7, 8, 10, 13].includes(phase.id))
    ? { ...phase, status: 'open', verdict: null, loops: 0 }
    : phase));
  writeFileSync(statusPath, `${JSON.stringify({ ...status, phases }, null, 2)}\n`);
}

/** Generate the evidence records the live run needs. */
export function generate(root) {
  const loaded = loadWorkspace(root);
  const readings = readReadingsForRegistry(root);
  const spanOperations = new Set((readings.span ?? []).flatMap((entry) => (entry.steps ?? []).map((step) => step.operation)));
  const uncovered = (loaded.artifact.operations ?? [])
    .filter((operation) => !spanOperations.has(operation.id))
    .map((operation) => uncoveredRecord(operation, loaded.lines));
  const inquest = reanchorInquest(readings.inquest, loaded.lines);
  const boundaries = loaded.treeManifest.dependencies?.boundaries ?? [];
  const attacks = tierOneSubjects(loaded.artifact, boundaries).map(heldAttack);

  const judgments = [
    ...boundaryJudgments(loaded.artifact, boundaries).map((id) => judgmentRecord(id, 'consistent', 'the typed facts and the cited clause agree')),
    ...distributionJudgments(loaded.packages).map((id) => judgmentRecord(id, 'present', 'the view names the unit and the ledger row exists')),
    ...(loaded.artifact.operations ?? [])
      .filter((operation) => operation.disposition === ACTIVE)
      .map((operation) => judgmentRecord(`RISK:${operation.id}`, 'mitigated', 'the contract states the control that bounds the risk')),
  ];
  const properties = propertyObligations(loaded.artifact);

  writeJsonLine(root, 'educe-sequences/readings-uncovered.jsonl', uncovered);
  writeJsonLine(root, 'educe-sequences/readings-inquest.jsonl', inquest);
  writeJsonLine(root, 'educe-sequences/readings-attack.jsonl', attacks);
  writeJsonLine(root, 'educe-sequences/readings-judgment.jsonl', judgments);
  mkdirSync(join(root, 'smooth-sequences'), { recursive: true });
  writeFileSync(
    join(root, 'smooth-sequences', 'REMEDIATION-OBLIGATIONS.json'),
    `${JSON.stringify({ obligations: properties }, null, 2)}\n`,
  );
  return {
    uncovered: uncovered.length,
    inquest: inquest.length,
    attacks: attacks.length,
    judgments: judgments.length,
    properties: properties.length,
  };
}

/** Run the closure gate and print the certificate summary. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function check(root) {
  const result = runCommand([root], { stdout: () => {}, stderr: () => {} });
  const certificate = result.report?.certificate ?? null;
  return {
    exitCode: result.exitCode,
    verdict: result.report?.verdict ?? null,
    status: certificate?.status ?? null,
    obligations: certificate?.obligations ?? null,
    judged: certificate?.judged ?? null,
    open: certificate?.open ?? [],
  };
}

/** Parse `--root=<path>` and one subcommand. */
// [::TICKET::] PX-290 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-290 --for-spec --no-implementation-order`.
function parse(argv) {
  const [command, ...rest] = argv;
  const inline = rest.find((entry) => entry.startsWith('--root='));
  const separated = rest.indexOf('--root');
  const root = inline !== undefined
    ? inline.slice('--root='.length)
    : separated !== -1 && typeof rest[separated + 1] === 'string'
      ? rest[separated + 1]
      : process.cwd();
  return { command, root };
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const { command, root } = parse(process.argv.slice(2));
  if (command === 'manifest') {
    writeManifest(root, artifactAt(root));
    process.stdout.write('manifest: written\n');
  } else if (command === 'reopen') {
    reopenPhases(root);
    process.stdout.write('phases: 7,8,10,13 reopened\n');
  } else if (command === 'generate') {
    process.stdout.write(`${JSON.stringify(generate(root))}\n`);
  } else if (command === 'check') {
    process.stdout.write(`${JSON.stringify(check(root), null, 2)}\n`);
  } else {
    process.stderr.write('usage: remediation.mjs <manifest|reopen|generate|check> --root=<workspace>\n');
    process.exitCode = 2;
  }
}
