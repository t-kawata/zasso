#!/usr/bin/env node
'use strict';

/**
 * discover-changed-tickets.js — map changed files to the tickets they affect.
 *
 * Resolve may run without a ticket argument. Two deterministic paths find the
 * tickets: the `[::TICKET::]` annotation a changed source file carries, and the
 * `targetStubs` / `targetCrimes` file a ticket already owns.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  loadTicketDocument,
  argumentValue,
  ticketKeyOf,
} = require('./lib/gate-report.js');

const TICKET_KEY_RE = /^(?:PX|P-?\d+)-\d+$/;

/** The ticket keys a text's [::TICKET::] annotations name. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function parseAnnotationTicketKeys(text) {
  const keys = new Set();
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/\[::TICKET::\]\s+(.+?)\s+changes\./);
    if (!match) continue;
    for (const part of match[1].split(',')) {
      const key = part.trim();
      if (TICKET_KEY_RE.test(key)) keys.add(key);
    }
  }
  return [...keys];
}

/** Run git and return its non-empty lines, or [] when git is unavailable. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function gitLines(gitArguments, cwd) {
  try {
    return execFileSync('git', gitArguments, {
      cwd,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).split('\n').filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * The files changed in the working tree, or against a base revision.
 *
 * @param {{ cwd: string, base?: string }} input
 * @returns {string[]}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function collectChangedFiles({ cwd, base }) {
  const files = new Set();

  if (base) {
    for (const file of gitLines(['diff', '--name-only', base], cwd)) files.add(file);
  } else {
    for (const line of gitLines(['status', '--porcelain'], cwd)) {
      const statusPath = line.slice(3).trim();
      if (statusPath.length === 0) continue;
      const renamed = statusPath.split(' -> ');
      files.add(renamed[renamed.length - 1]);
    }
  }

  for (const file of gitLines(['ls-files', '--others', '--exclude-standard'], cwd)) files.add(file);
  return [...files].filter((file) => file.length > 0);
}

/** The annotation keys one file carries, or [] when it cannot be read. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function annotationKeysOf(filePath) {
  try {
    return parseAnnotationTicketKeys(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

/** Every ticket in a document. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function allTickets(document) {
  return (document?.phases ?? []).flatMap((phase) => phase?.tickets ?? []);
}

/** The file paths a ticket's targets own. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function targetFiles(ticket) {
  const items = [
    ...(Array.isArray(ticket.targetStubs) ? ticket.targetStubs : []),
    ...(Array.isArray(ticket.targetCrimes) ? ticket.targetCrimes : []),
  ];
  return items.map((item) => item?.file).filter((file) => typeof file === 'string' && file.length > 0);
}

/** Whether a changed file is the target file or lives under it. */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function fileMatchesTarget(changedFile, targetFile) {
  const changed = changedFile.replace(/\\/g, '/');
  const target = targetFile.replace(/\\/g, '/');
  return changed === target || changed.startsWith(target + '/');
}

/**
 * Map changed files to ticket keys.
 *
 * @param {{ document: object, files: string[], cwd: string }} input
 * @returns {{ ticketKeys: string[], files: string[], byTicket: object }}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function mapFilesToTickets({ document, files, cwd }) {
  const byTicket = {};

  const add = (ticketKey, kind, file) => {
    if (!byTicket[ticketKey]) byTicket[ticketKey] = { annotations: [], targets: [] };
    if (!byTicket[ticketKey][kind].includes(file)) byTicket[ticketKey][kind].push(file);
  };

  for (const file of files) {
    for (const ticketKey of annotationKeysOf(path.resolve(cwd, file))) {
      add(ticketKey, 'annotations', file);
    }
  }

  for (const ticket of allTickets(document)) {
    const ticketKey = ticketKeyOf(ticket);
    for (const targetFile of targetFiles(ticket)) {
      for (const file of files) {
        if (fileMatchesTarget(file, targetFile)) add(ticketKey, 'targets', file);
      }
    }
  }

  return {
    ticketKeys: Object.keys(byTicket).sort(),
    files,
    byTicket,
  };
}

/**
 * Discover the tickets affected by a set of changed files.
 *
 * @param {object} input
 * @returns {{ ticketKeys: string[], files: string[], byTicket: object }}
 */
// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function discoverChangedTickets({ cwd = process.cwd(), ticketsPath, ticketsDocument, base, files }) {
  const document = ticketsDocument ?? loadTicketDocument(ticketsPath);
  const changedFiles = files === undefined ? collectChangedFiles({ cwd, base }) : files;
  return mapFilesToTickets({ document, files: changedFiles, cwd });
}

// [::TICKET::] PX-399 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-399 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketsPath = path.resolve(argumentValue(args, 'tickets') || 'Tickets.json');
  const filesArgument = argumentValue(args, 'files');
  const files = filesArgument === undefined
    ? undefined
    : filesArgument.split(',').map((file) => file.trim()).filter((file) => file.length > 0);

  try {
    const result = discoverChangedTickets({
      cwd: process.cwd(),
      ticketsPath,
      base: argumentValue(args, 'base'),
      files,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ticketKeys: [],
      files: files ?? [],
      byTicket: {},
      error: error.message,
    }) + '\n');
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  parseAnnotationTicketKeys,
  collectChangedFiles,
  targetFiles,
  mapFilesToTickets,
  discoverChangedTickets,
};
