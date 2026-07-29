#!/usr/bin/env node

/**
 * regress-reviewed-to-todo.js — Demote tickets with unresolved STUBs to "todo"
 *
 * 1. Runs `make stubs` to enumerate all STUBs
 * 2. Extracts resolve-by-ticket keys from STUB markers
 *    (ticket key appearing immediately after "[::STUB::]")
 * 3. For each such ticket whose status is "reviewed",
 *    changes it to "todo" in Tickets.json
 *
 * A ticket mentioned only in STUB descriptions ("once P4-1 types are stable")
 * is NOT counted — only the primary resolve-by-ticket matters.
 *
 * Usage:
 *   node .claude/scripts/tickets/regress-reviewed-to-todo.js
 *     --tickets-path=<Tickets.json>
 *     [--dry-run]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_KEY_RE = /\[::STUB::\]\s+(P\d+-\d+)/;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false };
  for (const a of args) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--tickets-path=')) opts.ticketsPath = a.slice('--tickets-path='.length);
    else {
      console.error(`[ERROR] Unknown argument: ${a}`);
      console.error('Usage: node regress-reviewed-to-todo.js --tickets-path=<path> [--dry-run]');
      process.exit(2);
    }
  }
  if (!opts.ticketsPath) {
    console.error('[ERROR] --tickets-path is required');
    process.exit(2);
  }
  return opts;
}

function runMakeStubs(cwd) {
  try {
    const stdout = execSync('make stubs', { cwd, encoding: 'utf-8', timeout: 60000 });
    return stdout;
  } catch (err) {
    console.error(`[ERROR] "make stubs" failed: ${err.message}`);
    process.exit(1);
  }
}

function extractResolveByTicketKeys(stubs) {
  const keys = new Set();
  for (const stub of stubs) {
    if (!stub.content) continue;
    const m = stub.content.match(STUB_KEY_RE);
    if (m) {
      keys.add(m[1]);
    }
  }
  return keys;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();
  const ticketsPath = path.resolve(opts.ticketsPath);
  const projectDir = path.dirname(path.dirname(path.dirname(ticketsPath))); // siprs root

  // Step 1: run make stubs
  const stdout = runMakeStubs(projectDir);
  let data;
  try {
    data = JSON.parse(stdout);
  } catch (err) {
    console.error(`[ERROR] Failed to parse "make stubs" output: ${err.message}`);
    process.exit(1);
  }

  if (!data.success || !Array.isArray(data.stubs)) {
    console.error('[ERROR] Unexpected "make stubs" output structure');
    process.exit(1);
  }

  // Step 2: extract resolve-by-ticket keys
  const stubTicketKeys = extractResolveByTicketKeys(data.stubs);
  console.log(`Resolve-by-ticket keys found in ${data.stubs.length} STUBs:`);
  const sortedKeys = Array.from(stubTicketKeys).sort();
  for (const k of sortedKeys) console.log(`  ${k}`);
  console.log('');

  // Step 3: read Tickets.json
  if (!fs.existsSync(ticketsPath)) {
    console.error(`[ERROR] Tickets.json not found: ${ticketsPath}`);
    process.exit(1);
  }

  const ticketsRaw = fs.readFileSync(ticketsPath, 'utf-8');
  let ticketsJson;
  try {
    ticketsJson = JSON.parse(ticketsRaw);
  } catch (err) {
    console.error(`[ERROR] Failed to parse Tickets.json: ${err.message}`);
    process.exit(1);
  }

  const phases = ticketsJson.phases;
  if (!Array.isArray(phases)) {
    console.error('[ERROR] Tickets.json has no "phases" array');
    process.exit(1);
  }

  // Step 4: find and demote tickets
  const changes = [];
  for (const phase of phases) {
    const pid = phase.id;
    const tickets = phase.tickets || [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const key = ticket.key || `P${pid}-${i + 1}`; // derive if not stored
      if (stubTicketKeys.has(key) && ticket.status === 'reviewed') {
        changes.push({ key, oldStatus: ticket.status, newStatus: 'todo' });
        if (!opts.dryRun) {
          ticket.status = 'todo';
        }
      }
    }
  }

  // Step 5: report
  if (changes.length === 0) {
    console.log('No tickets to demote — all are consistent.');
    process.exit(0);
  }

  console.log(`Tickets to demote from "reviewed" → "todo":`);
  for (const c of changes) {
    const suffix = opts.dryRun ? '' : ' ✓';
    console.log(`  ${c.key}: ${c.oldStatus} → ${c.newStatus}${suffix}`);
  }
  console.log(`Total: ${changes.length} ticket(s)`);

  if (opts.dryRun) {
    console.log('');
    console.log('[DRY-RUN] No changes written. Re-run without --dry-run to apply.');
    process.exit(0);
  }

  // Step 6: write back
  fs.writeFileSync(ticketsPath, JSON.stringify(ticketsJson, null, 2) + '\n', 'utf-8');
  console.log('');
  console.log(`Written to ${ticketsPath}`);
}

main();
