#!/usr/bin/env node

/**
 * resolve-spec-path.js — Resolve spec file path from a ticket key
 *
 * Reads Tickets.json to find the ticket's referenceSection field.
 * Falls back to deriving the path from the ticket key.
 *
 * dump-ticket-graph-commands.js and ensure-ticket.js both use this.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse a ticket key into phaseId and ticketId
 *
 * @param {string} ticketKey — "P{phaseId}-{ticketId}" or "PX-{ticketId}" format
 * @returns {{ phaseId: number, ticketId: number } | null}
 */
function parseTicketKey(ticketKey) {
  // PX-{id} format (independent phase, phaseId = -1)
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  if (pxMatch) {
    return { phaseId: -1, ticketId: parseInt(pxMatch[1], 10) };
  }

  // P{phaseId}-{ticketId} format
  const pMatch = ticketKey.match(/^P(-?\d+)-(\d+)$/);
  if (pMatch) {
    return { phaseId: parseInt(pMatch[1], 10), ticketId: parseInt(pMatch[2], 10) };
  }

  return null;
}

/**
 * Resolve spec file path from a ticket key using Tickets.json.
 *
 * Reads Tickets.json to find the ticket matching the given key,
 * then uses its referenceSection field if present. The spec path
 * is resolved relative to the Tickets.json directory.
 *
 * @param {string} ticketKey — "P{phaseId}-{ticketId}" or "PX-{ticketId}" format
 * @param {string} ticketsJsonPath — Path to Tickets.json
 * @returns {string|null} Absolute spec path, or null
 */
function resolveSpecPath(ticketKey, ticketsJsonPath) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    return null;
  }

  const resolvedTicketsPath = path.resolve(ticketsJsonPath);
  const ticketsDir = path.dirname(resolvedTicketsPath);
  const specsDir = path.resolve(ticketsDir, 'specs');

  // Read Tickets.json to find the ticket
  let ticketsData;
  try {
    const raw = fs.readFileSync(resolvedTicketsPath, 'utf8');
    ticketsData = JSON.parse(raw);
  } catch {
    // Cannot read Tickets.json — fall back to direct path
    return path.resolve(specsDir, ticketKey + '.md');
  }

  // Find the ticket by matching phase and ticket id
  const phases = ticketsData.phases || [];
  for (const phase of phases) {
    const tickets = phase.tickets || [];
    for (const ticket of tickets) {
      if (ticket.id === parsed.ticketId) {
        const referenceSection = ticket.referenceSection;
        if (referenceSection) {
          // referenceSection is relative to the directory containing Tickets.json
          const specPath = path.resolve(ticketsDir, referenceSection);
          // Return null if the resolved spec file does not exist
          if (!fs.existsSync(specPath)) {
            return null;
          }
          return specPath;
        }
        // Ticket found but no referenceSection — return null
        return null;
      }
    }
  }

  // Ticket key not found in Tickets.json
  return null;
}

module.exports = { resolveSpecPath, parseTicketKey };
