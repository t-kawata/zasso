#!/usr/bin/env node
/**
 * explain-seed — one seed path in, the facts out, and an explanation maintained beside them.
 *
 * Usage:
 *   node .claude/scripts/explain-seed/run.mjs info  <path-to-RFC-SEED.md>
 *   node .claude/scripts/explain-seed/run.mjs check <path-to-RFC-SEED.md>
 *
 * The seed is the only input because the seed already knows everything else: its identity
 * block names the package and the three reference paths, and the workspace root is the
 * directory holding the stage-one manifest above it. The operation says what to do, never
 * what to read, so two people running this on one seed still get one set of documents.
 *
 * `info` writes the facts to `INFO-RFC-SEED.md` and prints those same bytes, and maintains
 * `EXPLAIN-RFC-SEED.md` beside it — the frame the AI fills and a person writes into. The
 * report of what was kept and what was reopened goes to stderr, because stdout is the facts
 * document and must be nothing else. Both reports are in English: they are read by whoever
 * runs the command, not by the person the explanation is written for.
 *
 * `check` is the gate. It exits 0 only when every instruction has been answered, every
 * question for the human names whose experience changes, and every section rests on facts
 * that are still the facts on disk. The AI may report only what this gate accepts.
 *
 * Nothing is written until every recorded hash has been recomputed and agreed, with or
 * without a document from an earlier run: an earlier document changes what is preserved,
 * never what is verified.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ExplainSeedError } from './lib/errors.mjs';
import { readSeed, requireField } from './lib/seed-document.mjs';
import { loadWorkspace } from './lib/workspace.mjs';
import { verifyRecordedHashes } from './lib/verify.mjs';
import { boundaryPairs, packagePaths, projectPackage } from './lib/projection.mjs';
import { collectSettledDecisions } from './lib/neighbour-decisions.mjs';
import { loadOrderFacts } from './lib/order.mjs';
import { INFO_DOCUMENT_FILE_NAME, INFO_SECTION_TITLES, renderInfo } from './lib/render.mjs';
import { EXPLAIN_FILE_NAME, FRAME_SECTIONS, buildFrame, verifyExplanation } from './lib/frame.mjs';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const ERROR_PREFIX = '[explain-seed]';

/** The two things this command does, and nothing else. */
const OPERATIONS = Object.freeze({ INFO: 'info', CHECK: 'check' });

/** What each fault means, said in the terms the operator reading the report is holding. */
const FAULT_MESSAGES = Object.freeze({
  'open-marker': 'an explanation point has not been written yet',
  'missing-placeholder': 'there is no place for the human to write',
  'duplicate-placeholder': 'there is more than one place for the human to write',
  'unnamed-party': 'the item does not say whose experience changes',
  'unrecorded-decision': 'a question the manifests never recorded is being asked of the human',
  'missing-decision': 'the decision is not stated',
  'missing-ground': 'the ground it rests on is not stated',
  'unresolvable-ground': 'the ground does not name a record in the manifests',
  'missing-override': 'the condition that would overturn it is not stated',
  'open-item-as-ground': 'an undecided question is being used as the ground of a decision',
  'missing-open-item': 'an unresolved question the manifests recorded has disappeared',
  'open-item-in-both-sections': 'the same question appears in both sections',
  'count-mismatch': 'the count the introduction declares is not the number of items',
  'stale-digest': 'the facts this section rested on have moved',
  'missing-section': 'the section is missing',
  'duplicate-section': 'the section appears more than once',
  'unreadable-section': 'the place the human wrote cannot be found',
  'missing-digest-block': 'the document does not record which facts it was built from',
});

/** The operation and the one seed path it acts on. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function parseArguments(argv) {
  const [operation, seedArgument, ...rest] = argv;
  const refused = () =>
    new ExplainSeedError(
      `explain-seed takes an operation (${OPERATIONS.INFO} or ${OPERATIONS.CHECK}) and one seed path; received ${JSON.stringify(argv)}`,
      { field: 'arguments' },
    );

  if (operation === undefined || seedArgument === undefined || rest.length > 0) throw refused();
  if (operation.startsWith('-') || seedArgument.startsWith('-')) throw refused();
  if (operation !== OPERATIONS.INFO && operation !== OPERATIONS.CHECK) throw refused();
  return { operation, seedPath: resolve(seedArgument) };
}

/**
 * Resolve, verify, project and render one seed, without writing anything. Reading only.
 *
 * The implementation order is read here rather than inside the projection, so the projection
 * stays what its module says it is — a reading of facts already in hand, with no I/O of its
 * own. `check` comes through this function too, so the order is re-derived on every gate run and
 * a moved order reopens the sections that rest on it.
 *
 * @param {string} seedPath
 * @returns {{ info: { text: string, sections: object }, facts: object }}
 */
