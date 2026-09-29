/**
 * Render one package's facts as the document a machine and an AI read.
 *
 * This is the record, not the explanation, and it is written in English because the AI reads
 * it. Every sentence here is a fact taken from the two manifests, the
 * seed or the specification, and every fact is printed with the identifier it came from, so
 * the AI can check any line against the artefacts rather than having to trust the prose.
 * Nothing in this module explains, evaluates or advises: the explanation is a different
 * document, in the human's own language, written by the AI against these facts, and it
 * lives in `frame.mjs`.
 *
 * One thing here is not English and must not be: the specification text. The specification
 * is a Japanese document and the facts quote it verbatim, because a record that translated
 * its source would no longer be a record of it.
 *
 * The sections are returned separately as well as joined, because the explanation's
 * per-section digests are taken over the facts each explanation section rests on, and a
 * digest taken over the whole document would move whenever any unrelated section moved.
 *
 * A list longer than `MAX_LISTED_ITEMS` is trimmed with an explicit count of what was left
 * out. Trimming silently would make a short document and a complete one look the same,
 * which is the one thing a document like this must never do. The serial, parallel and consumer
 * relations of the implementation order are the one exception, and they are printed in full:
 * those lists are the constraints themselves, and a trimmed one would state that a package is
 * unconstrained when the manifest says otherwise — the failure this record exists to prevent.
 */
import { relative } from 'node:path';

import { ExplainSeedError } from './errors.mjs';

/** The facts document, which is the one whose bytes stdout carries. */
export const INFO_DOCUMENT_FILE_NAME = 'INFO-RFC-SEED.md';

/** The bound every list in the document is held to, with the remainder counted. */
export const MAX_LISTED_ITEMS = 12;

/** The bound on the contract section, which is where a package's prose runs longest. */
export const MAX_LISTED_CONTRACTS = 8;

/** The bound on the clauses printed for one contract. */
export const MAX_LISTED_CLAUSES = 4;

/** The bound on one line of prose — a clause, a question, a specification quotation. */
export const MAX_EXCERPT_CHARS = 160;

/**
 * The whole document's bound, asserted by the test that gives one package far more than any
 * real one carries. A document past this is not read, so the human would grill while believing
 * the preparation was done.
 */
export const MAX_DOCUMENT_CHARS = 20000;

/** Said in full when a package owns no unresolved design question. */
export const ABSENT_RESIDUALS_STATEMENT = 'No unresolved design question is registered for this package.';

/** Said in full when a section has nothing to report. */
export const ABSENT_SECTION_STATEMENT = 'No record of this kind.';

/**
 * The nine section titles, named once.
 *
 * They are named here rather than inline because the explanation document refers to them
 * when it says which fact moved, and two copies of a title would be two names for one
 * section the moment either was edited.
 */
export const INFO_SECTION_TITLES = Object.freeze({
  I1: '1. What this document verified',
  I2: '2. Where the package sits',
  I3: '3. What this directory carries',
  I4: '4. Its relations with other directories',
  I5: '5. Contracts',
  I6: '6. Owned semantics, with the specification text',
  I7: '7. Forbidden dependencies and non-interference',
  I8: '8. Implementation obligations',
  I9: '9. What the grill must settle',
});

/** How this document says that a trimmed list left entries out. */
export function renderRemainder(count) {
  return `- …and ${count} more`;
}

/** How this document says that a line was cut short. */
export function renderOmitted(count) {
  return `…(${count} more characters omitted)`;
}

/**
 * One line of prose, shortened with the number of characters dropped stated in full.
 *
 * The notice is a parameter because this helper serves both documents and they are written
 * in different languages: the facts must not borrow the explanation's wording, or the two
 * documents would start to read as one.
 *
 * @param {string} text
 * @param {{ limit?: number, notice?: (count: number) => string }} [options]
 * @returns {string}
 */
export function truncateExcerpt(text, { limit = MAX_EXCERPT_CHARS, notice = renderOmitted } = {}) {
  const line = String(text).trim().split('\n').join(' ');
  if (line.length <= limit) return line;
  return `${line.slice(0, limit)}${notice(line.length - limit)}`;
}

