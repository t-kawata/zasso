#!/usr/bin/env node
/**
 * explain-seed — one seed path in, the facts out, and an explanation maintained beside them.
 *
 * Usage:
 *   node .claude/scripts/explain-seed/run.mjs info    <path-to-RFC-SEED.md>
 *   node .claude/scripts/explain-seed/run.mjs check   <path-to-RFC-SEED.md>
 *   node .claude/scripts/explain-seed/run.mjs answers <path-to-RFC-SEED.md>
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
 * question for the human offers directions and a recommendation and names whose experience
 * changes, and every section rests on facts that are still the facts on disk. The AI may
 * report only what this gate accepts.
 *
 * `answers` is the other half of the same question: `check` says the explanation may be put to
 * the human, and `answers` says the human has answered it. It exits 0 only when every question
 * in the human's section carries prose under its placeholder, and names the ones that do not,
 * so a round of questions ends at a verdict rather than at a hope.
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
import { splitItems, decisionUnderPlaceholder } from './lib/items.mjs';
import { INFO_DOCUMENT_FILE_NAME, INFO_SECTION_TITLES, renderInfo } from './lib/render.mjs';
import {
  EXPLAIN_FILE_NAME,
  FRAME_SECTIONS,
  HUMAN_ITEM_HEADING,
  HUMAN_SECTION_ID,
  buildFrame,
  locateSections,
  verifyExplanation,
} from './lib/frame.mjs';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const ERROR_PREFIX = '[explain-seed]';

/** The things this command does, and nothing else. */
export const OPERATIONS = Object.freeze({ INFO: 'info', CHECK: 'check', ANSWERS: 'answers' });

/** What the refusal names, derived so the message cannot describe a parser that no longer exists. */
const OPERATION_NAMES = Object.freeze(Object.values(OPERATIONS));

/** What each fault means, said in the terms the operator reading the report is holding. */
const FAULT_MESSAGES = Object.freeze({
  'open-marker': 'an explanation point has not been written yet',
  'missing-placeholder': 'there is no place for the human to write',
  'duplicate-placeholder': 'there is more than one place for the human to write',
  'unnamed-party': 'the item does not say whose experience changes',
  'missing-context':
    'the question carries no context a person who knows neither the implementation nor the design could judge it from',
  'too-few-options': 'the item offers fewer than two directions to choose between, or two that carry the same letter',
  'missing-recommendation': 'the item does not recommend one of the directions it offers',
  'missing-recommendation-reason': 'the reason for the recommendation is not stated',
  'missing-recommendation-override': 'the condition that would overturn the recommendation is not stated',
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
// [::TICKET::] PX-222, PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226) --for-spec --no-implementation-order`.
export function parseArguments(argv) {
  const [operation, seedArgument, ...rest] = argv;
  const refused = () =>
    new ExplainSeedError(
      `explain-seed takes an operation (${OPERATION_NAMES.join(', ')}) and one seed path; received ${JSON.stringify(argv)}`,
      { field: 'arguments' },
    );

  if (operation === undefined || seedArgument === undefined || rest.length > 0) throw refused();
  if (operation.startsWith('-') || seedArgument.startsWith('-')) throw refused();
  if (!OPERATION_NAMES.includes(operation)) throw refused();
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

/** The explanation this run reads, or a failure naming the path it looked for. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function readExplanationOrFail(seedPath) {
  const { explainPath } = documentPaths(seedPath);
  if (!existsSync(explainPath)) {
    throw new ExplainSeedError(`the explanation cannot be read: ${explainPath}`, { field: EXPLAIN_FILE_NAME });
  }
  return readFileSync(explainPath, 'utf8');
}

/** Decide whether the explanation may be reported. */
// [::TICKET::] PX-222, PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-226) --for-spec --no-implementation-order`.
function runCheck(seedPath) {
  const explainText = readExplanationOrFail(seedPath);
  const { facts } = produceInfo(seedPath);
  const verdict = verifyExplanation({ facts, explainText });
  process.stdout.write(renderVerdict(verdict));
  return verdict.ok ? EXIT_OK : EXIT_FAILURE;
}

/**
 * How far the round of questions has got, read from one explanation.
 *
 * A section that cannot be found or that appears twice is a reading failure rather than an
 * empty round: "no question has an answer yet" and "there is nowhere answers go" are different
 * states, and a reader that reported the second as the first would call an unreadable document
 * finished.
 *
 * @param {string} explainText
 * @returns {{ asked: number, answered: number, unanswered: Array<string> }}
 */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
export function readAnswers(explainText) {
  const located = locateSections(explainText);
  if (located.missing.includes(HUMAN_SECTION_ID) || located.duplicates.includes(HUMAN_SECTION_ID)) {
    throw new ExplainSeedError(
      `the questions cannot be read: ${HUMAN_SECTION_ID} is not a section this document holds once`,
      { field: EXPLAIN_FILE_NAME },
    );
  }

  const items = splitItems(located.bodies[HUMAN_SECTION_ID], HUMAN_ITEM_HEADING);
  const unanswered = items.filter((item) => decisionUnderPlaceholder(item.body) === null).map((item) => item.id);
  return { asked: items.length, answered: items.length - unanswered.length, unanswered };
}

/** What the round of questions has left to do, as the operator reads it. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
export function renderAnswerVerdict({ asked, answered, unanswered }) {
  if (asked === 0) {
    return 'answers OK: there was nothing to ask — no question stands in the human\'s section.\n';
  }
  if (unanswered.length === 0) {
    return `answers OK: ${answered} of ${asked} answered, none still open.\n`;
  }
  return [
    `answers FAILED: ${answered} of ${asked} answered, ${unanswered.length} still open.`,
    ...unanswered.map((id) => `- ${id}`),
    '',
  ].join('\n');
}

/** Report how many questions the human has answered, and name the ones they have not. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function runAnswers(seedPath) {
  const reading = readAnswers(readExplanationOrFail(seedPath));
  process.stdout.write(renderAnswerVerdict(reading));
  return reading.unanswered.length === 0 ? EXIT_OK : EXIT_FAILURE;
}

// [::TICKET::] PX-221, PX-222, PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-226) --for-spec --no-implementation-order`.
function main(argv) {
  try {
    const { operation, seedPath } = parseArguments(argv);
    if (operation === OPERATIONS.CHECK) return runCheck(seedPath);
    if (operation === OPERATIONS.ANSWERS) return runAnswers(seedPath);
    return runInfo(seedPath);
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