export function produceInfo(seedPath) {
  const { seedText, identity, contractEdges } = readSeed(seedPath);
  const workspace = loadWorkspace({ seedPath, identity });
  const verified = verifyRecordedHashes({ identity, workspace, seedText });
  const orderFacts = loadOrderFacts({
    root: workspace.root,
    seedPath,
    packages: workspace.treeManifest.workspace?.packages,
  });
  const packageId = requireField(identity, 'package.id');
  const settlements = collectSettledDecisions({
    root: workspace.root,
    packageId,
    boundaries: boundaryPairs({ packageId, treeManifest: workspace.treeManifest }),
    pathOf: packagePaths(workspace.treeManifest),
  });
  const projection = projectPackage({
    identity,
    workspace,
    contractEdges,
    orderFacts,
    settledElsewhere: settlements.settled,
  });
  const info = renderInfo({ projection, workspace, seedPath, verified });
  return {
    info,
    facts: { projection, workspace, seedPath, infoSections: info.sections, unreadableNeighbours: settlements.unreadable },
  };
}

/** Where the two documents live, given the seed they describe. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function documentPaths(seedPath) {
  const beside = dirname(seedPath);
  return {
    infoPath: join(beside, INFO_DOCUMENT_FILE_NAME),
    explainPath: join(beside, EXPLAIN_FILE_NAME),
  };
}

/** The section title a fault is about, or the section id when it is about none. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionName(sectionId) {
  const section = FRAME_SECTIONS.find((candidate) => candidate.id === sectionId);
  return section === undefined ? `INFO ${String(sectionId).replace('I', '')}「${INFO_SECTION_TITLES[sectionId] ?? sectionId}」` : `${sectionId}「${section.title}」`;
}

/** What the run did to the explanation, and what it found wrong with the earlier one. */
// [::TICKET::] PX-222, PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-225) --for-spec --no-implementation-order`.
function renderRunReport({ frame, unreadableNeighbours }) {
  const lines = [`explanation: kept ${frame.keptSections.length}, reopened ${frame.reopenedSections.length}`];
  for (const neighbour of unreadableNeighbours) {
    lines.push(`neighbour explanation not read: ${neighbour.document} — ${neighbour.reason}`);
  }
  if (frame.reopenedSections.length > 0) {
    lines.push(`reopened: ${frame.reopenedSections.map(sectionName).join(', ')}`);
  }
  for (const fault of frame.faults) {
    lines.push(`fault in the earlier document: ${sectionName(fault.section)} — ${FAULT_MESSAGES[fault.kind] ?? fault.kind}${fault.id === null ? '' : ` (${fault.id})`}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The verdict of the gate, as the operator reads it. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function renderVerdict(verdict) {
  const balance = `${verdict.decidedForHuman} decided for the human, ${verdict.askedOfHuman} left to the human`;
  if (verdict.ok) {
    return `check OK: the explanation is complete against the facts as those facts now stand — ${balance}.\n`;
  }

  const lines = [`check FAILED: ${verdict.faults.length} fault(s) — ${balance}.`, ''];
  const counted = new Map();
  for (const fault of verdict.faults) {
    if (fault.id !== null) {
      lines.push(`- ${sectionName(fault.section)}: ${FAULT_MESSAGES[fault.kind] ?? fault.kind} (${fault.id})`);
      continue;
    }
    const key = `${fault.kind}\u0000${fault.section}`;
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }

  for (const [key, count] of counted) {
    const [kind, section] = key.split('\u0000');
    lines.push(`- ${sectionName(section)}: ${FAULT_MESSAGES[kind] ?? kind}${count > 1 ? ` (${count})` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Write the facts, maintain the explanation, and print the facts. */
// [::TICKET::] PX-222, PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-225) --for-spec --no-implementation-order`.
function runInfo(seedPath) {
  const { info, facts } = produceInfo(seedPath);
  const { infoPath, explainPath } = documentPaths(seedPath);
  const previous = existsSync(explainPath) ? readFileSync(explainPath, 'utf8') : null;
  const frame = buildFrame({ facts, previous });

  writeFileSync(infoPath, info.text, 'utf8');
  writeFileSync(explainPath, frame.text, 'utf8');
  process.stdout.write(info.text);
  process.stderr.write(renderRunReport({ frame, unreadableNeighbours: facts.unreadableNeighbours }));
  return EXIT_OK;
}

/** Decide whether the explanation may be reported. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function runCheck(seedPath) {
  const { explainPath } = documentPaths(seedPath);
  if (!existsSync(explainPath)) {
    throw new ExplainSeedError(`the explanation cannot be read: ${explainPath}`, { field: EXPLAIN_FILE_NAME });
  }

  const { facts } = produceInfo(seedPath);
  const verdict = verifyExplanation({ facts, explainText: readFileSync(explainPath, 'utf8') });
  process.stdout.write(renderVerdict(verdict));
  return verdict.ok ? EXIT_OK : EXIT_FAILURE;
}

// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function main(argv) {
  try {
    const { operation, seedPath } = parseArguments(argv);
    return operation === OPERATIONS.CHECK ? runCheck(seedPath) : runInfo(seedPath);
  } catch (error) {
    if (error instanceof ExplainSeedError) {
      process.stderr.write(`${ERROR_PREFIX} ${error.message}\n`);
      return EXIT_FAILURE;
    }
    throw error;
  }
}

/** Whether this file is the program being run, rather than a module another file imported. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function isProgramRun() {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isProgramRun()) {
  process.exitCode = main(process.argv.slice(2));
}
