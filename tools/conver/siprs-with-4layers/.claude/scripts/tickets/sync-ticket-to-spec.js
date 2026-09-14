#!/usr/bin/env node

/**
 * sync-ticket-to-spec.js — Transcribe ticket JSON fields to spec file
 *
 * Executed in Step 6. Writes background / scope / testUnit /
 * testIntegration / testExceptions / default_files / notes from the
 * ticket specified by ticketKey into the corresponding sections of
 * the spec file. Existing sections are skipped (idempotent).
 *
 * CLI: sync-ticket-to-spec.js --tickets=<Tickets.json> --ticket-key=<P{id}-{id}>
 */

const fs = require('fs');
const path = require('path');
const { appendToSpec } = require('../rfc-graph/dump-node-context-to-spec');

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketsPath = '';
  let ticketKey = '';
  for (const arg of args) {
    if (arg.startsWith('--tickets=')) ticketsPath = arg.slice('--tickets='.length);
    else if (arg.startsWith('--ticket-key=')) ticketKey = arg.slice('--ticket-key='.length);
  }
  if (!ticketsPath) ticketsPath = path.resolve('Tickets.json');
  else ticketsPath = path.resolve(ticketsPath);
  return { ticketsPath, ticketKey };
}

function parseTicketKey(key) {
  const px = key.match(/^PX-(\d+)$/i);
  if (px) return { phaseId: -1, ticketId: parseInt(px[1], 10) };
  const p = key.match(/^P(-?\d+)-(\d+)$/);
  if (p) return { phaseId: parseInt(p[1], 10), ticketId: parseInt(p[2], 10) };
  return null;
}

function findTicket(tickets, parsed) {
  if (!parsed) return null;
  for (const phase of tickets.phases || []) {
    if (phase.id !== parsed.phaseId && phase.phaseId !== parsed.phaseId) continue;
    return (phase.tickets || []).find(t => t.id === parsed.ticketId) || null;
  }
  return null;
}

/**
 * Write ticket fields as spec sections.
 * appendToSpec skips existing section headings, making this idempotent
 */
function writeFieldsToSpec(specPath, ticket) {
  // Field to spec section mapping
  const fields = [];

  if (ticket.background) {
    fields.push({ heading: '## Background', text: ticket.background });
  }

  if (ticket.scope && ticket.scope.length > 0) {
    const items = ticket.scope.map(s => `- ${s}`).join('\n');
    fields.push({ heading: '## Scope', text: items });
  }

  if (ticket.acceptanceCriteria && ticket.acceptanceCriteria.length > 0) {
    const items = ticket.acceptanceCriteria.map(a => `- ${a}`).join('\n');
    fields.push({ heading: '## Acceptance Criteria', text: items });
  }

  if (ticket.default_files && ticket.default_files.length > 0) {
    const items = ticket.default_files.map(f => `- \`${f}\``).join('\n');
    fields.push({ heading: '## Implementation Target Files', text: items });
  }

  if (ticket.testUnit && ticket.testUnit.length > 0) {
    const items = ticket.testUnit.map(u => `- ${u}`).join('\n');
    fields.push({ heading: '### Unit Tests', text: items });
  }

  if (ticket.testIntegration && ticket.testIntegration.length > 0) {
    const items = ticket.testIntegration.map(i => `- ${i}`).join('\n');
    fields.push({ heading: '### Integration Tests', text: items });
  }

  if (ticket.testExceptions && ticket.testExceptions.length > 0) {
    const items = ticket.testExceptions.map(e => `- ${e}`).join('\n');
    fields.push({ heading: '### Exceptions', text: items });
  }

  if (ticket.investigation) {
    fields.push({ heading: '## Investigation', text: ticket.investigation });
  }

  if (ticket.boyScoutPlan) {
    fields.push({ heading: '## Boy Scout Rule', text: ticket.boyScoutPlan });
  }

  if (ticket.notes) {
    fields.push({ heading: '## Notes', text: ticket.notes });
  }

  // Build complete section strings and pass to appendToSpec for writing
  for (const f of fields) {
    const section = f.heading + '\n\n' + f.text;
    try {
      appendToSpec(specPath, section);
    } catch (e) {
      console.error(`Warning: writing ${f.heading} failed: ${e.message}`);
    }
  }
}

function main() {
  const { ticketsPath, ticketKey } = parseArgs();

  if (!ticketKey || !parseTicketKey(ticketKey)) {
    console.error('Usage: sync-ticket-to-spec.js --ticket-key=<P{id}-{id}> [--tickets=<path>]');
    process.exit(EXIT_FAILURE);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error(`Tickets.json not found: ${ticketsPath}`);
    process.exit(EXIT_FAILURE);
  }

  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const parsed = parseTicketKey(ticketKey);
  const ticket = findTicket(tickets, parsed);

  if (!ticket) {
    console.error(`Ticket ${ticketKey} not found`);
    process.exit(EXIT_FAILURE);
  }

  // Resolve spec file path from specPath
  if (!ticket.specPath) {
    console.error(`Ticket ${ticketKey} has no specPath (spec file path)`);
    process.exit(EXIT_FAILURE);
  }
  const ticketsDir = path.dirname(ticketsPath);
  const specPath = path.resolve(ticketsDir, ticket.specPath);

  if (!fs.existsSync(specPath)) {
    console.error(`spec file not found: ${specPath}`);
    process.exit(EXIT_FAILURE);
  }

  writeFieldsToSpec(specPath, ticket);
  console.log(`synced ${ticketKey} → ${specPath}`);
  process.exit(EXIT_SUCCESS);
}

if (require.main === module) main();
module.exports = { parseArgs, writeFieldsToSpec, main };