/** Render a list, trimming it with an explicit remainder rather than silently. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderList(items, renderItem) {
  if (items.length === 0) return [`- ${ABSENT_SECTION_STATEMENT}`];
  const shown = items.slice(0, MAX_LISTED_ITEMS).map((item) => `- ${renderItem(item)}`);
  const remainder = items.length - shown.length;
  if (remainder > 0) shown.push(renderRemainder(remainder));
  return shown;
}

/** The heading and body of one section, as lines. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderSection(title, bodyLines) {
  return [`## ${title}`, '', ...bodyLines, ''];
}

/** The block that lets the AI check the document against the artefacts it came from. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderVerification({ workspace, seedPath, verified }) {
  return renderSection(INFO_SECTION_TITLES.I1, [
    'This document was generated from the seed, the two manifests and the specification alone, after every recorded hash was recomputed and agreed.',
    'A failed comparison ends the run with no document at all.',
    '',
    `- workspace root: \`${workspace.root}\``,
    `- specification: \`${relative(workspace.root, workspace.specPath)}\` (sha256 \`${verified.specification}\`)`,
    `- stage 1 manifest: \`${relative(workspace.root, workspace.treeManifestPath)}\` (manifest hash \`${verified.stageOneManifest}\`)`,
    `- stage 2 manifest: \`${relative(workspace.root, workspace.allocateManifestPath)}\``,
    `- seed: \`${relative(workspace.root, seedPath)}\` (sha256 \`${verified.seed}\`)`,
  ]);
}

/**
 * The two axes of the order, each said as the thing it is.
 *
 * The serial axis is the declared edges and nothing else. The parallel axis is the published
 * level, and the ground is the rule that produced it: levels are derived so that no two
 * packages in one level depend on each other, so sharing a level is a guarantee rather than an
 * absence of evidence. A difference in level is stated to be no ordering at all, because most
 * pairs at different levels hold no edge and reading the difference as an order would invent
 * constraints the manifests never declared.
 */
export const SERIAL_LABEL = 'serial - must be finished before this starts, declared edges only';
export const PARALLEL_LABEL = 'parallel - same level; the level rule guarantees no declared dependency between them';
export const CONSUMER_LABEL = 'used by - must wait for this one, declared edges only';
export const ALONE_NOTE = 'this level is alone, so this step is serial';
export const ORDERING_DENIAL = 'a different level is not an ordering';

/** A count with its noun, so the document reads as prose rather than as a template. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function formatCount(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * One axis: what it is, how many packages it holds, and which ones.
 *
 * These lists are printed in full rather than trimmed to `MAX_LISTED_ITEMS`. A trimmed relation
 * list would report a package as unconstrained when the manifest says it is not, and an omitted
 * provider is exactly the defect this section was rewritten to remove. The list is bounded by the
 * workspace, and the whole document keeps its own bound.
 */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function renderOrderAxis({ ids, label, pathOf, note = '' }) {
  if (ids.length === 0) {
    return note === '' ? [`- ${label}: none`] : [`- ${label}: none`, `  (${note})`];
  }
  return [`- ${label}: ${ids.length}`, ...ids.map((id) => `  - ${pathOf[id]}`)];
}

/** The order facts of this package, or the failure that says which manifest could not supply them. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function requireOrderFacts(position) {
  if (position.order === undefined || position.order === null) {
    throw new ExplainSeedError(
      'the implementation order was not read, so the serial and parallel relations cannot be stated',
      { field: 'implementation_order' },
    );
  }
  return position.order;
}

/** The id-to-path map the order relations are printed from, or the failure that says so. */
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
function requirePathOf(projection) {
  if (projection.pathOf === undefined || projection.pathOf === null) {
    throw new ExplainSeedError(
      'the stage-one manifest was not indexed by path, so the related directories cannot be named',
      { field: 'workspace.packages' },
    );
  }
  return projection.pathOf;
}

/** Where the package sits in the whole, and the two axes that place it there. */
// [::TICKET::] PX-221, PX-222, PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222|PX-224) --for-spec --no-implementation-order`.
export function renderPosition(projection) {
  const { position, totals } = projection;
  const order = requireOrderFacts(position);
  const pathOf = requirePathOf(projection);
  const placement = [
    position.wave === null ? null : `wave ${position.wave}`,
    position.level === null ? null : `implementation level ${position.level}`,
    position.serial_index === null ? null : `serial index ${position.serial_index}`,
  ]
    .filter((part) => part !== null)
    .join(' / ');

  return renderSection(INFO_SECTION_TITLES.I2, [
    `The whole is ${formatCount(totals.packages, 'package')}, ${formatCount(totals.layers, 'layer')} and ${formatCount(totals.boundaries, 'boundary', 'boundaries')}.`,
    '',
    ...(placement === '' ? [] : [`- placement of this package: ${placement}`]),
    `- in the implementation order: level ${order.level} (zero-based, as that order prints it) / position ${order.ordinal}${order.onCriticalPath ? ' / on the critical path' : ''}`,
    ...renderOrderAxis({ ids: order.waitsFor, label: SERIAL_LABEL, pathOf }),
    ...renderOrderAxis({ ids: order.parallelInLevel, label: PARALLEL_LABEL, pathOf, note: ALONE_NOTE }),
    ...renderOrderAxis({ ids: order.usedBy, label: CONSUMER_LABEL, pathOf }),
    `- ${ORDERING_DENIAL}`,
    `- the whole: ${formatCount(order.plan.directories, 'directory', 'directories')}, ${formatCount(order.plan.levels, 'level')}, ${formatCount(order.plan.dependencies, 'declared edge')}`,
    `- the critical chain is ${order.plan.criticalChainLength} long, so ${formatCount(order.plan.criticalChainLength, 'stage')} is the floor`,
  ]);
}

