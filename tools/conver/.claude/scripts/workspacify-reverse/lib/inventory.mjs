/**
 * What a subject already holds, before anything is measured.
 *
 * Step 1 records the state the subject arrived in so that whatever happens downstream
 * is read against it: an interrupted cycle's in-flight work is recorded, never silently
 * continued and never silently deleted. The reading is mechanical — the artefacts the
 * pattern detection already found, the lifecycle status of every ticket, the DesignTree
 * and the partition a prior cycle left — so it is a script's work rather than a reader's.
 *
 * [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { detectPatternAt } from './pattern-detection.mjs';

/** The files whose presence Step 0 reads the pattern from. */
export const INVENTORY_ARTEFACT_NAMES = Object.freeze([
  'RFC-ROOT.md',
  'RFC-ROOT-GRAPH.json',
  'RFC-ROOT-Dirs-Tree.json',
  'Tickets.json',
  'DesignTree.json',
  'WORKSPACIFY-TREE-MANIFEST.json',
  'WORKSPACIFY-ALLOCATE-MANIFEST.json',
  'ARCHITECTURE-DELTA.json',
]);

/** Read a JSON file, reporting what went wrong rather than throwing on it. */
// [::TICKET::] P26-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P26-3 --for-spec --no-implementation-order`.
function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return { value: null, finding: null };
  try {
    return { value: JSON.parse(readFileSync(filePath, 'utf8')), finding: null };
  } catch (error) {
    return { value: null, finding: `${filePath} could not be read as JSON (${error.message})` };
  }
}

/**
 * Every ticket's lifecycle status, from any `Tickets.json` the subject carries.
 *
 * The status is named per ticket rather than counted: a count of tickets says nothing
 * about which of them is mid-cycle, and the work in flight is the thing Step 1 exists
 * to hold on to.
 */
export function readTicketLifecycle(root) {
  const path = join(root, 'Tickets.json');
  const { value, finding } = readJsonIfPresent(path);
  if (finding !== null) return { tickets: [], finding };
  if (value === null) return { tickets: [], finding: null };

  const phases = Array.isArray(value.phases) ? value.phases : [];
  const tickets = phases.flatMap((phase) =>
    (phase.tickets ?? []).map((ticket) => ({
      phase: phase.name ?? `P${phase.id}`,
      id: ticket.id,
      status: ticket.status ?? 'todo',
      title: ticket.title ?? '',
    })),
  );
  return { tickets, finding: null };
}

/**
 * What the subject already holds.
 *
 * @param {{root: string}} params — the directory the command was run in
 * @returns {{artefacts: string[], tickets: object[], designTree: boolean, partition: boolean, findings: string[]}}
 */
export function readInventory({ root } = {}) {
  const findings = [];
  const present = INVENTORY_ARTEFACT_NAMES.filter((name) => existsSync(join(root, name)));

  let pattern = null;
  try {
    pattern = detectPatternAt(root);
  } catch (error) {
    findings.push(`${root} could not be read (${error.message})`);
  }
  if (pattern?.artefacts?.length > 0) {
    for (const artefact of pattern.artefacts) {
      const relPath = typeof artefact === 'string' ? artefact : artefact.path;
      if (relPath !== undefined && !present.includes(relPath)) present.push(relPath);
    }
  }

  const lifecycle = readTicketLifecycle(root);
  if (lifecycle.finding !== null) findings.push(lifecycle.finding);

  return {
    root,
    artefacts: present.sort(),
    tickets: lifecycle.tickets,
    designTree: existsSync(join(root, 'DesignTree.json')),
    partition: existsSync(join(root, 'RFC-ROOT-Dirs-Tree.json')),
    findings,
  };
}

/** The inventory as Markdown: what was found, and the lifecycle status of each ticket. */
export function renderInventory(inventory) {
  const artefactCount = inventory.artefacts.length;
  const lines = [
    '# Inventory',
    '',
    `Subject: \`${inventory.root}\``,
    artefactCount === 0
      ? 'Conver artefacts found: none. The subject carries no conver scaffolding, so nothing is recorded here that a later Step must not lose.'
      : `Conver artefacts found: ${artefactCount}.`,
    '',
  ];

  if (artefactCount > 0) {
    lines.push('| Artefact |', '|---|');
    for (const artefact of inventory.artefacts) lines.push(`| \`${artefact}\` |`);
    lines.push('');
  }

  lines.push(
    inventory.tickets.length === 0
      ? 'Tickets in flight: none — no `Tickets.json` carries a ticket.'
      : `Tickets in flight: ${inventory.tickets.length}. The status of each is named below, because an interrupted cycle is recorded rather than continued or deleted.`,
    '',
  );

  if (inventory.tickets.length > 0) {
    lines.push('| Phase | Ticket | Status | Title |', '|---|---|---|---|');
    for (const ticket of inventory.tickets) {
      lines.push(`| ${ticket.phase} | ${ticket.id} | ${ticket.status} | ${ticket.title} |`);
    }
    lines.push('');
  }

  lines.push(
    `DesignTree present: ${inventory.designTree ? 'yes' : 'no'}. Prior partition present: ${inventory.partition ? 'yes' : 'no'}.`,
  );

  for (const finding of inventory.findings) lines.push('', `Unreadable: ${finding}`);
  return `${lines.join('\n')}\n`;
}
