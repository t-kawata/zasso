#!/usr/bin/env node

/**
 * create-spec.js — Create implementation specification (spec) file
 *
 * New naming convention: {ticketsDir}/specs/{ticketKey}.md
 * ticketsDir is the directory of Tickets.json, ticketKey is "P0-1" format.
 *
 * CLI: create-spec.js <ticketKey> [title] [status] [--tickets=<path>]
 *
 * Arguments:
 *   ticketKey   — required. Ticket key (e.g., "P0-1", "PX-5")
 *   title       — optional. Ticket title (defaults to stdin JSON title)
 *   status      — optional. Initial status (default: "draft")
 *   --tickets=  — optional. Path to Tickets.json (default: "Tickets.json")
 *
 * Accepts JSON { title, status } from stdin (lower priority than CLI args).
 */

const fs = require('fs');
const path = require('path');
const { resolveTicketSpecPath, generateSlug, makeUniqueSlug, collectSlugs } = require('../lib/tickets');

function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey = '';
  let title = '';
  let status = 'draft';
  let ticketsPath = 'Tickets.json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    } else if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    } else if (!ticketKey && !arg.startsWith('-')) {
      ticketKey = arg;
    } else if (ticketKey && !title && !arg.startsWith('-')) {
      title = arg;
    } else if (ticketKey && title && !status && !arg.startsWith('-')) {
      status = arg;
    }
  }

  return { ticketKey, title, status, ticketsPath };
}

function main() {
  const { ticketKey, title: cliTitle, status: cliStatus, ticketsPath: rawTicketsPath } = parseArgs();

  // ticketKey is required
  if (!ticketKey) {
    console.log(JSON.stringify({
      success: false,
      error: 'Usage: create-spec.js <ticketKey> [title] [status] [--tickets=<path>]',
    }));
    process.exit(1);
  }

  // Read title/status from stdin (lower priority than CLI args)
  let input = {};
  try {
    const stdin = fs.readFileSync(process.stdin.fd, 'utf8').trim();
    if (stdin) input = JSON.parse(stdin);
  } catch (e) { /* ignore */ }

  const title = cliTitle || input.title;
  if (!title) {
    console.log(JSON.stringify({ success: false, error: 'Title is required. Pass as 2nd arg or via stdin JSON.' }));
    process.exit(1);
  }

  const status = cliStatus || input.status || 'draft';
  const ticketsPath = path.resolve(rawTicketsPath);
  const ticketsDir = path.dirname(ticketsPath);

  // New naming convention: {ticketsDir}/specs/{ticketKey}.md
  const specPath = resolveTicketSpecPath(ticketsDir, ticketKey);
  const specsDir = path.dirname(specPath);

  // Create specs directory if needed
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  // Prevent overwriting existing files
  if (fs.existsSync(specPath)) {
    console.log(JSON.stringify({ success: false, error: `Spec already exists at ${specPath}` }));
    process.exit(1);
  }

  // Slug is for frontmatter only (not used in filename)
  const slug = makeUniqueSlug(generateSlug(title), collectSlugs(specsDir));

  // Create spec file
  const now = new Date().toISOString().slice(0, 10);
  const frontmatter = {
    ticket_id: ticketKey,
    title,
    slug,
    status,
    created_at: now,
    updated_at: now,
  };
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  const body = `# ${title}\n\n## Summary\n\n<!-- このチケットで達成することの簡潔な説明 -->\n\n## Background\n\n<!-- なぜこのチケットが必要か -->\n\n## Scope\n\n<!-- 何をするか -->\n\n## Notes\n\n`;
  const content = `---\n${yaml}\n---\n\n${body}`;

  fs.writeFileSync(specPath, content, 'utf8');
  console.log(JSON.stringify({
    success: true,
    ticketKey,
    title,
    slug,
    status,
    specPath,
  }));
}

if (require.main === module) main();
module.exports = { main };