/** What the directory is for, in the words the manifest settled on. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderResponsibilities(projection) {
  const { identity } = projection;
  return renderSection(INFO_SECTION_TITLES.I3, [
    `- layer: ${identity.layer} / kind: ${identity.kind}`,
    `- path: \`${identity.path}\``,
    '',
    ...renderList(identity.responsibilities, (text) => text),
  ]);
}

/** Who depends on this package, and whom this package depends on. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderRelations(projection) {
  const describe = (boundary) =>
    `${boundary.id}: coupled with ${boundary.counterpart}` +
    (boundary.reason_code === null ? '' : ` (reason: ${boundary.reason_code})`) +
    (boundary.contract_scope.length === 0 ? '' : ` (contract scope: ${boundary.contract_scope.join(', ')})`);
  return renderSection(INFO_SECTION_TITLES.I4, [
    '### Provided by this package (the counterpart consumes it)',
    '',
    ...renderList(projection.boundaries.provided, describe),
    '',
    '### Consumed by this package',
    '',
    ...renderList(projection.boundaries.consumed, describe),
  ]);
}

/** The coupling contracts, with the clauses stage two already fixed. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderContracts(projection) {
  const entries = [
    ...projection.contracts.map((contract) => ({
      heading: `${contract.contract_id} (${contract.boundary_id} / ${contract.connection_kind ?? 'kind not recorded'}): ${contract.direction} — counterpart ${contract.counterpart}`,
      clauses: contract.clauses,
    })),
    ...projection.seed_edges.map((edge) => ({
      heading: `recorded in the seed: ${edge.contract_id} (${edge.direction ?? 'direction not recorded'} / ${edge.connection_kind ?? 'kind not recorded'}): counterpart ${edge.counterpart}`,
      clauses: edge.clauses,
    })),
  ];

  if (entries.length === 0) return renderSection(INFO_SECTION_TITLES.I5, [`- ${ABSENT_SECTION_STATEMENT}`]);

  const lines = [];
  for (const entry of entries.slice(0, MAX_LISTED_CONTRACTS)) {
    lines.push(`- ${entry.heading}`);
    for (const clause of entry.clauses.slice(0, MAX_LISTED_CLAUSES)) {
      lines.push(`  - ${clause.name}: ${truncateExcerpt(clause.text)}`);
    }
    const clausesLeft = entry.clauses.length - MAX_LISTED_CLAUSES;
    if (clausesLeft > 0) lines.push(`  ${renderRemainder(clausesLeft)}`);
  }
  const contractsLeft = entries.length - MAX_LISTED_CONTRACTS;
  if (contractsLeft > 0) lines.push(renderRemainder(contractsLeft));

  return renderSection(INFO_SECTION_TITLES.I5, lines);
}

/** What the package owns, each record with the specification text it came from. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderOwnedSemantics(projection) {
  if (projection.owned.length === 0) {
    return renderSection(INFO_SECTION_TITLES.I6, [`- ${ABSENT_SECTION_STATEMENT}`]);
  }

  const lines = [];
  for (const record of projection.owned.slice(0, MAX_LISTED_ITEMS)) {
    const range = record.quotation === null || record.quotation.line_start === null ? '' : ` (specification line ${record.quotation.line_start})`;
    const status = record.review_status === null ? '' : ` / ${record.review_status}`;
    lines.push(`- ${record.id} \`${record.canonical_name}\` (${record.label}${status})${range}`);
    if (record.quotation !== null && record.quotation.text !== '') {
      lines.push(`  > ${truncateExcerpt(record.quotation.text)}`);
    }
  }
  const remainder = projection.owned.length - MAX_LISTED_ITEMS;
  if (remainder > 0) lines.push(renderRemainder(remainder));

  return renderSection(INFO_SECTION_TITLES.I6, lines);
}

/** The dependencies the workspace decided against, and what stands in their place. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderForbidden(projection) {
  const lines = projection.forbidden_edges.map(
    (edge) =>
      `- ${edge.from} → ${edge.to} is forbidden` +
      (edge.reason === null ? '' : `: ${edge.reason}`) +
      (edge.reason_code === null ? '' : ` (reason code: ${edge.reason_code})`),
  );
  for (const edge of projection.forbidden_edges) {
    if (edge.alternative !== null) lines.push(`  - taken instead: ${edge.alternative}`);
  }
  return renderSection(INFO_SECTION_TITLES.I7, lines.length === 0 ? [`- ${ABSENT_SECTION_STATEMENT}`] : lines);
}

/** What the package must implement beyond its own semantics. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderObligations(projection) {
  const { ports, conformance, database_policy: databasePolicy } = projection.obligations;
  const lines = [
    ...renderList(ports, (port) => `port ${port.id}: ${port.capability} (provides: ${port.provides.join(', ')})`),
    ...renderList(conformance, (obligation) => obligation),
  ];
  if (databasePolicy !== null) {
    lines.push(`- database policy: ORM ${databasePolicy.orm ?? 'not recorded'} / additional engines ${databasePolicy.additional_engines_allowed === true ? 'allowed' : 'not allowed'}`);
  }
  return renderSection(INFO_SECTION_TITLES.I8, lines.length === 0 ? [`- ${ABSENT_SECTION_STATEMENT}`] : lines);
}

/** The questions the grill must settle, and the boundaries that carry the most risk. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function renderGrillPoints(projection) {
  const { questions, risky_boundaries: riskyBoundaries } = projection.grill;
  if (questions.length === 0 && riskyBoundaries.length === 0) {
    return renderSection(INFO_SECTION_TITLES.I9, [`- ${ABSENT_RESIDUALS_STATEMENT}`]);
  }

  const lines = [];
  if (questions.length === 0) {
    lines.push(`- ${ABSENT_RESIDUALS_STATEMENT}`);
  } else {
    for (const question of questions) {
      lines.push(`- ${question.residual_id}: ${truncateExcerpt(question.question)}`);
      if (question.topic !== null) lines.push(`  - topic: ${truncateExcerpt(question.topic)}`);
      if (question.why_unresolved !== null) lines.push(`  - why unresolved: ${truncateExcerpt(question.why_unresolved)}`);
    }
  }
  lines.push('', '### Boundaries to look at closely', '');
  lines.push(...renderList(riskyBoundaries, (boundary) => `${boundary.id}${boundary.topic === null ? '' : `: ${boundary.topic}`}`));
  return renderSection(INFO_SECTION_TITLES.I9, lines);
}

/**
 * The whole facts document, as text and as its nine sections.
 *
 * The header is not a section: it is the one paragraph that says what the AI is
 * holding, and digesting it would reopen every explanation section whenever the wording
 * of an instruction changed.
 *
 * @param {{ projection: object, workspace: object, seedPath: string, verified: object }} input
 * @returns {{ text: string, sections: Record<string, string> }} the document, and its parts
 */
export function renderInfo({ projection, workspace, seedPath, verified }) {
  const { identity } = projection;
  const header = [
    `# RFC-SEED record: ${identity.name} (${identity.id})`,
    '',
    'This document is the record. It is built from the two manifests, the specification and the seed alone, and it contains no explanation.',
    'The explanation is `EXPLAIN-RFC-SEED.md` beside it. The source of every fact is named in the section that states it.',
    'Text quoted from the specification is reproduced verbatim, in the language the specification is written in.',
    '',
  ];

  const parts = [
    ['I1', renderVerification({ workspace, seedPath, verified })],
    ['I2', renderPosition(projection)],
    ['I3', renderResponsibilities(projection)],
    ['I4', renderRelations(projection)],
    ['I5', renderContracts(projection)],
    ['I6', renderOwnedSemantics(projection)],
    ['I7', renderForbidden(projection)],
    ['I8', renderObligations(projection)],
    ['I9', renderGrillPoints(projection)],
  ];

  return {
    text: [header.join('\n'), ...parts.map(([, lines]) => lines.join('\n'))].join('\n'),
    sections: Object.fromEntries(parts.map(([id, lines]) => [id, lines.join('\n')])),
  };
}
